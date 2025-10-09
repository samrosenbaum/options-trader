"""Signal aggregation framework for combining multiple directional signals.

This module takes results from multiple signals (Options Skew, Smart Money Flow, etc.)
and combines them into a single directional prediction with confidence scoring.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

import numpy as np

from .base import Direction, DirectionalScore, Signal, SignalResult


class SignalAggregator:
    """Combine multiple directional signals into a unified prediction."""

    def __init__(self, signals: List[Signal]):
        """
        Initialize aggregator with a list of signals.

        Args:
            signals: List of Signal objects to aggregate
        """
        self.signals = signals
        self._validate_weights()

    def _validate_weights(self) -> None:
        """Ensure signal weights sum to approximately 1.0."""
        total_weight = sum(signal.weight for signal in self.signals)
        if abs(total_weight - 1.0) > 0.01:
            print(f"Warning: Signal weights sum to {total_weight:.3f}, not 1.0. Consider normalizing.")

    def aggregate(self, symbol: str, data: Dict[str, any]) -> DirectionalScore:
        """
        Calculate aggregate directional score from all signals.

        Args:
            symbol: Stock symbol being analyzed
            data: Dictionary containing all data needed by signals

        Returns:
            DirectionalScore with unified prediction
        """
        # Calculate all signal results
        signal_results: List[SignalResult] = []

        for signal in self.signals:
            try:
                if signal.validate_data(data):
                    result = signal.calculate(data)
                    signal_results.append(result)
                else:
                    # Create neutral result for missing data
                    signal_results.append(
                        SignalResult(
                            signal_name=signal.name,
                            direction=Direction.NEUTRAL,
                            score=0.0,
                            confidence=0.0,
                            rationale=f"Missing required data for {signal.name}",
                            details={"error": "missing_data"},
                            timestamp=datetime.now(),
                        )
                    )
            except Exception as e:
                print(f"Error calculating {signal.name}: {e}")
                # Add error result
                signal_results.append(
                    SignalResult(
                        signal_name=signal.name,
                        direction=Direction.NEUTRAL,
                        score=0.0,
                        confidence=0.0,
                        rationale=f"Error in {signal.name}: {str(e)}",
                        details={"error": str(e)},
                        timestamp=datetime.now(),
                    )
                )

        # Aggregate scores
        weighted_score = self._calculate_weighted_score(signal_results)
        confidence = self._calculate_aggregate_confidence(signal_results)
        direction = self._determine_direction(weighted_score)
        recommendation = self._generate_recommendation(direction, confidence, weighted_score)

        return DirectionalScore(
            symbol=symbol,
            direction=direction,
            score=weighted_score,
            confidence=confidence,
            signals=signal_results,
            recommendation=recommendation,
            timestamp=datetime.now(),
        )

    def _calculate_weighted_score(self, results: List[SignalResult]) -> float:
        """
        Calculate weighted average score from all signals.

        Score ranges from -100 (very bearish) to +100 (very bullish).
        """
        total_weighted_score = 0.0
        total_weight = 0.0

        for i, result in enumerate(results):
            signal = self.signals[i]

            # Only include signals with meaningful confidence
            if result.confidence > 10:
                weight = signal.weight * (result.confidence / 100.0)
                total_weighted_score += result.score * weight
                total_weight += weight

        if total_weight == 0:
            return 0.0

        # Normalize by actual weights used
        return total_weighted_score / total_weight

    def _calculate_aggregate_confidence(self, results: List[SignalResult]) -> float:
        """
        Calculate overall confidence in the prediction.

        Confidence is higher when:
        1. Signals agree on direction
        2. Individual signals have high confidence
        3. Multiple signals are contributing (not just one)
        """
        if not results:
            return 0.0

        # Filter out low-confidence signals
        meaningful_results = [r for r in results if r.confidence > 10]

        if not meaningful_results:
            return 0.0

        # 1. Signal agreement (what % point in the same direction)
        bullish_count = sum(1 for r in meaningful_results if r.score > 20)
        bearish_count = sum(1 for r in meaningful_results if r.score < -20)
        neutral_count = len(meaningful_results) - bullish_count - bearish_count

        max_agreement = max(bullish_count, bearish_count, neutral_count)
        agreement_rate = max_agreement / len(meaningful_results)
        agreement_score = agreement_rate * 100

        # 2. Average individual confidence
        avg_confidence = np.mean([r.confidence for r in meaningful_results])

        # 3. Diversification bonus (more signals = more reliable)
        diversification_factor = min(1.0, len(meaningful_results) / len(self.signals))

        # Combine factors
        base_confidence = (agreement_score * 0.4) + (avg_confidence * 0.5) + (diversification_factor * 10)

        # Penalize if disagreement is high
        if bullish_count > 0 and bearish_count > 0:
            disagreement_penalty = min(bullish_count, bearish_count) / len(meaningful_results) * 20
            base_confidence -= disagreement_penalty

        return np.clip(base_confidence, 0, 95)

    def _determine_direction(self, score: float) -> Direction:
        """Determine overall direction from aggregate score."""
        if score > 15:
            return Direction.BULLISH
        elif score < -15:
            return Direction.BEARISH
        else:
            return Direction.NEUTRAL

    def _generate_recommendation(self, direction: Direction, confidence: float, score: float) -> str:
        """Generate human-readable recommendation."""
        strength = self._get_strength_label(confidence)
        direction_label = direction.value.capitalize()

        if direction == Direction.NEUTRAL:
            return "No clear directional bias - consider strategies that profit from range-bound movement or wait for clearer signals."

        option_type = "calls" if direction == Direction.BULLISH else "puts"
        opposite_type = "puts" if direction == Direction.BULLISH else "calls"

        if confidence >= 75:
            return f"{strength} {direction_label} - Strong conviction to favor {option_type} over {opposite_type}. Multiple signals confirm this direction."
        elif confidence >= 60:
            return f"{strength} {direction_label} - Moderate conviction to favor {option_type}. Consider sizing accordingly."
        else:
            return f"{strength} {direction_label} - Weak signal favoring {option_type}, but low confidence. Use cautiously or wait for confirmation."

    def _get_strength_label(self, confidence: float) -> str:
        """Get strength label based on confidence."""
        if confidence >= 75:
            return "Strong"
        elif confidence >= 60:
            return "Moderate"
        elif confidence >= 45:
            return "Weak"
        else:
            return "Very Weak"

    def get_signal_breakdown(self, directional_score: DirectionalScore) -> Dict[str, any]:
        """
        Get detailed breakdown of how each signal contributed.

        Useful for debugging and user transparency.
        """
        breakdown = {
            "overall": {
                "symbol": directional_score.symbol,
                "direction": directional_score.direction.value,
                "score": round(directional_score.score, 2),
                "confidence": round(directional_score.confidence, 2),
                "recommendation": directional_score.recommendation,
            },
            "signals": [],
        }

        for i, result in enumerate(directional_score.signals):
            signal = self.signals[i]
            breakdown["signals"].append(
                {
                    "name": result.signal_name,
                    "weight": signal.weight,
                    "direction": result.direction.value,
                    "score": round(result.score, 2),
                    "confidence": round(result.confidence, 2),
                    "weighted_contribution": round(result.score * signal.weight * (result.confidence / 100), 2),
                    "rationale": result.rationale,
                }
            )

        return breakdown
