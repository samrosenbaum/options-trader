from __future__ import annotations

from typing import List, Tuple

from .base import ScoreContext


class IVRankScorer:
    key = "iv_rank"
    default_weight = 1.2

    def score(self, context: ScoreContext) -> Tuple[float, List[str], List[str]]:
        iv_rank = context.market_data.get("iv_rank", 50.0)
        gamma = context.greeks.gamma
        vega = context.greeks.vega
        reasons: List[str] = []
        tags: List[str] = ["volatility"]
        score = 0.0

        if iv_rank > 80 and gamma > 0.01:
            score += 30
            reasons.append(
                f"Extreme IV rank ({iv_rank:.0f}%) with elevated gamma ({gamma:.3f})"
            )
            tags.append("gamma-squeeze")
        elif iv_rank > 70:
            score += 20
            reasons.append(f"High IV rank ({iv_rank:.0f}%)")
        elif iv_rank < 20 and vega > 0.1:
            score += 25
            reasons.append(
                f"Low IV rank ({iv_rank:.0f}%) with high vega ({vega:.2f}) for expansion"
            )
            tags.append("iv-expansion")
        else:
            score += 10

        squeeze_signal = context.market_data.get("gamma_squeeze", 0.0)
        if isinstance(squeeze_signal, dict):
            squeeze_score = float(squeeze_signal.get("score", 0.0))
        else:
            squeeze_score = float(squeeze_signal or 0.0)

        if squeeze_score:
            score += squeeze_score
            reasons.append("Gamma squeeze setup detected")
            tags.append("squeeze")

        return score, reasons, tags


__all__ = ["IVRankScorer"]

