"""Unit tests for the swing signal analyzer."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Iterable, List

import pandas as pd
import pytest

from src.analysis import FactorScore, SwingSignalAnalyzer
from src.analysis.news_sentiment import NewsHeadline


def build_history(periods: int = 60) -> pd.DataFrame:
    base_date = datetime(2024, 1, 1)
    dates = [base_date + timedelta(days=i) for i in range(periods)]
    close = pd.Series([100 + i * 0.8 for i in range(periods)])
    high = close + 1.5
    low = close - 1.5
    volume = pd.Series([1_000_000 + (i * 20_000) for i in range(periods)])

    return pd.DataFrame(
        {
            "High": high.values,
            "Low": low.values,
            "Close": close.values,
            "Volume": volume.values,
        },
        index=pd.DatetimeIndex(dates),
    )


def fake_price_fetcher(symbol: str, lookback: str, interval: str) -> pd.DataFrame:  # noqa: ARG001
    return build_history()


def fake_news_fetcher(symbol: str, limit: int) -> Iterable[NewsHeadline]:  # noqa: ARG001
    headlines: List[NewsHeadline] = [
        NewsHeadline(
            title="Company announces record guidance",
            summary="Management guided to massive revenue growth",
            url="https://example.com/news",
            publisher="Example",
            sentiment_score=0.8,
            sentiment_label="very_bullish",
        ),
        NewsHeadline(
            title="Analyst upgrades shares",
            summary="Upgrade cites strong momentum",
            url="https://example.com/upgrade",
            publisher="Example",
            sentiment_score=0.4,
            sentiment_label="bullish",
        ),
    ]
    return headlines[:limit]


def fake_market_fetcher() -> dict[str, float]:
    return {"vix_ratio": 1.4, "spy_return_5d": -0.015}


def test_analyzer_produces_high_score_with_bullish_inputs():
    analyzer = SwingSignalAnalyzer(
        price_fetcher=fake_price_fetcher,
        news_fetcher=fake_news_fetcher,
        market_fetcher=fake_market_fetcher,
    )

    signal = analyzer.analyze("AAPL")

    assert signal.composite_score >= 55
    assert signal.classification in {"watchlist", "elevated_swing_risk"}
    assert any(isinstance(factor, FactorScore) and factor.name == "News & Catalysts" for factor in signal.factors)


def test_analyzer_requires_sufficient_history():
    def short_history_fetcher(symbol: str, lookback: str, interval: str) -> pd.DataFrame:  # noqa: ARG001
        return build_history(periods=10)

    analyzer = SwingSignalAnalyzer(price_fetcher=short_history_fetcher)

    with pytest.raises(ValueError):
        analyzer.analyze("MSFT")


def test_analyzer_handles_multiindex_history():
    def multiindex_fetcher(symbol: str, lookback: str, interval: str) -> pd.DataFrame:  # noqa: ARG001
        history = build_history()
        history.columns = pd.MultiIndex.from_product([[symbol], history.columns])
        return history

    analyzer = SwingSignalAnalyzer(
        price_fetcher=multiindex_fetcher,
        news_fetcher=fake_news_fetcher,
        market_fetcher=fake_market_fetcher,
    )

    signal = analyzer.analyze("TSLA")

    assert signal.classification in {"watchlist", "elevated_swing_risk", "calm"}
