"""Earnings catalyst signal with dynamic weighting based on proximity to earnings.

Theory: Earnings is THE major catalyst for options. However, its impact on directional
bias depends on timing:

BEFORE Earnings (0-7 days):
- High uncertainty → REDUCE overall confidence
- IV typically elevated → premium expensive
- Direction unclear → suggest neutral or wait

AFTER Earnings (0-3 days):
- Price reaction confirms/rejects market expectations
- Strong move + volume → high conviction signal
- Weak reaction despite beat/miss → contrarian signal

FAR FROM Earnings (7+ days):
- Low impact on immediate direction
- Focus on other signals
- Minimal weight

Dynamic Weighting:
- Base weight: 5% (when earnings not imminent)
- Pre-earnings (3-7 days): 15% weight
- Pre-earnings (0-3 days): 5% weight (too uncertain, reduce all confidence)
- Post-earnings (0-3 days): 20% weight (reaction is signal)
- Far away (7+ days): 5% weight (not relevant)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from .base import Direction, Signal, SignalResult


class EarningsCatalystSignal(Signal):
    """Dynamic earnings catalyst signal with time-based weight adjustment."""

    def __init__(self, weight: float = 0.05):
        """
        Initialize with base 5% weight.

        Note: Actual weight will be adjusted dynamically based on
        proximity to earnings date.
        """
        super().__init__(name="Earnings Catalyst", weight=weight)
        self._dynamic_weight = weight

    def get_required_data(self) -> List[str]:
        """Required data fields for earnings analysis."""
        return [
            "earnings_in_days",  # Days until/since earnings (negative = past)
            "stock_price",  # Current price
            "price_change",  # Recent price change % (for post-earnings reaction)
        ]

    def get_dynamic_weight(self, data: Dict[str, Any]) -> float:
        """
        Calculate dynamic weight based on earnings proximity.

        Returns:
            Adjusted weight (0.05 to 0.20)
        """
        earnings_in_days = data.get("earnings_in_days")

        if earnings_in_days is None:
            return self.weight  # Base weight if no earnings data

        days = int(earnings_in_days)

        if -3 <= days <= 0:
            # Just reported (0-3 days ago) - HIGH weight, reaction is signal
            return 0.20
        elif 0 < days <= 3:
            # Imminent (0-3 days) - LOW weight, too uncertain
            return 0.05
        elif 3 < days <= 7:
            # Coming soon (3-7 days) - MEDIUM weight, anticipation builds
            return 0.15
        else:
            # Far away (7+ days) or old news (-3+ days ago) - BASE weight
            return 0.05

    def calculate(self, data: Dict[str, Any]) -> SignalResult:
        """
        Calculate directional bias from earnings catalyst.

        Args:
            data: Must contain earnings_in_days, optionally stock_price, price_change

        Returns:
            SignalResult with earnings-adjusted directional bias
        """
        if not self.validate_data(data):
            return self._create_neutral_result("Missing required data")

        earnings_in_days = data.get("earnings_in_days")

        if earnings_in_days is None:
            return self._create_neutral_result("No earnings date available")

        days = int(earnings_in_days)
        stock_price = float(data.get("stock_price", 0))
        price_change = float(data.get("price_change", 0))

        # Update dynamic weight
        self._dynamic_weight = self.get_dynamic_weight(data)

        # Calculate earnings impact
        metrics = self._calculate_earnings_impact(days, stock_price, price_change)

        # Determine directional bias
        direction, score, confidence, rationale = self._interpret_catalyst(metrics)

        return SignalResult(
            signal_name=self.name,
            direction=direction,
            score=score,
            confidence=self.get_adjusted_confidence(confidence),
            rationale=rationale,
            details=metrics,
            timestamp=datetime.now(),
        )

    def _calculate_earnings_impact(
        self,
        days_to_earnings: int,
        stock_price: float,
        price_change_pct: float,
    ) -> Dict[str, Any]:
        """Calculate earnings catalyst metrics."""

        # Determine phase
        if -3 <= days_to_earnings <= 0:
            phase = "post_earnings"
            phase_desc = f"{abs(days_to_earnings)} days since earnings"
        elif 0 < days_to_earnings <= 3:
            phase = "imminent"
            phase_desc = f"{days_to_earnings} days until earnings"
        elif 3 < days_to_earnings <= 7:
            phase = "approaching"
            phase_desc = f"{days_to_earnings} days until earnings"
        else:
            if days_to_earnings < 0:
                phase = "past"
                phase_desc = f"{abs(days_to_earnings)} days since earnings (stale)"
            else:
                phase = "distant"
                phase_desc = f"{days_to_earnings} days until earnings (far away)"

        # Calculate reaction strength (for post-earnings)
        reaction_strength = "n/a"
        if phase == "post_earnings":
            if abs(price_change_pct) > 10:
                reaction_strength = "strong"
            elif abs(price_change_pct) > 5:
                reaction_strength = "moderate"
            elif abs(price_change_pct) > 2:
                reaction_strength = "mild"
            else:
                reaction_strength = "weak"

        return {
            "days_to_earnings": days_to_earnings,
            "phase": phase,
            "phase_description": phase_desc,
            "dynamic_weight": self._dynamic_weight,
            "price_change_pct": round(price_change_pct, 2),
            "reaction_strength": reaction_strength,
        }

    def _interpret_catalyst(
        self, metrics: Dict[str, Any]
    ) -> tuple[Direction, float, float, str]:
        """
        Interpret earnings catalyst into directional bias.

        Returns:
            (direction, score, confidence, rationale)
        """
        phase = metrics["phase"]
        days = metrics["days_to_earnings"]
        price_change = metrics["price_change_pct"]
        reaction = metrics["reaction_strength"]

        # POST-EARNINGS: Use price reaction as signal
        if phase == "post_earnings":
            if price_change > 5:
                direction = Direction.BULLISH
                score = min(price_change * 5, 100)  # Scale up reaction
                confidence = 75 if reaction == "strong" else 60
                rationale = f"Strong post-earnings rally ({price_change:+.1f}%) - momentum continuation likely"

            elif price_change < -5:
                direction = Direction.BEARISH
                score = max(price_change * 5, -100)
                confidence = 75 if reaction == "strong" else 60
                rationale = f"Steep post-earnings drop ({price_change:+.1f}%) - selling pressure persists"

            elif abs(price_change) > 2:
                # Mild reaction
                direction = Direction.BULLISH if price_change > 0 else Direction.BEARISH
                score = price_change * 10
                confidence = 50
                rationale = f"Modest post-earnings move ({price_change:+.1f}%) - direction confirmed but weak"

            else:
                # Weak/no reaction
                direction = Direction.NEUTRAL
                score = 0
                confidence = 40
                rationale = f"Muted post-earnings reaction ({price_change:+.1f}%) - market indifferent"

        # IMMINENT (0-3 days): HIGH UNCERTAINTY - suggest caution
        elif phase == "imminent":
            direction = Direction.NEUTRAL
            score = 0
            confidence = 30  # Low confidence due to binary risk
            rationale = f"Earnings in {days} days - high IV crush risk, suggest waiting for reaction"

        # APPROACHING (3-7 days): Anticipation building
        elif phase == "approaching":
            # Check if price is trending (might be front-running)
            if price_change > 3:
                direction = Direction.BULLISH
                score = 40  # Moderate score (not full conviction)
                confidence = 55
                rationale = f"Earnings in {days} days with bullish pre-earnings drift ({price_change:+.1f}%)"

            elif price_change < -3:
                direction = Direction.BEARISH
                score = -40
                confidence = 55
                rationale = f"Earnings in {days} days with bearish pre-earnings drift ({price_change:+.1f}%)"

            else:
                direction = Direction.NEUTRAL
                score = 0
                confidence = 45
                rationale = f"Earnings in {days} days - sideways action suggests waiting for catalyst"

        # DISTANT or PAST: Low relevance
        else:
            direction = Direction.NEUTRAL
            score = 0
            confidence = 30
            if phase == "distant":
                rationale = f"Earnings {days} days away - not imminent enough to impact short-term direction"
            else:
                rationale = f"Earnings {abs(days)} days ago - news is stale, focus on other catalysts"

        return direction, score, confidence, rationale

    @property
    def weight(self) -> float:
        """Return current dynamic weight."""
        return self._dynamic_weight

    @weight.setter
    def weight(self, value: float) -> None:
        """Set base weight (actual weight may be adjusted dynamically)."""
        self._weight = value
        self._dynamic_weight = value
