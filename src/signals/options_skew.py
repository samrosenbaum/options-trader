"""Options skew analysis for directional bias prediction.

Theory: Market makers price risk based on their assessment of directional risk.
When OTM puts are priced with higher IV than OTM calls (put skew), it suggests
bearish positioning. When OTM calls have higher IV (call skew), it suggests
bullish positioning.

This signal looks at:
1. IV skew across strike prices
2. Put/Call IV ratio at various moneyness levels
3. Risk reversal pricing (25-delta)
4. Relative skew vs historical averages
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .base import Direction, Signal, SignalResult


class OptionsSkewAnalyzer(Signal):
    """Analyze options IV skew to determine directional bias."""

    def __init__(self, weight: float = 0.18):
        """Initialize with default weight from master plan."""
        super().__init__(name="Options Skew", weight=weight)

    def get_required_data(self) -> List[str]:
        """Required data fields for skew analysis."""
        return [
            "options_chain",  # Full options chain with IVs
            "stock_price",  # Current stock price
            "atm_iv",  # At-the-money implied volatility
        ]

    def calculate(self, data: Dict[str, Any]) -> SignalResult:
        """
        Calculate directional bias from options skew.

        Args:
            data: Must contain options_chain (DataFrame with strikes, IVs, type)
                  stock_price, and atm_iv

        Returns:
            SignalResult with skew-based directional bias
        """
        if not self.validate_data(data):
            return self._create_neutral_result("Missing required data")

        options_chain = data["options_chain"]
        stock_price = float(data["stock_price"])
        atm_iv = float(data.get("atm_iv", 0))

        if options_chain.empty or stock_price <= 0 or atm_iv <= 0:
            return self._create_neutral_result("Invalid data values")

        # Calculate skew metrics
        skew_metrics = self._calculate_skew_metrics(options_chain, stock_price, atm_iv)

        if skew_metrics is None:
            return self._create_neutral_result("Insufficient options data")

        # Determine directional bias
        direction, score, confidence, rationale = self._interpret_skew(skew_metrics, atm_iv)

        # Adjust confidence based on data quality
        confidence = self._adjust_confidence_for_quality(confidence, skew_metrics)

        return SignalResult(
            signal_name=self.name,
            direction=direction,
            score=score,
            confidence=self.get_adjusted_confidence(confidence),
            rationale=rationale,
            details=skew_metrics,
            timestamp=datetime.now(),
        )

    def _calculate_skew_metrics(
        self, options_chain: pd.DataFrame, stock_price: float, atm_iv: float
    ) -> Optional[Dict[str, Any]]:
        """
        Calculate various skew metrics from options chain.

        Returns dictionary with:
        - otm_put_iv_avg: Average IV of OTM puts
        - otm_call_iv_avg: Average IV of OTM calls
        - put_skew: OTM put IV relative to ATM
        - call_skew: OTM call IV relative to ATM
        - skew_spread: Difference between put and call skew
        - risk_reversal: 25-delta put IV - 25-delta call IV
        """
        try:
            # Separate calls and puts
            calls = options_chain[options_chain["type"] == "call"].copy()
            puts = options_chain[options_chain["type"] == "put"].copy()

            if calls.empty or puts.empty:
                return None

            # Calculate moneyness (percentage OTM/ITM)
            calls["moneyness"] = (calls["strike"] - stock_price) / stock_price
            puts["moneyness"] = (stock_price - puts["strike"]) / stock_price

            # Get OTM options (5-15% OTM is most liquid and informative)
            otm_calls = calls[(calls["moneyness"] > 0.05) & (calls["moneyness"] < 0.15)]
            otm_puts = puts[(puts["moneyness"] > 0.05) & (puts["moneyness"] < 0.15)]

            # Need minimum sample size
            if len(otm_calls) < 2 or len(otm_puts) < 2:
                return None

            # Calculate average IVs for OTM options
            otm_put_iv = otm_puts["impliedVolatility"].mean()
            otm_call_iv = otm_calls["impliedVolatility"].mean()

            # Calculate skew relative to ATM
            put_skew = ((otm_put_iv - atm_iv) / atm_iv) * 100 if atm_iv > 0 else 0
            call_skew = ((otm_call_iv - atm_iv) / atm_iv) * 100 if atm_iv > 0 else 0

            # Skew spread: positive means puts priced higher (bearish), negative means calls higher (bullish)
            skew_spread = put_skew - call_skew

            # Risk reversal: Classic metric used by professionals
            # Find options closest to 25-delta (roughly 25% probability of expiring ITM)
            # For simplicity, use 10-15% OTM as proxy
            rr_puts = puts[(puts["moneyness"] > 0.10) & (puts["moneyness"] < 0.15)]
            rr_calls = calls[(calls["moneyness"] > 0.10) & (calls["moneyness"] < 0.15)]

            risk_reversal = None
            if not rr_puts.empty and not rr_calls.empty:
                risk_reversal = rr_puts["impliedVolatility"].mean() - rr_calls["impliedVolatility"].mean()

            return {
                "otm_put_iv_avg": float(otm_put_iv),
                "otm_call_iv_avg": float(otm_call_iv),
                "atm_iv": float(atm_iv),
                "put_skew": float(put_skew),
                "call_skew": float(call_skew),
                "skew_spread": float(skew_spread),
                "risk_reversal": float(risk_reversal) if risk_reversal is not None else None,
                "otm_put_count": len(otm_puts),
                "otm_call_count": len(otm_calls),
            }

        except Exception as e:
            print(f"Error calculating skew metrics: {e}")
            return None

    def _interpret_skew(
        self, metrics: Dict[str, Any], atm_iv: float
    ) -> tuple[Direction, float, float, str]:
        """
        Interpret skew metrics to determine directional bias.

        Returns: (direction, score, confidence, rationale)
        """
        skew_spread = metrics["skew_spread"]
        put_skew = metrics["put_skew"]
        call_skew = metrics["call_skew"]
        risk_reversal = metrics.get("risk_reversal")

        # Initialize score (will range from -100 to +100)
        score = 0.0
        confidence = 50.0  # Base confidence

        # Primary signal: skew spread
        # Normalize to -100 to +100 scale (typical skew spreads are -10% to +10%)
        score = np.clip(skew_spread * -10, -100, 100)  # Negative because put skew = bearish

        # Adjust confidence based on magnitude of skew
        # Larger skew = more conviction from market makers
        skew_magnitude = abs(skew_spread)
        if skew_magnitude > 8:
            confidence = 85
        elif skew_magnitude > 5:
            confidence = 75
        elif skew_magnitude > 3:
            confidence = 65
        elif skew_magnitude > 1:
            confidence = 55
        else:
            confidence = 45  # Very flat skew = low conviction

        # Risk reversal confirmation
        if risk_reversal is not None:
            # Risk reversal > 0 means puts more expensive (bearish)
            # Risk reversal < 0 means calls more expensive (bullish)
            rr_normalized = np.clip(risk_reversal * -100, -30, 30)
            score += rr_normalized

            # If risk reversal agrees with skew, boost confidence
            if (risk_reversal > 0.02 and skew_spread > 1) or (risk_reversal < -0.02 and skew_spread < -1):
                confidence += 10

        # Determine direction
        if score > 15:
            direction = Direction.BULLISH
            rationale = self._build_bullish_rationale(metrics)
        elif score < -15:
            direction = Direction.BEARISH
            rationale = self._build_bearish_rationale(metrics)
        else:
            direction = Direction.NEUTRAL
            rationale = self._build_neutral_rationale(metrics)

        return direction, score, min(95, confidence), rationale

    def _build_bullish_rationale(self, metrics: Dict[str, Any]) -> str:
        """Build explanation for bullish skew."""
        skew_spread = metrics["skew_spread"]
        call_skew = metrics["call_skew"]

        rationale = f"Call skew detected: OTM calls priced {abs(skew_spread):.1f}% higher than OTM puts relative to ATM. "
        rationale += "Market makers are pricing higher risk to the upside, suggesting positioning for potential rallies. "

        if metrics.get("risk_reversal") and metrics["risk_reversal"] < -0.02:
            rationale += "Risk reversal confirms bullish bias with calls commanding premium over puts. "

        rationale += "This skew pattern typically precedes bullish moves."

        return rationale

    def _build_bearish_rationale(self, metrics: Dict[str, Any]) -> str:
        """Build explanation for bearish skew."""
        skew_spread = metrics["skew_spread"]
        put_skew = metrics["put_skew"]

        rationale = f"Put skew detected: OTM puts priced {abs(skew_spread):.1f}% higher than OTM calls relative to ATM. "
        rationale += "Market makers are pricing downside protection at a premium, suggesting hedging demand or bearish positioning. "

        if metrics.get("risk_reversal") and metrics["risk_reversal"] > 0.02:
            rationale += "Risk reversal confirms bearish bias with elevated put pricing. "

        rationale += "This skew pattern often precedes downward moves."

        return rationale

    def _build_neutral_rationale(self, metrics: Dict[str, Any]) -> str:
        """Build explanation for neutral skew."""
        skew_spread = metrics["skew_spread"]

        rationale = f"Flat skew: OTM puts and calls priced similarly (spread: {skew_spread:.1f}%). "
        rationale += "Market makers see balanced risk in both directions. "
        rationale += "No strong directional bias from options pricing."

        return rationale

    def _adjust_confidence_for_quality(self, confidence: float, metrics: Dict[str, Any]) -> float:
        """Reduce confidence if data quality is questionable."""
        # Penalize if sample size is small
        total_options = metrics["otm_put_count"] + metrics["otm_call_count"]
        if total_options < 6:
            confidence *= 0.7
        elif total_options < 10:
            confidence *= 0.85

        # Penalize if ATM IV is very low (less reliable skew)
        if metrics["atm_iv"] < 0.20:  # IV below 20%
            confidence *= 0.9

        return confidence

    def _create_neutral_result(self, reason: str) -> SignalResult:
        """Create a neutral result when signal cannot be calculated."""
        return SignalResult(
            signal_name=self.name,
            direction=Direction.NEUTRAL,
            score=0.0,
            confidence=0.0,
            rationale=f"No skew signal: {reason}",
            details={"error": reason},
            timestamp=datetime.now(),
        )
