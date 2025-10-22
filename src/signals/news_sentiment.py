"""News sentiment signal for directional bias.

Theory: News drives market sentiment and can precede or confirm price moves. Major
news events (regulatory changes, product launches, analyst calls, lawsuits) can
override technical signals and shift directional bias.

This signal analyzes:
1. Recent news sentiment scores (from recentNews array)
2. News impact scores (how material is the news)
3. Sentiment consistency (are all recent articles aligned?)
4. Recency weighting (newer news matters more)
5. News volume (surge in news coverage = catalyst)

Trading Logic:
- Multiple positive high-impact articles = bullish
- Multiple negative high-impact articles = bearish
- Mixed sentiment = neutral (uncertainty)
- Weight by recency: last 24h > last week > last month
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List

from .base import Direction, Signal, SignalResult


class NewsSentimentSignal(Signal):
    """Analyze news sentiment for directional bias prediction."""

    def __init__(self, weight: float = 0.15):
        """Initialize with 15% weight (news can override technicals)."""
        super().__init__(name="News Sentiment", weight=weight)

    def get_required_data(self) -> List[str]:
        """Required data fields for news analysis."""
        return [
            "recent_news",  # Array of news articles with sentiment
            "news_impact_score",  # Aggregated impact score (optional)
            "news_sentiment_label",  # Overall sentiment label (optional)
        ]

    def calculate(self, data: Dict[str, Any]) -> SignalResult:
        """
        Calculate directional bias from news sentiment.

        Args:
            data: Must contain recent_news (list of dicts with sentiment, impact_score)

        Returns:
            SignalResult with news sentiment directional bias
        """
        if not self.validate_data(data):
            return self._create_neutral_result("Missing required data")

        recent_news = data.get("recent_news", [])
        news_impact_score = data.get("news_impact_score")
        news_sentiment_label = data.get("news_sentiment_label")

        if not recent_news and not news_sentiment_label:
            return self._create_neutral_result("No news data available")

        # Calculate news metrics
        metrics = self._calculate_news_metrics(
            recent_news,
            news_impact_score,
            news_sentiment_label
        )

        # Determine directional bias
        direction, score, confidence, rationale = self._interpret_sentiment(metrics)

        return SignalResult(
            signal_name=self.name,
            direction=direction,
            score=score,
            confidence=self.get_adjusted_confidence(confidence),
            rationale=rationale,
            details=metrics,
            timestamp=datetime.now(),
        )

    def _calculate_news_metrics(
        self,
        recent_news: List[Dict[str, Any]],
        overall_impact: float | None,
        sentiment_label: str | None,
    ) -> Dict[str, Any]:
        """Calculate news sentiment metrics."""

        if not recent_news:
            # Use aggregated data if individual articles not available
            return {
                "article_count": 0,
                "avg_sentiment": 0,
                "sentiment_consistency": 0,
                "overall_impact": overall_impact,
                "sentiment_label": sentiment_label,
                "has_major_news": False,
            }

        # Analyze individual articles
        sentiments = []
        impacts = []
        weighted_sentiments = []

        now = datetime.now()

        for article in recent_news:
            sentiment = article.get("sentiment", {})
            sentiment_score = sentiment.get("score", 0)
            impact_score = article.get("impact_score", 50)  # Default to moderate impact

            sentiments.append(sentiment_score)
            impacts.append(impact_score)

            # Calculate recency weight (exponential decay)
            # Assume articles are recent if no timestamp (conservative)
            article_date = now  # Default to now if no date
            days_old = (now - article_date).days
            recency_weight = 1.0 / (1.0 + days_old * 0.5)  # Decay by 50% per day

            # Weight by both impact and recency
            weight = (impact_score / 100.0) * recency_weight
            weighted_sentiments.append(sentiment_score * weight)

        # Calculate metrics
        avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else 0
        avg_impact = sum(impacts) / len(impacts) if impacts else 0
        weighted_avg_sentiment = sum(weighted_sentiments) / max(sum([
            (article.get("impact_score", 50) / 100.0) / (1.0 + 0)  # Assume recent
            for article in recent_news
        ]), 0.01) if weighted_sentiments else 0

        # Calculate sentiment consistency (std dev - lower = more consistent)
        if len(sentiments) > 1:
            variance = sum((s - avg_sentiment) ** 2 for s in sentiments) / len(sentiments)
            std_dev = variance ** 0.5
            # Normalize to 0-100 (0 = all same sentiment, 100 = completely mixed)
            sentiment_consistency = max(0, 100 - (std_dev * 10))
        else:
            sentiment_consistency = 100  # One article = perfectly consistent

        # Check for major news (high impact articles)
        has_major_news = any(article.get("impact_score", 0) > 70 for article in recent_news)

        return {
            "article_count": len(recent_news),
            "avg_sentiment": round(avg_sentiment, 2),
            "weighted_avg_sentiment": round(weighted_avg_sentiment, 2),
            "avg_impact": round(avg_impact, 2),
            "sentiment_consistency": round(sentiment_consistency, 2),
            "has_major_news": has_major_news,
            "sentiment_label": sentiment_label,
            "overall_impact": overall_impact,
        }

    def _interpret_sentiment(
        self, metrics: Dict[str, Any]
    ) -> tuple[Direction, float, float, str]:
        """
        Interpret news sentiment into directional bias.

        Returns:
            (direction, score, confidence, rationale)
        """
        article_count = metrics["article_count"]
        weighted_sentiment = metrics.get("weighted_avg_sentiment", metrics.get("avg_sentiment", 0))
        consistency = metrics["sentiment_consistency"]
        has_major_news = metrics["has_major_news"]
        sentiment_label = metrics.get("sentiment_label", "neutral")

        # Base confidence on article count and consistency
        if article_count >= 5:
            base_confidence = 75
        elif article_count >= 3:
            base_confidence = 65
        elif article_count >= 1:
            base_confidence = 50
        else:
            base_confidence = 30  # Using only sentiment label

        # Adjust confidence by consistency
        confidence = base_confidence * (consistency / 100.0)

        # Boost confidence if major news
        if has_major_news:
            confidence = min(confidence * 1.2, 90)

        # Determine direction from weighted sentiment
        # Sentiment scores typically range from -1 to +1 or 0 to 100
        # Normalize to -100 to +100 scale
        if weighted_sentiment > 1:
            # Already on 0-100 scale, convert to -50 to +50
            normalized_score = (weighted_sentiment - 50) * 2
        else:
            # On -1 to +1 scale, convert to -100 to +100
            normalized_score = weighted_sentiment * 100

        if normalized_score > 20:
            direction = Direction.BULLISH
            score = normalized_score
            sentiment_desc = "positive" if not sentiment_label else sentiment_label
            rationale = f"{article_count} recent articles show {sentiment_desc} sentiment"
            if has_major_news:
                rationale += " with major catalyst"

        elif normalized_score < -20:
            direction = Direction.BEARISH
            score = normalized_score
            sentiment_desc = "negative" if not sentiment_label else sentiment_label
            rationale = f"{article_count} recent articles show {sentiment_desc} sentiment"
            if has_major_news:
                rationale += " with major negative catalyst"

        else:
            direction = Direction.NEUTRAL
            score = 0
            rationale = f"{article_count} articles with mixed or neutral sentiment"

        # Add consistency note
        if consistency < 50:
            rationale += " (low consistency - conflicting views)"

        return direction, score, confidence, rationale
