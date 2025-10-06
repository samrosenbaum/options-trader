"""Dealer gamma positioning scorer."""

from __future__ import annotations

from typing import List, Tuple

from .base import ScoreContext


class GammaSqueezeScorer:
    """Convert dealer gamma analytics into a weighted score."""

    key = "gamma_squeeze"
    default_weight = 1.1

    _LEVEL_SCORES = {
        "MINIMAL": 10.0,
        "LOW": 20.0,
        "MODERATE": 38.0,
        "HIGH": 55.0,
        "EXTREME": 70.0,
    }

    def score(self, context: ScoreContext) -> Tuple[float, List[str], List[str]]:
        signal = context.market_data.get("gamma_squeeze")
        reasons: List[str] = []
        tags: List[str] = ["gamma"]

        if not isinstance(signal, dict) or not signal:
            reasons.append("No gamma positioning data available")
            return 5.0, reasons, []

        risk_level = str(signal.get("risk_level", "MINIMAL")).upper()
        base_score = self._LEVEL_SCORES.get(risk_level, 10.0)

        score = base_score
        dealer_short = float(signal.get("max_short_gamma", 0.0))
        squeeze_strike = signal.get("squeeze_strike")
        volume_ratio = signal.get("call_volume_ratio")

        if dealer_short:
            reasons.append(
                f"Dealers short {abs(dealer_short):,.0f} gamma near ${float(squeeze_strike):.2f}"
                if squeeze_strike is not None
                else f"Dealers short {abs(dealer_short):,.0f} gamma"
            )
            tags.append("dealer-short")

        if volume_ratio is not None:
            score += min(10.0, max(0.0, (float(volume_ratio) - 1.0) * 8.0))
            reasons.append(f"Call volume/OI ratio {float(volume_ratio):.1f} at squeeze strike")
            if float(volume_ratio) >= 2.0:
                tags.append("volume-surge")

        gamma_flip = signal.get("gamma_flip")
        if gamma_flip is not None:
            reasons.append(f"Gamma flip projected near ${float(gamma_flip):.2f}")
            tags.append("gamma-flip")

        extra_reasons = signal.get("reasons")
        if isinstance(extra_reasons, list):
            for item in extra_reasons:
                if item not in reasons:
                    reasons.append(str(item))

        return score, reasons, list(sorted(set(tags)))


__all__ = ["GammaSqueezeScorer"]
