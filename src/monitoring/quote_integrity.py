"""Runtime monitoring utilities for validating option quote integrity."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List, Mapping, MutableMapping, Optional

import numpy as np
import pandas as pd


def _default_logger(message: str) -> None:
    import sys

    print(message, file=sys.stderr)


@dataclass
class QuoteIntegritySummary:
    """Aggregated health report for a collection of option quotes."""

    total_quotes: int
    stale_quotes: MutableMapping[str, Optional[float] | int | List[Mapping[str, object]]]
    pricing_anomalies: MutableMapping[str, int | List[Mapping[str, object]]]
    volume_outliers: MutableMapping[str, int | List[Mapping[str, object]]]
    anomaly_count: int

    def to_dict(self) -> Dict[str, object]:
        return {
            "totalQuotes": self.total_quotes,
            "staleQuotes": dict(self.stale_quotes),
            "pricingAnomalies": dict(self.pricing_anomalies),
            "volumeOutliers": dict(self.volume_outliers),
            "anomalyCount": self.anomaly_count,
        }


class QuoteIntegrityMonitor:
    """Evaluate raw option chains for stale or inconsistent data at runtime."""

    def __init__(
        self,
        *,
        stale_threshold_minutes: float = 15.0,
        critical_stale_minutes: float = 60.0,
        spread_warning_threshold: float = 0.5,
        last_price_deviation_threshold: float = 1.0,
        volume_oi_ratio_threshold: float = 50.0,
        example_limit: int = 5,
    ) -> None:
        self.stale_threshold_minutes = stale_threshold_minutes
        self.critical_stale_minutes = critical_stale_minutes
        self.spread_warning_threshold = spread_warning_threshold
        self.last_price_deviation_threshold = last_price_deviation_threshold
        self.volume_oi_ratio_threshold = volume_oi_ratio_threshold
        self.example_limit = example_limit

    def evaluate_dataframe(self, quotes: Optional[pd.DataFrame]) -> QuoteIntegritySummary:
        """Return aggregated anomaly counts for the supplied options snapshot."""

        if quotes is None or quotes.empty:
            return QuoteIntegritySummary(
                total_quotes=0,
                stale_quotes={"count": 0, "criticalCount": 0, "worstAgeMinutes": None, "examples": []},
                pricing_anomalies={
                    "crossedMarketCount": 0,
                    "wideSpreadCount": 0,
                    "lastPriceDeviationCount": 0,
                    "examples": [],
                },
                volume_outliers={"zeroVolumeCount": 0, "extremeRatioCount": 0, "examples": []},
                anomaly_count=0,
            )

        frame = quotes.copy()

        stale_summary = self._summarize_stale_quotes(frame)
        pricing_summary = self._summarize_pricing(frame)
        volume_summary = self._summarize_volume(frame)

        anomaly_total = (
            int(stale_summary.get("count", 0))
            + int(pricing_summary.get("crossedMarketCount", 0))
            + int(pricing_summary.get("wideSpreadCount", 0))
            + int(pricing_summary.get("lastPriceDeviationCount", 0))
            + int(volume_summary.get("zeroVolumeCount", 0))
            + int(volume_summary.get("extremeRatioCount", 0))
        )

        return QuoteIntegritySummary(
            total_quotes=int(len(frame)),
            stale_quotes=stale_summary,
            pricing_anomalies=pricing_summary,
            volume_outliers=volume_summary,
            anomaly_count=anomaly_total,
        )

    def log_summary(
        self,
        summary: QuoteIntegritySummary,
        *,
        logger: Callable[[str], None] | None = None,
    ) -> None:
        """Emit human-readable monitoring output for operators."""

        logger = logger or _default_logger
        payload = summary.to_dict()
        total = payload["totalQuotes"]
        anomaly_count = payload["anomalyCount"]

        logger(
            "📊 Quote integrity check: %s quotes inspected, %s anomalies detected"
            % (total, anomaly_count)
        )

        if anomaly_count == 0:
            return

        stale = payload["staleQuotes"]
        if stale["count"]:
            logger(
                "  • %s stale quotes (%s critical). Worst age: %s minutes"
                % (
                    stale["count"],
                    stale["criticalCount"],
                    _format_float(stale.get("worstAgeMinutes")),
                )
            )
            self._log_examples(logger, stale.get("examples") or [], "stale")

        pricing = payload["pricingAnomalies"]
        pricing_total = (
            pricing["crossedMarketCount"]
            + pricing["wideSpreadCount"]
            + pricing["lastPriceDeviationCount"]
        )
        if pricing_total:
            logger(
                "  • Pricing anomalies: %s crossed, %s wide spreads, %s deviating last prices"
                % (
                    pricing["crossedMarketCount"],
                    pricing["wideSpreadCount"],
                    pricing["lastPriceDeviationCount"],
                )
            )
            self._log_examples(logger, pricing.get("examples") or [], "pricing")

        volume = payload["volumeOutliers"]
        if volume["zeroVolumeCount"] or volume["extremeRatioCount"]:
            logger(
                "  • Volume anomalies: %s zero volume, %s extreme volume/OI ratios"
                % (volume["zeroVolumeCount"], volume["extremeRatioCount"])
            )
            self._log_examples(logger, volume.get("examples") or [], "volume")

    def _log_examples(
        self,
        logger: Callable[[str], None],
        examples: List[Mapping[str, object]],
        label: str,
    ) -> None:
        if not examples:
            return
        for example in examples[: self.example_limit]:
            formatted = ", ".join(f"{key}={value}" for key, value in example.items())
            logger(f"     ↳ {label} example: {formatted}")

    def _summarize_stale_quotes(self, frame: pd.DataFrame) -> MutableMapping[str, object]:
        column = "_price_age_seconds"
        if column not in frame.columns:
            return {"count": 0, "criticalCount": 0, "worstAgeMinutes": None, "examples": []}

        ages = pd.to_numeric(frame[column], errors="coerce") / 60.0
        ages = ages.replace([np.inf, -np.inf], np.nan)

        stale_mask = ages > self.stale_threshold_minutes
        critical_mask = ages > self.critical_stale_minutes

        examples = self._extract_examples(frame.loc[stale_mask], {
            "symbol": "symbol",
            "expiration": "expiration",
            "strike": "strike",
            "ageMinutes": lambda row: _format_float(row.get(column) / 60.0),
        })

        worst_age = ages[stale_mask].max() if stale_mask.any() else None

        return {
            "count": int(stale_mask.sum()),
            "criticalCount": int(critical_mask.sum()),
            "worstAgeMinutes": _format_float(worst_age),
            "examples": examples,
        }

    def _summarize_pricing(self, frame: pd.DataFrame) -> MutableMapping[str, object]:
        required = {"bid", "ask"}
        if not required.issubset(frame.columns):
            return {
                "crossedMarketCount": 0,
                "wideSpreadCount": 0,
                "lastPriceDeviationCount": 0,
                "examples": [],
            }

        bid = pd.to_numeric(frame["bid"], errors="coerce")
        ask = pd.to_numeric(frame["ask"], errors="coerce")

        crossed_mask = (bid.notna()) & (ask.notna()) & (bid >= ask) & (bid > 0) & (ask > 0)

        spread = ask - bid
        mid = (ask + bid) / 2
        spread_pct = spread / mid.replace({0: np.nan})
        wide_spread_mask = (spread_pct > self.spread_warning_threshold) & spread_pct.notna()

        last_price_mask = pd.Series([False] * len(frame))
        if "lastPrice" in frame.columns:
            last_price = pd.to_numeric(frame["lastPrice"], errors="coerce")
            valid = (
                last_price.notna()
                & (last_price > 0)
                & bid.notna()
                & ask.notna()
                & (bid > 0)
                & (ask > 0)
                & (mid > 0)
            )
            deviation = ((last_price - mid).abs() / mid.replace({0: np.nan})).where(valid)
            last_price_mask = deviation > self.last_price_deviation_threshold

        combined = frame.loc[crossed_mask | wide_spread_mask | last_price_mask]
        examples = self._extract_examples(combined, {
            "symbol": "symbol",
            "expiration": "expiration",
            "strike": "strike",
            "bid": "bid",
            "ask": "ask",
            "lastPrice": "lastPrice",
        })

        return {
            "crossedMarketCount": int(crossed_mask.sum()),
            "wideSpreadCount": int(wide_spread_mask.sum()),
            "lastPriceDeviationCount": int(last_price_mask.sum()),
            "examples": examples,
        }

    def _summarize_volume(self, frame: pd.DataFrame) -> MutableMapping[str, object]:
        required = {"volume", "openInterest"}
        if not required.issubset(frame.columns):
            return {"zeroVolumeCount": 0, "extremeRatioCount": 0, "examples": []}

        volume = pd.to_numeric(frame["volume"], errors="coerce")
        oi = pd.to_numeric(frame["openInterest"], errors="coerce")

        zero_volume_mask = (volume.notna()) & (volume <= 0)

        with np.errstate(divide="ignore", invalid="ignore"):
            ratio = volume / oi.replace({0: np.nan})
        ratio_mask = ratio >= self.volume_oi_ratio_threshold

        combined = frame.loc[zero_volume_mask | ratio_mask]
        examples = self._extract_examples(combined, {
            "symbol": "symbol",
            "expiration": "expiration",
            "strike": "strike",
            "volume": "volume",
            "openInterest": "openInterest",
        })

        return {
            "zeroVolumeCount": int(zero_volume_mask.sum()),
            "extremeRatioCount": int(ratio_mask.sum()),
            "examples": examples,
        }

    def _extract_examples(
        self,
        frame: pd.DataFrame,
        fields: Mapping[str, str | Callable[[Mapping[str, object]], object]],
    ) -> List[Mapping[str, object]]:
        if frame.empty:
            return []

        limited = frame.head(self.example_limit)
        examples: List[Dict[str, object]] = []
        for _, row in limited.iterrows():
            payload: Dict[str, object] = {}
            for name, source in fields.items():
                if callable(source):
                    payload[name] = source(row)
                else:
                    payload[name] = row.get(source)
            examples.append(payload)
        return examples


def _format_float(value: Optional[float]) -> Optional[float]:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


__all__ = ["QuoteIntegrityMonitor", "QuoteIntegritySummary"]
