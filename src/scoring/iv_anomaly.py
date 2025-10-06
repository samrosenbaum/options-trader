"""Statistical implied volatility anomaly detection."""

from __future__ import annotations

from typing import Dict, List, Tuple

from .base import ScoreContext


class IVAnomalyScorer:
    """Score contracts based on IV z-score and realized/ implied spreads."""

    key = "iv_anomaly"
    default_weight = 1.4

    def score(self, context: ScoreContext) -> Tuple[float, List[str], List[str]]:
        stats: Dict[str, float] = context.market_data.get("iv_anomaly", {})
        zscore = stats.get("zscore")
        percentile = stats.get("percentile")
        iv = stats.get("current_iv")
        mean_iv = stats.get("mean_iv")
        realized = stats.get("realized_vol")
        spread = stats.get("iv_rv_spread")

        score = 5.0  # baseline contribution when we have no signal
        reasons: List[str] = []
        tags: List[str] = []

        if zscore is None:
            reasons.append("Insufficient IV history for anomaly analysis")
            return score, reasons, tags

        # Reward extreme deviations from the historical mean.
        abs_z = abs(zscore)
        if abs_z >= 3:
            score += 45
            tags.append("iv-extreme")
        elif abs_z >= 2:
            score += 30
            tags.append("iv-outlier")
        elif abs_z >= 1:
            score += 18

        direction = "above" if zscore > 0 else "below"
        if abs_z >= 1:
            reasons.append(
                f"Implied volatility {direction} historical mean by {abs_z:.1f}σ"
            )

        if percentile is not None:
            percentile_pct = percentile * 100
            if percentile_pct >= 95:
                score += 8
                tags.append("iv-high")
                reasons.append(f"Current IV at {percentile_pct:.0f}th percentile of lookback")
            elif percentile_pct <= 5:
                score += 8
                tags.append("iv-low")
                reasons.append(f"Current IV at {percentile_pct:.0f}th percentile of lookback")

        if spread is not None and realized is not None:
            if spread > 0:
                score += min(12, spread)
                reasons.append(
                    f"IV exceeds 30d realized vol by {spread:.1f} pts ({iv:.1f} vs {realized:.1f})"
                )
                tags.append("iv-rich")
            elif spread < 0:
                score += min(12, abs(spread))
                reasons.append(
                    f"IV discounted to realized vol by {abs(spread):.1f} pts ({iv:.1f} vs {realized:.1f})"
                )
                tags.append("iv-cheap")

        if mean_iv is not None and iv is not None:
            reasons.append(f"Current IV {iv:.1f}%, lookback mean {mean_iv:.1f}%")

        return score, reasons, tags


__all__ = ["IVAnomalyScorer"]

