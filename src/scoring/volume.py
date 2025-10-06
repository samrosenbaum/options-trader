from __future__ import annotations

from typing import List, Tuple

from .base import ScoreContext


class VolumeScorer:
    key = "volume"
    default_weight = 1.0

    def score(self, context: ScoreContext) -> Tuple[float, List[str], List[str]]:
        ratio = context.market_data.get("volume_ratio", 0.0)
        score = 0.0
        reasons: List[str] = []
        tags: List[str] = []

        if ratio > 5:
            score += 35
            reasons.append(f"Extreme unusual volume ({ratio:.1f}x open interest)")
            tags.extend(["unusual-volume", "smart-money"])
        elif ratio > 3:
            score += 25
            reasons.append(f"Very high unusual volume ({ratio:.1f}x open interest)")
            tags.append("unusual-volume")
        elif ratio > 2:
            score += 15
            reasons.append(f"Unusual volume ({ratio:.1f}x open interest)")
        elif ratio > 1:
            score += 8
        else:
            score += 3

        return score, reasons, tags


__all__ = ["VolumeScorer"]

