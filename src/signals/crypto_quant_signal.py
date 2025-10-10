"""Crypto-specific quant signal combining news, derivatives, and on-chain context."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Tuple

import numpy as np

from .base import Direction, Signal, SignalResult


class CryptoQuantSignal(Signal):
    """Blend crypto news, derivatives positioning, and on-chain structure."""

    def __init__(self, weight: float = 0.15) -> None:
        super().__init__("Crypto Intelligence Blend", weight=weight)

    def get_required_data(self) -> list[str]:
        return ["quant_insights"]

    def calculate(self, data: Dict[str, Any]) -> SignalResult:
        insights: Dict[str, Any] = data.get("quant_insights", {}) or {}
        news = insights.get("news", {}) or {}
        derivatives = insights.get("derivatives", {}) or {}
        onchain = insights.get("onchain", {}) or {}

        sentiment_component = self._score_sentiment(news)
        derivatives_component = self._score_derivatives(derivatives)
        structure_component = self._score_market_structure(onchain)

        composite = (
            sentiment_component * 0.45
            + derivatives_component * 0.35
            + structure_component * 0.20
        )
        score = float(np.clip(composite * 100.0, -100.0, 100.0))

        direction = self._determine_direction(score)
        confidence = self._calculate_confidence(news, derivatives, onchain, score)

        rationale = self._build_rationale(
            direction,
            score,
            sentiment_component,
            derivatives_component,
            structure_component,
            news,
            derivatives,
            onchain,
        )

        details = {
            "sentiment_component": sentiment_component,
            "derivatives_component": derivatives_component,
            "structure_component": structure_component,
            "composite": composite,
            "inputs": insights,
        }

        return SignalResult(
            signal_name=self.name,
            direction=direction,
            score=score,
            confidence=confidence,
            rationale=rationale,
            details=details,
            timestamp=datetime.utcnow(),
        )

    def _score_sentiment(self, news: Dict[str, Any]) -> float:
        if not news:
            return 0.0

        base = float(news.get("sentiment_score", 0.0))
        momentum = float(news.get("momentum_score", 0.0))
        buzz = float(news.get("buzz_score", 0.0))

        # Stronger weight on raw sentiment, but factor in recency momentum and buzz
        combined = (base * 0.7) + (momentum * 0.2) + (buzz * 0.1)
        return float(np.clip(combined, -1.0, 1.0))

    def _score_derivatives(self, derivatives: Dict[str, Any]) -> float:
        if not derivatives:
            return 0.0

        basis_score = float(derivatives.get("basis_score", 0.0))
        funding_score = float(derivatives.get("funding_score", 0.0))
        open_interest_score = float(derivatives.get("open_interest_score", 0.0))

        composite = (basis_score * 0.6) + (funding_score * 0.25) + (open_interest_score * 0.15)
        return float(np.clip(composite, -1.0, 1.0))

    def _score_market_structure(self, onchain: Dict[str, Any]) -> float:
        if not onchain:
            return 0.0

        momentum_score = float(onchain.get("momentum_score", 0.0))
        volume_score = float(onchain.get("volume_score", 0.0))
        volatility_bias = float(onchain.get("volatility_bias", 0.0))
        macro_bias = float(onchain.get("macro_bias", 0.0))

        composite = (
            (momentum_score * 0.5)
            + (volume_score * 0.25)
            + (volatility_bias * 0.15)
            + (macro_bias * 0.10)
        )
        return float(np.clip(composite, -1.0, 1.0))

    def _determine_direction(self, score: float) -> Direction:
        if score > 15:
            return Direction.BULLISH
        if score < -15:
            return Direction.BEARISH
        return Direction.NEUTRAL

    def _calculate_confidence(
        self,
        news: Dict[str, Any],
        derivatives: Dict[str, Any],
        onchain: Dict[str, Any],
        score: float,
    ) -> float:
        article_count = int(news.get("article_count", 0) or 0)
        recent_count = int(news.get("recent_count", 0) or 0)
        buzz_score = float(news.get("buzz_score", 0.0))

        derivative_points = int(derivatives.get("tickers_analyzed", 0) or 0)
        funding_strength = abs(float(derivatives.get("funding_score", 0.0)))
        basis_strength = abs(float(derivatives.get("basis_score", 0.0)))

        structure_points = int(onchain.get("data_points", 0) or 0)
        structure_strength = abs(float(onchain.get("momentum_score", 0.0)))

        news_conf = min(40.0, (article_count * 4.5) + (recent_count * 2.5) + (buzz_score * 10.0))
        deriv_conf = min(35.0, (derivative_points * 5.0) + ((funding_strength + basis_strength) * 15.0))
        structure_conf = min(25.0, (structure_points * 4.0) + (structure_strength * 10.0))

        total = news_conf + deriv_conf + structure_conf

        # Scale additional conviction if the absolute score is extreme
        conviction_bonus = min(15.0, abs(score) / 100.0 * 20.0)
        return float(np.clip(total + conviction_bonus, 0.0, 95.0))

    def _build_rationale(
        self,
        direction: Direction,
        score: float,
        sentiment_component: float,
        derivatives_component: float,
        structure_component: float,
        news: Dict[str, Any],
        derivatives: Dict[str, Any],
        onchain: Dict[str, Any],
    ) -> str:
        direction_label = direction.value.capitalize()
        sentiment_pct, deriv_pct, structure_pct = self._format_components(
            sentiment_component, derivatives_component, structure_component
        )

        headline = (
            f"{direction_label} tilt powered by {sentiment_pct} news flow, "
            f"{deriv_pct} derivatives positioning, and {structure_pct} on-chain structure."
        )

        if not news and not derivatives and not onchain:
            return "Insufficient alternative data to influence directional view."

        details = []
        if news:
            avg_sentiment = news.get("sentiment_score")
            sample_headlines = news.get("top_headlines", [])
            sentiment_comment = (
                f"News sentiment {avg_sentiment:+.2f} with {news.get('positive', 0)} bullish vs "
                f"{news.get('negative', 0)} bearish headlines"
            )
            if sample_headlines:
                sentiment_comment += f". Latest: {sample_headlines[0]}"
            details.append(sentiment_comment)

        if derivatives:
            bias = derivatives.get("long_short_bias", "balanced")
            basis = derivatives.get("avg_basis", 0.0)
            funding = derivatives.get("avg_funding_rate", 0.0)
            expiry = derivatives.get("dominant_expiry", "perpetual focus")
            details.append(
                "Derivatives show {bias} positioning (basis {basis:+.2%}, funding {funding:+.3%}, "
                f"key expiry: {expiry}).".format(bias=bias, basis=basis, funding=funding)
            )

        if onchain:
            vol_ratio = onchain.get("volume_market_cap_ratio", 0.0)
            momentum = onchain.get("momentum_score", 0.0)
            details.append(
                f"On-chain flow ratio {vol_ratio:.2f} and momentum score {momentum:+.2f} contextualize the move."
            )

        tail_note = f" Composite directional score {score:+.1f}."
        return f"{headline} {' '.join(details)}{tail_note}"

    def _format_components(self, *components: float) -> Tuple[str, ...]:
        labels = []
        for value in components:
            pct = np.clip((value + 1.0) / 2.0, 0.0, 1.0) * 100.0
            if value > 0.15:
                tone = "bullish"
            elif value < -0.15:
                tone = "bearish"
            else:
                tone = "neutral"
            labels.append(f"{pct:.0f}% {tone}")
        return tuple(labels)
