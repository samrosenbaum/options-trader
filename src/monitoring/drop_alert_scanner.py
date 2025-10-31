"""Drop Alert Scanner - detect elevated downside risk using composite signals."""

from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence

import pandas as pd
import yfinance as yf

from scripts.bulk_options_fetcher import BulkOptionsFetcher
from src.scanner.service import SmartOptionsScanner


@dataclass
class DropRiskSignalResult:
    """Structured view of a composite drop-risk reading for a single ticker."""

    symbol: str
    drop_risk_score: float
    bias_score: float
    confidence: float
    alert_level: str
    stock_price: Optional[float]
    price_change_pct: Optional[float]
    drivers: List[str]
    signal_details: Dict[str, Any]
    generated_at: datetime
    score_change: Optional[float] = None

    def to_record(self) -> Dict[str, Any]:
        """Serialize the signal for Supabase persistence."""

        return {
            "symbol": self.symbol,
            "drop_risk_score": round(self.drop_risk_score, 2),
            "bias_score": round(self.bias_score, 2),
            "confidence": round(self.confidence, 2),
            "alert_level": self.alert_level,
            "stock_price": None if self.stock_price is None else round(float(self.stock_price), 4),
            "price_change_pct": None if self.price_change_pct is None else round(float(self.price_change_pct), 2),
            "drivers": self.drivers,
            "signal_details": self.signal_details,
            "score_change": None if self.score_change is None else round(float(self.score_change), 2),
            "generated_at": self.generated_at.isoformat(),
        }


