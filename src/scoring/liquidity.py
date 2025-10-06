from __future__ import annotations

from typing import List, Tuple

from .base import ScoreContext


class LiquidityScorer:
    key = "liquidity"
    default_weight = 0.8

    def score(self, context: ScoreContext) -> Tuple[float, List[str], List[str]]:
        spread_pct = context.market_data.get("spread_pct", 1.0)
        open_interest = context.contract.open_interest
        reasons: List[str] = []
        tags: List[str] = ["liquidity"]
        score = 0.0

        if spread_pct < 0.03 and open_interest > 2000:
            score += 20
            reasons.append("Excellent liquidity (tight spread + high OI)")
            tags.append("institutional-interest")
        elif spread_pct < 0.05 and open_interest > 1000:
            score += 15
            reasons.append("Very good liquidity")
        elif spread_pct < 0.1:
            score += 10
        else:
            score += 3
            reasons.append("Wide spread may impact execution")
            tags.append("liquidity-warning")

        if open_interest > 5000:
            score += 12
            reasons.append(f"Very high open interest ({open_interest})")
            tags.append("open-interest")
        elif open_interest > 2000:
            score += 8
            reasons.append(f"High open interest ({open_interest})")
        elif open_interest < 500:
            score -= 5
            reasons.append("Low open interest - harder fills")
            tags.append("thin-market")

        return score, reasons, tags


__all__ = ["LiquidityScorer"]

