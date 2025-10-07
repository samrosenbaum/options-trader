"""Data quality validation for options data."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List


class DataQuality(Enum):
    """Quality rating for options data."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    REJECTED = "rejected"


@dataclass
class QualityReport:
    """Report on data quality with score and issues."""

    quality: DataQuality
    score: float  # 0-100
    issues: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class OptionsDataValidator:
    """Validate options data quality before analysis."""

    def __init__(
        self,
        max_spread_pct: float = 0.5,
        warn_spread_pct: float = 0.2,
        max_price_age_seconds: float = 900,  # 15 minutes
        warn_price_age_seconds: float = 300,  # 5 minutes
        min_volume: int = 10,
        min_open_interest: int = 100,
        max_iv: float = 5.0,  # 500% IV
        max_otm_pct: float = 0.3,  # 30% out of the money
    ):
        """
        Initialize validator with quality thresholds.

        Args:
            max_spread_pct: Maximum bid-ask spread percentage before rejection
            warn_spread_pct: Spread percentage that triggers warning
            max_price_age_seconds: Maximum stock price age before rejection
            warn_price_age_seconds: Price age that triggers warning
            min_volume: Minimum volume for acceptable quality
            min_open_interest: Minimum open interest for acceptable quality
            max_iv: Maximum implied volatility before flagging as suspicious
            max_otm_pct: Maximum out-of-the-money percentage before warning
        """
        self.max_spread_pct = max_spread_pct
        self.warn_spread_pct = warn_spread_pct
        self.max_price_age_seconds = max_price_age_seconds
        self.warn_price_age_seconds = warn_price_age_seconds
        self.min_volume = min_volume
        self.min_open_interest = min_open_interest
        self.max_iv = max_iv
        self.max_otm_pct = max_otm_pct

    def validate_option(self, option: Dict[str, Any]) -> QualityReport:
        """
        Validate a single option contract.

        Args:
            option: Dictionary containing option data

        Returns:
            QualityReport with quality assessment
        """
        issues: List[str] = []
        warnings: List[str] = []
        score = 100.0
        metadata: Dict[str, Any] = {}

        # Validate bid-ask spread
        spread_result = self._validate_spread(option)
        score -= spread_result["penalty"]
        issues.extend(spread_result.get("issues", []))
        warnings.extend(spread_result.get("warnings", []))
        metadata["spread_pct"] = spread_result.get("spread_pct")

        # Validate volume
        volume_result = self._validate_volume(option)
        score -= volume_result["penalty"]
        issues.extend(volume_result.get("issues", []))
        warnings.extend(volume_result.get("warnings", []))
        metadata["volume"] = option.get("volume", 0)

        # Validate open interest
        oi_result = self._validate_open_interest(option)
        score -= oi_result["penalty"]
        issues.extend(oi_result.get("issues", []))
        warnings.extend(oi_result.get("warnings", []))
        metadata["openInterest"] = option.get("openInterest", 0)

        # Validate implied volatility
        iv_result = self._validate_iv(option)
        score -= iv_result["penalty"]
        issues.extend(iv_result.get("issues", []))
        warnings.extend(iv_result.get("warnings", []))
        metadata["impliedVolatility"] = option.get("impliedVolatility", 0)

        # Validate stock price freshness
        price_result = self._validate_price_freshness(option)
        score -= price_result["penalty"]
        issues.extend(price_result.get("issues", []))
        warnings.extend(price_result.get("warnings", []))
        metadata["price_age_seconds"] = price_result.get("age_seconds")
        metadata["price_source"] = option.get("_price_source", "unknown")

        # Validate moneyness
        moneyness_result = self._validate_moneyness(option)
        score -= moneyness_result["penalty"]
        warnings.extend(moneyness_result.get("warnings", []))
        metadata["moneyness_pct"] = moneyness_result.get("moneyness_pct")

        # Determine overall quality based on score
        score = max(0.0, min(100.0, score))

        if score < 40 or len(issues) >= 3:
            quality = DataQuality.REJECTED
        elif score < 60 or len(issues) >= 1:
            quality = DataQuality.LOW
        elif score < 80:
            quality = DataQuality.MEDIUM
        else:
            quality = DataQuality.HIGH

        return QualityReport(
            quality=quality,
            score=score,
            issues=issues,
            warnings=warnings,
            metadata=metadata,
        )

    def _validate_spread(self, option: Dict[str, Any]) -> Dict[str, Any]:
        """Validate bid-ask spread."""
        bid = float(option.get("bid", 0) or 0)
        ask = float(option.get("ask", 0) or 0)
        last_price = float(option.get("lastPrice") or option.get("premium", 0) or ask)

        if bid <= 0 or ask <= 0:
            return {
                "penalty": 20,
                "issues": ["Invalid bid or ask price"],
                "spread_pct": None,
            }

        spread_pct = (ask - bid) / max(last_price, ask)

        if spread_pct > self.max_spread_pct:
            return {
                "penalty": 40,
                "issues": [f"Excessive bid-ask spread: {spread_pct:.1%}"],
                "spread_pct": spread_pct,
            }
        elif spread_pct > self.warn_spread_pct:
            return {
                "penalty": 15,
                "warnings": [f"Wide bid-ask spread: {spread_pct:.1%}"],
                "spread_pct": spread_pct,
            }

        return {"penalty": 0, "spread_pct": spread_pct}

    def _validate_volume(self, option: Dict[str, Any]) -> Dict[str, Any]:
        """Validate trading volume."""
        volume = int(option.get("volume", 0) or 0)

        if volume == 0:
            return {
                "penalty": 50,
                "issues": ["Zero volume - no trading activity today"],
            }
        elif volume < self.min_volume:
            return {
                "penalty": 10,
                "warnings": [f"Low volume: {volume} contracts"],
            }

        return {"penalty": 0}

    def _validate_open_interest(self, option: Dict[str, Any]) -> Dict[str, Any]:
        """Validate open interest."""
        open_interest = int(option.get("openInterest", 0) or 0)

        if open_interest == 0:
            return {
                "penalty": 40,
                "issues": ["Zero open interest - illiquid contract"],
            }
        elif open_interest < self.min_open_interest:
            return {
                "penalty": 15,
                "warnings": [f"Low open interest: {open_interest} contracts"],
            }

        return {"penalty": 0}

    def _validate_iv(self, option: Dict[str, Any]) -> Dict[str, Any]:
        """Validate implied volatility."""
        iv = float(option.get("impliedVolatility", 0) or 0)

        if iv <= 0:
            return {
                "penalty": 25,
                "issues": ["Invalid or missing implied volatility"],
            }
        elif iv > self.max_iv:
            return {
                "penalty": 30,
                "issues": [f"Suspicious IV: {iv:.2%} - may be data error"],
            }
        elif iv > 2.0:  # 200% IV
            return {
                "penalty": 0,
                "warnings": [f"Very high IV: {iv:.1%}"],
            }

        return {"penalty": 0}

    def _validate_price_freshness(self, option: Dict[str, Any]) -> Dict[str, Any]:
        """Validate stock price freshness."""
        price_source = option.get("_price_source", "")
        age_seconds = option.get("_price_age_seconds")

        # Check if price is from previous close (stale)
        if "previousClose" in price_source or "STALE" in price_source:
            return {
                "penalty": 25,
                "warnings": ["Stock price is from previous close - may be stale"],
                "age_seconds": age_seconds,
            }

        # Check price age
        if age_seconds is not None:
            if age_seconds > self.max_price_age_seconds:
                minutes_old = age_seconds / 60
                return {
                    "penalty": 20,
                    "warnings": [f"Stock price is {minutes_old:.1f} minutes old"],
                    "age_seconds": age_seconds,
                }
            elif age_seconds > self.warn_price_age_seconds:
                minutes_old = age_seconds / 60
                return {
                    "penalty": 5,
                    "warnings": [f"Stock price is {minutes_old:.1f} minutes old"],
                    "age_seconds": age_seconds,
                }

        return {"penalty": 0, "age_seconds": age_seconds}

    def _validate_moneyness(self, option: Dict[str, Any]) -> Dict[str, Any]:
        """Validate option moneyness (how far from ATM)."""
        stock_price = float(option.get("stockPrice", 0) or 0)
        strike = float(option.get("strike", 0) or 0)

        if stock_price <= 0 or strike <= 0:
            return {"penalty": 0, "moneyness_pct": None}

        moneyness_pct = abs(stock_price - strike) / stock_price

        if moneyness_pct > self.max_otm_pct:
            return {
                "penalty": 10,
                "warnings": [f"Deep OTM option: {moneyness_pct:.1%} from stock price"],
                "moneyness_pct": moneyness_pct,
            }

        return {"penalty": 0, "moneyness_pct": moneyness_pct}

    def is_market_hours(self) -> bool:
        """Check if current time is during market hours (9:30 AM - 4:00 PM ET)."""
        from datetime import datetime
        import pytz

        et_tz = pytz.timezone("America/New_York")
        now_et = datetime.now(et_tz)

        # Check if weekday
        if now_et.weekday() >= 5:  # Saturday or Sunday
            return False

        # Check if during trading hours
        market_open = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close = now_et.replace(hour=16, minute=0, second=0, microsecond=0)

        return market_open <= now_et <= market_close


__all__ = ["DataQuality", "OptionsDataValidator", "QualityReport"]
