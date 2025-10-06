from __future__ import annotations

from typing import List, Sequence, Tuple

from .base import ScoreContext


class EventCatalystScorer:
    """Scores contracts based on upcoming catalysts and thematic drivers."""

    key = "event_catalyst"
    default_weight = 1.1

    _BULLISH_SENTIMENT_THRESHOLD = 0.3
    _BEARISH_SENTIMENT_THRESHOLD = -0.3

    def score(self, context: ScoreContext) -> Tuple[float, List[str], List[str]]:
        data = context.market_data.get("event_intel", {})
        reasons: List[str] = []
        tags: List[str] = ["catalyst"]
        score = 0.0

        earnings_in_days = self._get_number(data, "earnings_in_days")
        if earnings_in_days is not None:
            if 0 <= earnings_in_days <= 7:
                score += 18
                reasons.append(f"Earnings within {int(earnings_in_days)} days")
                tags.extend(["earnings-play", "volatility-catalyst"])
            elif 7 < earnings_in_days <= 14:
                score += 10
                reasons.append("Earnings approaching in two weeks")
            elif earnings_in_days < 0:
                days_since = abs(int(earnings_in_days))
                if days_since <= 3:
                    score += 12
                    reasons.append("Fresh post-earnings momentum window")
                    tags.append("post-earnings")
                elif days_since <= 7:
                    score += 6
                    reasons.append("Recent earnings move still in play")

        sentiment_score = self._get_number(data, "news_sentiment_score")
        sentiment_label = data.get("news_sentiment_label")
        if sentiment_score is not None:
            if sentiment_score >= self._BULLISH_SENTIMENT_THRESHOLD:
                score += 12
                reasons.append(
                    f"Positive news flow ({sentiment_label or 'bullish'}) driving interest"
                )
                tags.append("news-tailwind")
            elif sentiment_score <= self._BEARISH_SENTIMENT_THRESHOLD:
                score -= 15
                reasons.append(
                    f"Headline risk detected ({sentiment_label or 'bearish'} sentiment)"
                )
                tags.append("headline-risk")
            else:
                score += 4
                reasons.append("Neutral-to-positive headline tone")

        political_hits: Sequence[str] = data.get("political_hits", [])
        if political_hits:
            score += 8
            reasons.append(f"Policy catalyst in play: {', '.join(political_hits[:2])}")
            tags.append("policy-catalyst")

        ai_hits: Sequence[str] = data.get("ai_infra_hits", [])
        if ai_hits:
            score += 9
            reasons.append("AI/infra demand narrative supporting flows")
            tags.append("ai-infrastructure")

        volatility_label = data.get("volatility_label")
        if volatility_label in {"extreme", "elevated"}:
            score += 6
            reasons.append("Underlying exhibits outsized realized volatility")
            tags.append("high-volatility")

        focus_flags: Sequence[str] = data.get("unique_drivers", [])
        if focus_flags:
            score += 5
            reasons.append(f"Unique opportunity drivers: {', '.join(focus_flags[:3])}")
            tags.append("unique-opportunity")

        if not reasons:
            score -= 5
            reasons.append("No identifiable catalyst edge")
            tags.append("no-catalyst")

        return score, reasons, sorted(set(tags))

    @staticmethod
    def _get_number(data: dict, key: str) -> float | None:
        value = data.get(key)
        try:
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            return None


__all__ = ["EventCatalystScorer"]
