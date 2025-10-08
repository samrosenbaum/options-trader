"""Pipeline orchestration for the Sharp Move scanner."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
yaml = None
try:  # Use the repo's YAML loader if available.
    import yaml  # type: ignore
except Exception:  # pragma: no cover - fallback to stdlib safe loader
    from src.config._yaml_compat import safe_load as _safe_load  # type: ignore
    yaml = None
else:  # pragma: no cover - executed when PyYAML is available
    _safe_load = yaml.safe_load  # type: ignore

from . import adapters
from .ev import (
    RiskInputs,
    breakeven_price,
    expected_move,
    expected_value_per_contract,
    probability_of_profit,
    theoretical_price,
    theta_overnight,
)
from .features import TechnicalSnapshot, compute_technical_snapshot, realized_volatility
from .scoring import EventWindows, ScoringWeights, score_row

LOGGER = logging.getLogger("sharp_move.pipeline")


@dataclass(frozen=True)
class Filters:
    min_liquidity: int
    max_spread_pct: float
    call_delta_range: Tuple[float, float]
    put_delta_range: Tuple[float, float]


@dataclass(frozen=True)
class SharpMoveScannerConfig:
    universe: List[str]
    filters: Filters
    weights: ScoringWeights
    event_windows: EventWindows
    risk_free_rate: float
    cache_ttl_minutes: int = 120

    @staticmethod
    def from_dict(payload: Dict[str, object]) -> "SharpMoveScannerConfig":
        universe_cfg = payload.get("universe", {})
        filters_cfg = payload.get("filters", {})
        weights_cfg = payload.get("scoring_weights", {})
        events_cfg = payload.get("event_windows", {})
        risk_cfg = payload.get("risk", {})
        io_cfg = payload.get("io", {})
        return SharpMoveScannerConfig(
            universe=list(universe_cfg.get("default_tickers", [])),
            filters=Filters(
                min_liquidity=int(filters_cfg.get("min_liquidity", 500)),
                max_spread_pct=float(filters_cfg.get("max_spread_pct", 0.06)),
                call_delta_range=tuple(filters_cfg.get("call_delta_range", (0.25, 0.65))),
                put_delta_range=tuple(filters_cfg.get("put_delta_range", (-0.65, -0.25))),
            ),
            weights=ScoringWeights(
                w_event=float(weights_cfg.get("w_event", 0.3)),
                w_vol=float(weights_cfg.get("w_vol", 0.2)),
                w_tech=float(weights_cfg.get("w_tech", 0.25)),
                w_flow=float(weights_cfg.get("w_flow", 0.15)),
                w_micro=float(weights_cfg.get("w_micro", 0.1)),
            ),
            event_windows=EventWindows(
                earnings_days=int(events_cfg.get("earnings_days", 3)),
                macro_days=int(events_cfg.get("macro_days", 1)),
            ),
            risk_free_rate=float(risk_cfg.get("risk_free_rate", 0.03)),
            cache_ttl_minutes=int(io_cfg.get("cache_ttl_minutes", 120)),
        )


DEFAULT_CONFIG_PATH = Path("configs/sharp_move.yaml")


def load_config(path: Path = DEFAULT_CONFIG_PATH) -> SharpMoveScannerConfig:
    with path.open("r", encoding="utf-8") as handle:
        raw = _safe_load(handle.read()) or {}
    if not isinstance(raw, dict):
        raise ValueError("Sharp Move config must be a mapping")
    return SharpMoveScannerConfig.from_dict(raw)


@dataclass
class TickerContext:
    symbol: str
    history: pd.DataFrame
    technicals: TechnicalSnapshot
    hv20: Optional[float]
    iv_rank_helper: Dict[str, float]
    event_context: Dict[str, object]


class SharpMoveScanner:
    """High level orchestrator that computes and scores option contracts."""

    def __init__(self, config: SharpMoveScannerConfig, *, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or LOGGER

    def _prepare_ticker_context(self, symbol: str) -> Optional[TickerContext]:
        history = adapters.get_price_history(symbol)
        if history.empty:
            self.logger.warning("No price history for %s", symbol)
            return None
        technicals = compute_technical_snapshot(history)
        hv20 = realized_volatility(history, window=20)
        rv_series = history["Close"].pct_change().rolling(20).std() * np.sqrt(252)
        rv_series = rv_series.dropna()
        rv_min = float(rv_series.min()) if not rv_series.empty else 0.0
        rv_max = float(rv_series.max()) if not rv_series.empty else 0.0
        helper = {"rv_min": rv_min, "rv_max": rv_max}
        event_ctx = adapters.get_event_context(symbol, max(self.config.event_windows.earnings_days, self.config.event_windows.macro_days))
        return TickerContext(
            symbol=symbol,
            history=history,
            technicals=technicals,
            hv20=hv20,
            iv_rank_helper=helper,
            event_context=event_ctx,
        )

    def _eligible_contracts(self, frame: pd.DataFrame, include_calls: bool, include_puts: bool) -> pd.DataFrame:
        calls_mask = frame["type"].str.lower() == "call"
        puts_mask = frame["type"].str.lower() == "put"
        if not include_calls:
            frame = frame.loc[~calls_mask]
        if not include_puts:
            frame = frame.loc[~puts_mask]
        return frame

    def _apply_filters(self, df: pd.DataFrame) -> pd.DataFrame:
        filters = self.config.filters
        liquidity = (df["volume"].fillna(0) + df["open_interest"].fillna(0))
        filtered = df[liquidity >= filters.min_liquidity]
        filtered = filtered[filtered["spread_pct"] <= filters.max_spread_pct]
        call_mask = filtered["type"].str.lower() == "call"
        put_mask = filtered["type"].str.lower() == "put"
        filtered = filtered[
            (~call_mask) | (
                (filtered["delta"] >= filters.call_delta_range[0])
                & (filtered["delta"] <= filters.call_delta_range[1])
            )
        ]
        filtered = filtered[
            (~put_mask)
            | (
                (filtered["delta"] >= filters.put_delta_range[0])
                & (filtered["delta"] <= filters.put_delta_range[1])
            )
        ]
        return filtered

    def _compute_iv_rank(self, iv: float, helper: Dict[str, float]) -> float:
        rv_min = helper.get("rv_min", 0.0)
        rv_max = helper.get("rv_max", 0.0)
        if rv_max <= rv_min:
            return 50.0
        return float(max(0.0, min(100.0, (iv - rv_min) / (rv_max - rv_min) * 100)))

    def _enrich_contracts(
        self,
        frame: pd.DataFrame,
        ctx: TickerContext,
        as_of: datetime,
        dte: int,
        include_flow: bool,
    ) -> pd.DataFrame:
        df = frame.copy()
        df["asof"] = as_of
        df["dte"] = dte
        df["mid"] = np.where((df["bid"] > 0) & (df["ask"] > 0), (df["bid"] + df["ask"]) / 2.0, df.get("lastPrice", 0))
        if "lastPrice" in df:
            df["mid"] = df["mid"].where(df["mid"] > 0, df["lastPrice"])
        df["mid"] = df["mid"].astype(float)
        df["spread_pct"] = (df["ask"] - df["bid"]).clip(lower=0) / df["mid"].replace(0, np.nan)
        df["spread_pct"] = df["spread_pct"].fillna(1.0)
        df["volume"] = df.get("volume", 0).fillna(0).astype(float)
        df["open_interest"] = df.get("openInterest", 0).fillna(0).astype(float)
        df["iv"] = df.get("impliedVolatility", 0).astype(float)
        df["delta"] = df.get("delta", np.nan)
        df["gamma"] = df.get("gamma", np.nan)
        df["theta"] = df.get("theta", np.nan)
        df["vega"] = df.get("vega", np.nan)

        risk_free = self.config.risk_free_rate
        rows: List[Dict[str, object]] = []
        for _, row in df.iterrows():
            option_type = str(row.get("type", "")).lower()
            spot = float(row.get("stockPrice", adapters.get_spot_price(ctx.symbol)) or 0.0)
            strike = float(row.get("strike", 0.0) or 0.0)
            bid = float(row.get("bid", 0.0) or 0.0)
            ask = float(row.get("ask", 0.0) or 0.0)
            mid = float(row.get("mid", 0.0) or 0.0)
            if mid <= 0:
                mid = (bid + ask) / 2 if bid > 0 and ask > 0 else float(row.get("lastPrice", 0.0) or 0.0)
            iv = float(row.get("iv", 0.0) or 0.0)
            iv = max(iv, 0.01)
            greeks_missing = any(pd.isna(row.get(col)) for col in ("delta", "gamma", "theta", "vega"))
            risk_inputs = RiskInputs(
                spot=spot,
                strike=strike,
                option_type="call" if option_type == "call" else "put",
                mid_price=mid,
                iv=iv,
                dte_days=dte,
                risk_free_rate=risk_free,
            )
            breakeven = breakeven_price(strike, mid, risk_inputs.option_type)
            dist_to_be_pct = (breakeven - spot) / spot if spot > 0 else 0.0
            pop = probability_of_profit(risk_inputs, breakeven)
            exp_move = expected_move(spot, iv, dte)
            theo_price = theoretical_price(risk_inputs)
            exp_value = expected_value_per_contract(risk_inputs, theoretical=theo_price)
            theta_over = theta_overnight(risk_inputs)
            if greeks_missing:
                d1_dte = max(dte / 365.0, 1e-6)
                sqrt_t = np.sqrt(d1_dte)
                from scipy.stats import norm as _norm

                d1 = (np.log(max(spot, 1e-6) / max(strike, 1e-6)) + (risk_free + 0.5 * iv**2) * d1_dte) / (iv * sqrt_t)
                d2 = d1 - iv * sqrt_t
                if option_type == "call":
                    delta = float(_norm.cdf(d1))
                    theta_val = -(
                        spot * _norm.pdf(d1) * iv / (2 * sqrt_t)
                    ) - risk_free * strike * np.exp(-risk_free * d1_dte) * _norm.cdf(d2)
                else:
                    delta = float(_norm.cdf(d1) - 1)
                    theta_val = -(
                        spot * _norm.pdf(d1) * iv / (2 * sqrt_t)
                    ) + risk_free * strike * np.exp(-risk_free * d1_dte) * _norm.cdf(-d2)
                gamma = float(_norm.pdf(d1) / (spot * iv * sqrt_t)) if spot > 0 else 0.0
                vega = float(spot * _norm.pdf(d1) * sqrt_t / 100)
                theta = float(theta_val / 365.0)
            else:
                delta = float(row.get("delta", 0.0) or 0.0)
                gamma = float(row.get("gamma", 0.0) or 0.0)
                theta = float(row.get("theta", 0.0) or 0.0)
                vega = float(row.get("vega", 0.0) or 0.0)

            iv_rank = self._compute_iv_rank(iv, ctx.iv_rank_helper)
            hv20 = ctx.hv20 if ctx.hv20 is not None else 0.0
            flow_data = adapters.fetch_flow_metrics(ctx.symbol, row.get("expiration")) if include_flow else {"flow_calls_ratio": None, "flow_net_premium": None}

            expiry_raw = row.get("expiration")
            try:
                expiry = pd.to_datetime(expiry_raw).date()
            except Exception:
                expiry = expiry_raw
            enriched = {
                "ticker": ctx.symbol,
                "asof": as_of,
                "spot": spot,
                "expiry": expiry,
                "dte": dte,
                "type": option_type,
                "strike": strike,
                "bid": bid,
                "ask": ask,
                "mid": mid,
                "spread_pct": float(row.get("spread_pct", 0.0)),
                "volume": float(row.get("volume", 0.0)),
                "open_interest": float(row.get("open_interest", 0.0)),
                "iv": iv,
                "iv_rank": iv_rank,
                "delta": delta,
                "gamma": gamma,
                "theta": theta,
                "vega": vega,
                "breakeven": breakeven,
                "dist_to_be_pct": dist_to_be_pct * 100.0,
                "expected_move": exp_move,
                "prob_profit": pop,
                "exp_value_per_contract": exp_value,
                "theta_overnight": theta_over,
                "hv20": hv20,
                "iv_minus_hv": iv - hv20 if hv20 else iv,
                "bb_width_pct": ctx.technicals.bb_width_pct,
                "ema8_gt_ema21": ctx.technicals.ema8_gt_ema21,
                "breakout_20d_high": ctx.technicals.breakout_20d_high,
                "breakout_20d_low": ctx.technicals.breakout_20d_low,
                "rsi14": ctx.technicals.rsi14,
                "vol_spike": ctx.technicals.volume_spike,
                "atr14": ctx.technicals.atr14,
            }
            enriched.update(ctx.event_context)
            enriched.update(flow_data)
            rows.append(enriched)
        return pd.DataFrame(rows)

    def _build_explanation(self, row: pd.Series) -> str:
        pieces: List[str] = []
        if bool(row.get("event_flag")) and row.get("event_type"):
            days = row.get("days_to_event")
            if days is not None:
                pieces.append(f"{row['event_type']} in {int(days)}d")
            else:
                pieces.append(str(row["event_type"]))
        if row.get("dist_to_be_pct") is not None and row.get("expected_move"):
            if abs(float(row["dist_to_be_pct"]) or 0.0) <= float(row["expected_move"]) or float(row["expected_move"]) == 0:
                pieces.append("BE within exp move")
        if row.get("ema8_gt_ema21"):
            pieces.append("EMA8>21")
        if row.get("breakout_20d_high"):
            pieces.append("20d breakout")
        if row.get("vol_spike") and float(row["vol_spike"]) >= 1.2:
            pieces.append("Volume spike")
        if row.get("spread_pct") is not None and float(row["spread_pct"]) <= self.config.filters.max_spread_pct:
            pieces.append("Tight spread")
        theta = row.get("theta_overnight")
        if theta is not None and theta != 0:
            pieces.append(f"θ≈{float(theta):.1f}")
        if not pieces:
            pieces.append("Solid risk/flow balance")
        return "; ".join(pieces[:4])

    def run(
        self,
        *,
        tickers: Optional[Sequence[str]] = None,
        exp_window: Tuple[int, int] = (1, 7),
        include_calls: bool = True,
        include_puts: bool = True,
        min_score: float = 0.0,
        max_per_ticker: int = 5,
        include_flow: bool = True,
    ) -> pd.DataFrame:
        symbols = list(tickers) if tickers else list(self.config.universe)
        as_of = adapters.as_of_timestamp()
        all_rows: List[pd.DataFrame] = []
        window_min, window_max = exp_window
        for symbol in symbols:
            ctx = self._prepare_ticker_context(symbol)
            if ctx is None:
                continue
            expirations = adapters.list_expirations(symbol)
            if not expirations:
                continue
            spot = adapters.get_spot_price(symbol)
            for expiration in expirations:
                dte = (expiration - as_of.date()).days
                if dte < window_min or dte > window_max:
                    continue
                chain = adapters.get_options_chain(symbol, expiration)
                if chain.empty:
                    continue
                chain = self._eligible_contracts(chain, include_calls, include_puts)
                if chain.empty:
                    continue
                enriched = self._enrich_contracts(chain, ctx, as_of, dte, include_flow)
                if enriched.empty:
                    continue
                enriched["spot"] = enriched["spot"].fillna(spot)
                all_rows.append(enriched)
        if not all_rows:
            return pd.DataFrame()
        combined = pd.concat(all_rows, ignore_index=True)
        combined["spread_pct"] = combined["spread_pct"].astype(float)
        filtered = self._apply_filters(combined)
        if filtered.empty:
            return pd.DataFrame()
        scores: List[Dict[str, object]] = []
        for _, row in filtered.iterrows():
            breakdown = score_row(row.to_dict(), self.config.weights, self.config.event_windows)
            scores.append({"score": breakdown.total, "components": breakdown.components})
        score_frame = pd.DataFrame(scores)
        filtered = filtered.reset_index(drop=True)
        filtered["score"] = score_frame["score"]
        filtered["score_components"] = score_frame["components"]
        filtered["explanation"] = filtered.apply(self._build_explanation, axis=1)
        result = filtered[filtered["score"] >= min_score]
        if result.empty:
            return pd.DataFrame()
        result.sort_values(["score", "prob_profit"], ascending=[False, False], inplace=True)
        if max_per_ticker:
            result = result.groupby("ticker").head(max_per_ticker).reset_index(drop=True)
        columns = [
            "ticker",
            "asof",
            "spot",
            "expiry",
            "dte",
            "type",
            "strike",
            "bid",
            "ask",
            "mid",
            "spread_pct",
            "volume",
            "open_interest",
            "iv",
            "iv_rank",
            "delta",
            "gamma",
            "theta",
            "vega",
            "breakeven",
            "dist_to_be_pct",
            "expected_move",
            "prob_profit",
            "exp_value_per_contract",
            "event_flag",
            "days_to_event",
            "event_type",
            "bb_width_pct",
            "ema8_gt_ema21",
            "breakout_20d_high",
            "rsi14",
            "vol_spike",
            "flow_calls_ratio",
            "flow_net_premium",
            "score",
            "explanation",
        ]
        for col in ("bb_width_pct", "rsi14", "vol_spike"):
            if col not in result:
                result[col] = np.nan
        for col in columns:
            if col not in result.columns:
                result[col] = np.nan
        return result[columns].reset_index(drop=True)


__all__ = ["SharpMoveScanner", "SharpMoveScannerConfig", "load_config"]