class DropAlertScanner:
    """High-level coordinator that produces drop-risk alerts."""

    _DEFAULT_LIMIT = 40

    def __init__(self, *, max_symbols: Optional[int] = None) -> None:
        self.max_symbols = max_symbols or self._DEFAULT_LIMIT
        self.scanner = SmartOptionsScanner(max_symbols=self.max_symbols)
        self.fetcher: BulkOptionsFetcher = self.scanner.fetcher
        self.supabase = self._init_supabase_client()

    @staticmethod
    def _init_supabase_client():
        """Attempt to initialise the Supabase client for persistence."""

        try:
            from supabase import Client, create_client  # type: ignore
        except ImportError:
            print(
                "ℹ️  Supabase SDK not installed – drop alerts will run in memory only.",
                file=sys.stderr,
            )
            return None

        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        if not url or not key:
            print(
                "ℹ️  Supabase credentials missing – skip persistence for drop-risk signals.",
                file=sys.stderr,
            )
            return None

        try:
            return create_client(url, key)
        except Exception as exc:  # pragma: no cover - defensive logging
            print(f"⚠️  Failed to initialise Supabase client: {exc}", file=sys.stderr)
            return None

    def run(self, symbols: Optional[Sequence[str]] = None) -> List[DropRiskSignalResult]:
        """Compute drop-risk signals for the requested universe."""

        target_symbols = self._resolve_symbols(symbols)
        if not target_symbols:
            print("⚠️  No symbols provided for drop alert scan.", file=sys.stderr)
            return []

        options_data = self.scanner.get_current_options_data(target_symbols, force_refresh=False)
        if options_data is None or options_data.empty:
            print("⚠️  Unable to load options chain snapshot for drop alert scan.", file=sys.stderr)
            return []

        price_history_cache = self._prefetch_price_history(target_symbols)
        previous_scores = self._fetch_previous_scores()

        results: List[DropRiskSignalResult] = []
        for symbol in target_symbols:
            chain = options_data[options_data["symbol"] == symbol].copy()
            if chain.empty:
                continue

            option_snapshot = self._select_representative_option(chain)
            if option_snapshot is None:
                continue

            enhanced_bias = self.scanner.calculate_enhanced_directional_bias(
                symbol,
                option_snapshot,
                chain,
                price_history_cache=price_history_cache,
            )
            if not enhanced_bias:
                continue

            price_change_pct = self._compute_price_change(price_history_cache.get(symbol))
            previous_score = previous_scores.get(symbol)

            result = self._build_result(
                symbol=symbol,
                option_snapshot=option_snapshot,
                enhanced_bias=enhanced_bias,
                price_change_pct=price_change_pct,
                previous_score=previous_score,
            )
            results.append(result)

        results.sort(key=lambda r: r.drop_risk_score, reverse=True)
        return results

    def persist(self, signals: Sequence[DropRiskSignalResult]) -> None:
        """Persist a batch of drop-risk signals to Supabase if configured."""

        if not self.supabase:
            return

        payload = [signal.to_record() for signal in signals]
        if not payload:
            return

        try:
            # Insert as historical records (no upsert) to preserve trend data.
            self.supabase.table("drop_risk_signals").insert(payload).execute()
        except Exception as exc:  # pragma: no cover - network failure
            print(f"⚠️  Failed to persist drop-risk signals: {exc}", file=sys.stderr)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _resolve_symbols(self, symbols: Optional[Sequence[str]]) -> List[str]:
        if symbols:
            normalized = []
            seen = set()
            for sym in symbols:
                if not sym:
                    continue
                symbol = str(sym).upper().strip()
                if symbol and symbol not in seen:
                    seen.add(symbol)
                    normalized.append(symbol)
            return normalized[: self.max_symbols]

        return self.fetcher.priority_symbols[: self.max_symbols]

    def _prefetch_price_history(self, symbols: Iterable[str]) -> Dict[str, pd.DataFrame]:
        cache: Dict[str, pd.DataFrame] = {}
        for symbol in symbols:
            try:
                history = yf.download(
                    symbol,
                    period="10d",
                    interval="1d",
                    progress=False,
                    auto_adjust=True,
                    timeout=10,
                )
            except Exception as exc:  # pragma: no cover - network restrictions
                print(f"⚠️  Failed to download price history for {symbol}: {exc}", file=sys.stderr)
                continue

            if history.empty:
                continue

            if isinstance(history.columns, pd.MultiIndex):
                history.columns = history.columns.get_level_values(0)
            history.columns = [col.lower() for col in history.columns]
            cache[symbol] = history
        return cache

    def _fetch_previous_scores(self) -> Dict[str, float]:
        if not self.supabase:
            return {}

        try:
            response = (
                self.supabase
                .table("drop_risk_signals")
                .select("symbol, drop_risk_score")
                .order("generated_at", desc=True)
                .limit(200)
                .execute()
            )
        except Exception as exc:  # pragma: no cover - network failure
            print(f"⚠️  Failed to load previous drop-risk scores: {exc}", file=sys.stderr)
            return {}

        data = response.data or []
        latest: Dict[str, float] = {}
        for row in data:
            symbol = row.get("symbol")
            score = row.get("drop_risk_score")
            if not symbol or symbol in latest:
                continue
            try:
                latest[symbol] = float(score)
            except (TypeError, ValueError):
                continue
        return latest

    def _select_representative_option(self, chain: pd.DataFrame) -> Optional[pd.Series]:
        if chain.empty:
            return None

        chain = chain.copy()
        chain["strike"] = pd.to_numeric(chain.get("strike"), errors="coerce")
        chain["stockPrice"] = pd.to_numeric(chain.get("stockPrice"), errors="coerce")
        chain["impliedVolatility"] = pd.to_numeric(chain.get("impliedVolatility"), errors="coerce")

        stock_prices = chain["stockPrice"].dropna()
        stock_price = float(stock_prices.median()) if not stock_prices.empty else None
        if stock_price is None or not math.isfinite(stock_price):
            return None

        chain = chain[chain["strike"].notna()]
        if chain.empty:
            return None

        chain["abs_distance"] = (chain["strike"] - stock_price).abs()
        chain = chain.sort_values(["type", "abs_distance"]).reset_index(drop=True)

        puts = chain[chain["type"].str.lower() == "put"]
        candidate = puts.iloc[0] if not puts.empty else chain.iloc[0]
        candidate = candidate.copy()
        candidate["stockPrice"] = stock_price

        iv = candidate.get("impliedVolatility")
        if iv is None or not math.isfinite(iv) or iv <= 0:
            iv_values = chain["impliedVolatility"].dropna()
            if not iv_values.empty:
                candidate["impliedVolatility"] = float(iv_values.median())
            else:
                candidate["impliedVolatility"] = 0.3  # Conservative fallback
        return candidate

    def _compute_price_change(self, price_history: Optional[pd.DataFrame]) -> Optional[float]:
        if price_history is None or price_history.empty or "close" not in price_history:
            return None

        closes = price_history["close"].dropna().values
        if closes.size < 2:
            return None

        previous, latest = closes[-2], closes[-1]
        if previous == 0:
            return None
        return ((latest - previous) / previous) * 100

    def _build_result(
        self,
        *,
        symbol: str,
        option_snapshot: pd.Series,
        enhanced_bias: Dict[str, Any],
        price_change_pct: Optional[float],
        previous_score: Optional[float],
    ) -> DropRiskSignalResult:
        score = float(enhanced_bias.get("score", 0.0))
        confidence = float(enhanced_bias.get("confidence", 0.0))
        signals = enhanced_bias.get("signals") or []

        score_component = min(100.0, max(0.0, -score))
        bearish_strength = 0.0
        total_strength = 0.0
        bearish_drivers: List[str] = []

        for raw in signals:
            weight = float(raw.get("weighted_contribution", 0.0) or 0.0)
            total_strength += abs(weight)
            if weight < 0:
                bearish_strength += -weight
                rationale = str(raw.get("rationale") or "").strip()
                name = str(raw.get("name") or "Signal")
                summary = rationale if rationale else f"{name} leaning bearish"
                bearish_drivers.append(f"{name}: {summary}")

        agreement_component = 0.0
        if total_strength > 0:
            agreement_component = min(100.0, (bearish_strength / total_strength) * 100)

        confidence_component = max(0.0, min(100.0, confidence))
        drop_risk_score = min(
            100.0,
            score_component * 0.45 + agreement_component * 0.35 + confidence_component * 0.20,
        )

        alert_level = self._determine_alert_level(drop_risk_score)
        drivers = self._summarise_drivers(bearish_drivers)

        signal_details = {
            "direction": enhanced_bias.get("direction"),
            "score": score,
            "confidence": confidence,
            "recommendation": enhanced_bias.get("recommendation"),
            "signals": signals,
            "components": {
                "score": round(score_component, 2),
                "agreement": round(agreement_component, 2),
                "confidence": round(confidence_component, 2),
            },
        }

        score_change = None
        if previous_score is not None:
            score_change = drop_risk_score - previous_score

        stock_price = option_snapshot.get("stockPrice")
        stock_price_value = float(stock_price) if stock_price is not None else None

        return DropRiskSignalResult(
            symbol=symbol,
            drop_risk_score=drop_risk_score,
            bias_score=score,
            confidence=confidence,
            alert_level=alert_level,
            stock_price=stock_price_value,
            price_change_pct=price_change_pct,
            drivers=drivers,
            signal_details=signal_details,
            generated_at=datetime.now(timezone.utc),
            score_change=score_change,
        )

    @staticmethod
    def _determine_alert_level(score: float) -> str:
        if score >= 80:
            return "extreme"
        if score >= 65:
            return "high"
        if score >= 50:
            return "elevated"
        return "watch"

    @staticmethod
    def _summarise_drivers(drivers: Sequence[str], limit: int = 3) -> List[str]:
        formatted: List[str] = []
        for driver in drivers:
            text = driver.strip()
            if not text:
                continue
            if len(text) > 180:
                text = text[:177].rstrip() + "..."
            formatted.append(text)
            if len(formatted) >= limit:
                break
        return formatted


__all__ = ["DropAlertScanner", "DropRiskSignalResult"]
