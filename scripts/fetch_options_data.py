"""Fetch option chains and evaluate contracts using the modular scoring engine."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, Iterable, List, Mapping, Sequence, Tuple
from uuid import uuid4

import numpy as np
import pandas as pd
import yfinance as yf
from scipy import stats
from scipy.stats import norm

from src.config import AppSettings, get_settings
from src.models.option import OptionContract, OptionGreeks
from src.models.signal import Signal
from src.scoring import CompositeScoringEngine
from src.storage import OptionSnapshot, RunMetadata, SignalSnapshot
from src.storage.sqlite import SQLiteStorage


def get_options_chain(symbol: str) -> pd.DataFrame | None:
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        current_price = info.get("currentPrice", info.get("regularMarketPrice", 0.0))
        expirations = ticker.options
        if not expirations:
            return None

        all_options: List[pd.DataFrame] = []
        for exp in expirations[:2]:
            opt_chain = ticker.option_chain(exp)
            calls = opt_chain.calls.assign(type="call", expiration=exp)
            puts = opt_chain.puts.assign(type="put", expiration=exp)
            options = pd.concat([calls, puts], ignore_index=True)
            options["symbol"] = symbol
            options["stockPrice"] = current_price
            all_options.append(options)

        return pd.concat(all_options, ignore_index=True) if all_options else None
    except Exception as exc:  # pragma: no cover - defensive logging
        print(f"Error fetching options for {symbol}: {exc}")
        return None


def calculate_greeks(row: pd.Series) -> OptionGreeks:
    S = float(row.get("stockPrice", 0.0))
    K = float(row.get("strike", 0.0))
    expiration = pd.to_datetime(row.get("expiration"))
    T = max((expiration - datetime.utcnow()).days / 365.0, 0.0)
    sigma = float(row.get("impliedVolatility", 0.3))
    r = 0.05

    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return OptionGreeks()

    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)

    if row.get("type") == "call":
        delta = norm.cdf(d1)
        theta = -(S * norm.pdf(d1) * sigma) / (2 * np.sqrt(T)) - r * K * np.exp(-r * T) * norm.cdf(d2)
    else:
        delta = -norm.cdf(-d1)
        theta = -(S * norm.pdf(d1) * sigma) / (2 * np.sqrt(T)) + r * K * np.exp(-r * T) * norm.cdf(-d2)

    gamma = norm.pdf(d1) / (S * sigma * np.sqrt(T))
    vega = S * norm.pdf(d1) * np.sqrt(T) / 100

    return OptionGreeks(
        delta=round(float(delta), 4),
        gamma=round(float(gamma), 6),
        theta=round(float(theta) / 365, 4),
        vega=round(float(vega), 4),
    )


def calculate_iv_rank(symbol: str, current_iv: float) -> float:
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1y")
        returns = np.log(hist["Close"] / hist["Close"].shift(1))
        rolling_vol = returns.rolling(window=30).std() * np.sqrt(252) * 100
        iv_low = float(rolling_vol.min())
        iv_high = float(rolling_vol.max())
        if iv_high == iv_low:
            return 50.0
        iv_rank = ((current_iv - iv_low) / (iv_high - iv_low)) * 100
        return round(max(0.0, min(100.0, iv_rank)), 2)
    except Exception:
        return 50.0


def calculate_iv_anomaly(symbol: str, current_iv: float) -> Dict[str, float]:
    """Return IV z-score, percentile, and realized vol spread metrics."""

    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1y")
        closes = hist["Close"].dropna()
        if closes.empty:
            raise ValueError("no history")

        returns = np.log(closes / closes.shift(1)).dropna()
        realized = returns.rolling(window=30).std() * np.sqrt(252) * 100
        realized = realized.dropna()
        if realized.empty:
            raise ValueError("insufficient realized volatility history")

        mean_iv = float(realized.mean())
        std_iv = float(realized.std(ddof=0))
        if std_iv == 0:
            raise ValueError("zero volatility dispersion")

        zscore = (current_iv - mean_iv) / std_iv
        percentile = stats.percentileofscore(realized, current_iv) / 100
        latest_realized = float(realized.iloc[-1])
        spread = current_iv - latest_realized

        return {
            "zscore": float(zscore),
            "percentile": float(percentile),
            "current_iv": float(current_iv),
            "mean_iv": mean_iv,
            "std_iv": std_iv,
            "realized_vol": latest_realized,
            "iv_rv_spread": float(spread),
            "observations": int(len(realized)),
        }
    except Exception:
        return {
            "zscore": None,
            "percentile": None,
            "current_iv": float(current_iv),
            "mean_iv": None,
            "std_iv": None,
            "realized_vol": None,
            "iv_rv_spread": None,
            "observations": 0,
        }


def detect_gamma_squeeze(options_df: pd.DataFrame, symbol: str, current_price: float) -> Dict[str, object]:
    """Estimate dealer gamma positioning around the underlying price."""

    try:
        if options_df.empty:
            return {"score": 0.0, "risk_level": "NONE", "reasons": []}

        frame = options_df.copy()
        frame["openInterest"] = frame["openInterest"].fillna(0).astype(float)
        frame["volume"] = frame["volume"].fillna(0).astype(float)
        frame["strike"] = frame["strike"].astype(float)

        # Calculate option gamma for each row to approximate dealer exposure.
        frame["gamma"] = frame.apply(lambda row: calculate_greeks(row).gamma, axis=1)

        exposures: List[Dict[str, float]] = []
        unique_strikes = sorted(frame["strike"].dropna().unique())

        for strike in unique_strikes:
            calls = frame[(frame["type"] == "call") & (frame["strike"] == strike)]
            puts = frame[(frame["type"] == "put") & (frame["strike"] == strike)]

            call_gamma = float((calls["gamma"] * calls["openInterest"]).sum())
            put_gamma = float((puts["gamma"] * puts["openInterest"]).sum())

            call_oi = float(calls["openInterest"].sum())
            put_oi = float(puts["openInterest"].sum())
            call_volume = float(calls["volume"].sum())

            # Assume dealers are net short calls (negative gamma) and net long puts (positive gamma).
            dealer_gamma = (-call_gamma * 100.0) + (put_gamma * 100.0)

            exposures.append(
                {
                    "strike": float(strike),
                    "net_gamma": dealer_gamma,
                    "call_oi": call_oi,
                    "put_oi": put_oi,
                    "call_volume": call_volume,
                }
            )

        if not exposures:
            return {"score": 0.0, "risk_level": "NONE", "reasons": []}

        exposures.sort(key=lambda item: item["strike"])

        # Identify strikes near the spot price where negative gamma is concentrated.
        nearby = [
            exp
            for exp in exposures
            if current_price > 0 and 0.95 <= exp["strike"] / current_price <= 1.05
        ]

        if not nearby:
            return {
                "score": 5.0,
                "risk_level": "LOW",
                "reasons": ["No concentrated dealer short gamma near spot"],
                "exposures": exposures[:10],
            }

        most_negative = min(nearby, key=lambda item: item["net_gamma"])
        max_short_gamma = most_negative["net_gamma"]
        max_strike = most_negative["strike"]

        def find_gamma_flip(nodes: List[Dict[str, float]]) -> float | None:
            for idx in range(len(nodes) - 1):
                left = nodes[idx]["net_gamma"]
                right = nodes[idx + 1]["net_gamma"]
                if left <= 0 and right >= 0:
                    return nodes[idx + 1]["strike"]
            return None

        gamma_flip = find_gamma_flip(exposures)

        severity = abs(max_short_gamma)
        if severity >= 150_000:
            risk_level = "EXTREME"
            base_score = 65.0
        elif severity >= 80_000:
            risk_level = "HIGH"
            base_score = 50.0
        elif severity >= 40_000:
            risk_level = "MODERATE"
            base_score = 35.0
        elif severity >= 15_000:
            risk_level = "LOW"
            base_score = 20.0
        else:
            risk_level = "MINIMAL"
            base_score = 10.0

        volume_ratio = most_negative["call_volume"] / max(most_negative["call_oi"], 1.0)

        reasons = [
            f"Dealers short {abs(max_short_gamma):,.0f} gamma at ${max_strike:.2f}",
            f"Call volume/OI ratio {volume_ratio:.1f} near squeeze strike",
        ]

        if gamma_flip is not None:
            reasons.append(f"Gamma flip projected near ${gamma_flip:.2f}")

        return {
            "score": base_score,
            "risk_level": risk_level,
            "max_short_gamma": max_short_gamma,
            "squeeze_strike": max_strike,
            "gamma_flip": gamma_flip,
            "call_volume_ratio": volume_ratio,
            "reasons": reasons,
            "exposures": exposures[:10],
        }
    except Exception:
        return {"score": 0.0, "risk_level": "ERROR", "reasons": []}


def compute_projected_returns(contract: OptionContract) -> Dict[str, float]:
    results: Dict[str, float] = {}
    for move_pct in (0.10, 0.20, 0.30):
        if contract.option_type == "call":
            target_price = contract.stock_price * (1 + move_pct)
            intrinsic = max(0.0, target_price - contract.strike)
        else:
            target_price = contract.stock_price * (1 - move_pct)
            intrinsic = max(0.0, contract.strike - target_price)
        potential_return = max(0.0, intrinsic - contract.last_price)
        risk_reward = potential_return / max(contract.last_price, 0.01)
        results[f"{int(move_pct * 100)}%"] = round(risk_reward, 2)
    return results


def build_contract(row: pd.Series) -> OptionContract:
    payload = row.to_dict()
    for key in ["bid", "ask", "lastPrice", "impliedVolatility", "stockPrice", "strike"]:
        value = payload.get(key)
        if pd.isna(value):
            payload[key] = 0.0
    for key in ["volume", "openInterest"]:
        value = payload.get(key)
        if pd.isna(value):
            payload[key] = 0
    payload["raw"] = row.to_dict()
    return OptionContract.parse_obj(payload)


def evaluate_contract(
    row: pd.Series,
    engine: CompositeScoringEngine,
    iv_rank: float,
    gamma_signal: Dict[str, object],
    iv_anomaly: Dict[str, float],
) -> Signal:
    greeks = calculate_greeks(row)
    contract = build_contract(row)
    market_data = {
        "volume_ratio": float(row.get("volume", 0.0)) / max(float(row.get("openInterest", 0.0)), 1.0),
        "spread_pct": (contract.ask - contract.bid) / max(contract.last_price, 0.01),
        "theta_ratio": abs(greeks.theta) / max(contract.last_price, 0.01),
        "moneyness": abs(contract.stock_price - contract.strike) / max(contract.stock_price, 0.01) if contract.stock_price else 0.0,
        "iv_rank": iv_rank,
        "gamma_squeeze": gamma_signal,
        "iv_anomaly": iv_anomaly,
    }
    projected_returns = compute_projected_returns(contract)
    market_data["projected_returns"] = projected_returns

    result = engine.score(contract, greeks, market_data)
    result.score.metadata.update(
        {
            "iv_rank": iv_rank,
            "iv_anomaly": iv_anomaly,
            "gamma_signal": gamma_signal,
            "projected_returns": projected_returns,
            "gamma_reasons": gamma_signal.get("reasons", []),
            "volume_ratio": market_data["volume_ratio"],
        }
    )
    return Signal.from_scoring_result(result)


def rank_options_for_symbol(symbol: str, engine: CompositeScoringEngine) -> Tuple[List[Signal], pd.DataFrame | None]:
    chain = get_options_chain(symbol)
    if chain is None or chain.empty:
        return [], None

    chain = chain.fillna(0)
    current_price = float(chain["stockPrice"].iloc[0]) if "stockPrice" in chain else 0.0
    avg_iv = float(chain.get("impliedVolatility", pd.Series([0])).mean()) * 100
    iv_rank = calculate_iv_rank(symbol, avg_iv)
    iv_anomaly = calculate_iv_anomaly(symbol, avg_iv)
    gamma_signal = detect_gamma_squeeze(chain, symbol, current_price)

    signals: List[Signal] = []
    for _, row in chain.iterrows():
        signal = evaluate_contract(row, engine, iv_rank, gamma_signal, iv_anomaly)
        if signal.score.total_score >= 70:
            signals.append(signal)
    return sorted(signals, key=lambda s: s.score.total_score, reverse=True), chain


def scan_symbols(
    symbols: Sequence[str],
    limit_per_symbol: int = 5,
    engine: CompositeScoringEngine | None = None,
) -> Tuple[List[Signal], Dict[str, pd.DataFrame]]:
    engine = engine or CompositeScoringEngine()
    aggregated: List[Signal] = []
    chains: Dict[str, pd.DataFrame] = {}
    for symbol in symbols:
        ranked, chain = rank_options_for_symbol(symbol, engine)
        if chain is not None:
            chains[symbol] = chain
        if ranked:
            aggregated.extend(ranked[:limit_per_symbol])
    return aggregated, chains


def serialize_signals(signals: Iterable[Signal]) -> List[Dict[str, object]]:
    return [signal.dict() for signal in signals]


def _build_option_snapshots(symbol: str, chain: pd.DataFrame) -> List[OptionSnapshot]:
    snapshots: List[OptionSnapshot] = []
    for record in chain.to_dict(orient="records"):
        snapshots.append(
            OptionSnapshot(
                symbol=symbol,
                option_type=str(record.get("type", "")).lower(),
                expiration=str(record.get("expiration", "")),
                strike=float(record.get("strike", 0.0)),
                contract_symbol=record.get("contractSymbol"),
                data=record,
            )
        )
    return snapshots


def _build_signal_snapshots(signals: Sequence[Signal]) -> List[SignalSnapshot]:
    snapshots: List[SignalSnapshot] = []
    for signal in signals:
        contract_symbol = None
        if signal.contract.raw:
            contract_symbol = signal.contract.raw.get("contractSymbol")
        snapshots.append(
            SignalSnapshot(
                symbol=signal.symbol,
                option_type=signal.contract.option_type,
                score=signal.score.total_score,
                contract_symbol=contract_symbol,
                data=signal.dict(by_alias=True),
            )
        )
    return snapshots


def _create_storage(settings: AppSettings) -> SQLiteStorage:
    sqlite_settings = settings.storage.require_sqlite()
    return SQLiteStorage(sqlite_settings.path, pragmas=sqlite_settings.pragmas)


def _persist_scan_results(
    settings: AppSettings,
    watchlist_name: str,
    watchlist: Sequence[str],
    signals: List[Signal],
    chains: Mapping[str, pd.DataFrame],
) -> None:
    if not chains and not signals:
        return

    storage = _create_storage(settings)
    total_options = sum(len(df) for df in chains.values())
    metadata = RunMetadata(
        run_id=uuid4().hex,
        run_at=datetime.utcnow(),
        environment=settings.env,
        watchlist=watchlist_name,
        extra={
            "symbols": list(watchlist),
            "signal_count": len(signals),
            "option_snapshot_count": total_options,
        },
    )
    option_snapshots: List[OptionSnapshot] = []
    for symbol, chain in chains.items():
        option_snapshots.extend(_build_option_snapshots(symbol, chain))
    signal_snapshots = _build_signal_snapshots(signals)
    storage.save_run(metadata, option_snapshots, signal_snapshots)


if __name__ == "__main__":
    settings = get_settings()
    watchlist_name = "default"
    watchlist = settings.get_watchlist(watchlist_name)
    engine = CompositeScoringEngine(settings.scoring_dict())
    signals, chains = scan_symbols(watchlist, limit_per_symbol=3, engine=engine)
    _persist_scan_results(settings, watchlist_name, watchlist, signals, chains)
    print(json.dumps(serialize_signals(signals), indent=2, default=str))

