"""Analyst consensus signal for directional bias.

Theory: Wall Street analysts have access to management, detailed financials, and
industry contacts. While they're often late to react, consensus changes (upgrades/
downgrades) and price target divergence from current price can signal directional moves.

This signal analyzes:
1. Recommendation Mean (1=Strong Buy to 5=Sell)
2. Number of Analyst Opinions (coverage = reliability)
3. Target Price vs Current Price (expected upside/downside)
4. Recent recommendation changes (momentum)

Trading Logic:
- Strong Buy ratings + price below target = bullish
- Sell ratings + price above target = bearish
- More analyst coverage = more reliable signal
- Use as confirmation, not primary signal (analysts are often late)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from .base import Direction, Signal, SignalResult


class AnalystConsensusSignal(Signal):
    """Analyze Wall Street analyst consensus for directional bias."""

    def __init__(self, weight: float = 0.05):
        """Initialize with 5% weight (confirmation signal, not primary)."""
        super().__init__(name="Analyst Consensus", weight=weight)

    def get_required_data(self) -> List[str]:
        """Required data fields for analyst consensus."""
        return [
            "ticker_info",  # yfinance ticker.info dict
            "stock_price",  # Current stock price
        ]

    def calculate(self, data: Dict[str, Any]) -> SignalResult:
        """
        Calculate directional bias from analyst consensus.

        Args:
            data: Must contain ticker_info (dict) and stock_price

        Returns:
            SignalResult with analyst consensus directional bias
        """
        if not self.validate_data(data):
            return self._create_neutral_result("Missing required data")

        ticker_info = data.get("ticker_info", {})
        stock_price = float(data.get("stock_price", 0))

        if stock_price <= 0:
            return self._create_neutral_result("Invalid stock price")

        # Extract analyst data
        recommendation_mean = ticker_info.get('recommendationMean')
        num_analysts = ticker_info.get('numberOfAnalystOpinions', 0)
        target_mean = ticker_info.get('targetMeanPrice')
        target_high = ticker_info.get('targetHighPrice')
        target_low = ticker_info.get('targetLowPrice')
        recommendation_key = ticker_info.get('recommendationKey', 'none')

        # Need at least recommendation mean to proceed
        if recommendation_mean is None:
            return self._create_neutral_result("No analyst coverage")

        # Calculate metrics
        metrics = self._calculate_analyst_metrics(
            recommendation_mean,
            num_analysts,
            target_mean,
            target_high,
            target_low,
            stock_price,
            recommendation_key
        )

        # Determine directional bias
        direction, score, confidence, rationale = self._interpret_consensus(metrics)

        return SignalResult(
            signal_name=self.name,
            direction=direction,
            score=score,
            confidence=self.get_adjusted_confidence(confidence),
            rationale=rationale,
            details=metrics,
            timestamp=datetime.now(),
        )

    def _calculate_analyst_metrics(
        self,
        rec_mean: float,
        num_analysts: int,
        target_mean: float | None,
        target_high: float | None,
        target_low: float | None,
        current_price: float,
        rec_key: str,
    ) -> Dict[str, Any]:
        """Calculate analyst consensus metrics."""

        # Calculate upside/downside to target
        upside_pct = None
        if target_mean and current_price > 0:
            upside_pct = ((target_mean - current_price) / current_price) * 100

        # Calculate target range
        target_range_pct = None
        if target_high and target_low and current_price > 0:
            target_range_pct = ((target_high - target_low) / current_price) * 100

        # Recommendation strength (1=Strong Buy, 5=Sell)
        # Convert to more intuitive score (-100 to +100)
        rec_score = (3 - rec_mean) * 50  # 1->+100, 2->+50, 3->0, 4->-50, 5->-100

        # Coverage quality (more analysts = more reliable)
        if num_analysts >= 20:
            coverage_quality = "high"
        elif num_analysts >= 10:
            coverage_quality = "medium"
        elif num_analysts >= 5:
            coverage_quality = "low"
        else:
            coverage_quality = "very_low"

        return {
            "recommendation_mean": rec_mean,
            "recommendation_key": rec_key,
            "recommendation_score": rec_score,
            "num_analysts": num_analysts,
            "coverage_quality": coverage_quality,
            "target_mean_price": target_mean,
            "current_price": current_price,
            "upside_to_target_pct": round(upside_pct, 2) if upside_pct else None,
            "target_range_pct": round(target_range_pct, 2) if target_range_pct else None,
        }

    def _interpret_consensus(
        self, metrics: Dict[str, Any]
    ) -> tuple[Direction, float, float, str]:
        """
        Interpret analyst consensus into directional bias.

        Returns:
            (direction, score, confidence, rationale)
        """
        rec_mean = metrics["recommendation_mean"]
        rec_score = metrics["recommendation_score"]
        upside_pct = metrics["upside_to_target_pct"]
        coverage_quality = metrics["coverage_quality"]
        num_analysts = metrics["num_analysts"]

        # Base confidence on coverage quality
        if coverage_quality == "high":
            base_confidence = 70
        elif coverage_quality == "medium":
            base_confidence = 60
        elif coverage_quality == "low":
            base_confidence = 45
        else:
            base_confidence = 30  # Very few analysts - low confidence

        # Determine direction and score
        # Strong Buy (1.0-1.5) or Buy (1.5-2.5) with upside
        if rec_mean < 2.5 and upside_pct and upside_pct > 10:
            direction = Direction.BULLISH
            score = min(rec_score + (upside_pct / 2), 100)  # Combine rating + upside
            confidence = base_confidence
            rationale = f"{num_analysts} analysts rate {metrics['recommendation_key'].upper()} with {upside_pct:.1f}% upside to ${metrics['target_mean_price']:.2f} target"

        # Hold (2.5-3.5) - neutral
        elif 2.5 <= rec_mean <= 3.5:
            direction = Direction.NEUTRAL
            score = 0
            confidence = base_confidence * 0.7  # Lower confidence for neutral
            if upside_pct:
                rationale = f"{num_analysts} analysts rate HOLD. Target implies {upside_pct:.1f}% {'upside' if upside_pct > 0 else 'downside'}"
            else:
                rationale = f"{num_analysts} analysts rate HOLD - waiting for catalyst"

        # Sell (3.5-4.5) or Strong Sell (4.5-5.0) with downside
        elif rec_mean > 3.5 and upside_pct and upside_pct < -10:
            direction = Direction.BEARISH
            score = max(rec_score - (abs(upside_pct) / 2), -100)  # Negative score
            confidence = base_confidence
            rationale = f"{num_analysts} analysts rate {metrics['recommendation_key'].upper()} with {abs(upside_pct):.1f}% downside to ${metrics['target_mean_price']:.2f} target"

        # Edge case: Strong rating but price at/above target (exhausted move)
        elif rec_mean < 2.5 and upside_pct and upside_pct < 5:
            direction = Direction.NEUTRAL
            score = 0
            confidence = base_confidence * 0.5
            rationale = f"Analysts bullish but price near/above ${metrics['target_mean_price']:.2f} target - limited upside"

        # Edge case: Negative rating but price well below target (potential reversal)
        elif rec_mean > 3.5 and upside_pct and upside_pct > 5:
            direction = Direction.NEUTRAL
            score = 0
            confidence = base_confidence * 0.5
            rationale = f"Analysts bearish but price {upside_pct:.1f}% below target - mixed signals"

        # Default: Use recommendation score only
        else:
            if rec_score > 25:
                direction = Direction.BULLISH
            elif rec_score < -25:
                direction = Direction.BEARISH
            else:
                direction = Direction.NEUTRAL

            score = rec_score
            confidence = base_confidence * 0.6  # Lower confidence without target data
            rationale = f"{num_analysts} analysts rate {metrics['recommendation_key'].upper()} (mean: {rec_mean:.2f})"

        return direction, score, confidence, rationale
