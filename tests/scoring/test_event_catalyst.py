from datetime import date, timedelta

from src.models.option import OptionContract, OptionGreeks
from src.scoring.base import ScoreContext
from src.scoring.event_catalyst import EventCatalystScorer


def _sample_contract() -> OptionContract:
    expiration = (date.today() + timedelta(days=35)).isoformat()
    return OptionContract.parse_obj(
        {
            "symbol": "COIN",
            "type": "call",
            "strike": 150.0,
            "expiration": expiration,
            "lastPrice": 3.1,
            "bid": 3.0,
            "ask": 3.2,
            "volume": 4200,
            "openInterest": 5000,
            "impliedVolatility": 0.65,
            "stockPrice": 148.0,
        }
    )


def _build_context(event_data: dict) -> ScoreContext:
    return ScoreContext(
        contract=_sample_contract(),
        greeks=OptionGreeks(),
        market_data={"event_intel": event_data},
        config={"weights": {}},
    )


def test_event_catalyst_rewards_upcoming_earnings():
    scorer = EventCatalystScorer()
    context = _build_context(
        {
            "earnings_in_days": 3,
            "news_sentiment_score": 0.36,
            "news_sentiment_label": "bullish",
            "political_hits": ["policy"],
            "ai_infra_hits": ["data center"],
            "volatility_label": "elevated",
            "unique_drivers": ["AI infrastructure demand"],
        }
    )

    score, reasons, tags = scorer.score(context)

    assert score > 0
    assert any("Earnings within" in reason for reason in reasons)
    assert "catalyst" in tags
    assert "ai-infrastructure" in tags


def test_event_catalyst_penalizes_negative_headlines():
    scorer = EventCatalystScorer()
    context = _build_context(
        {
            "news_sentiment_score": -0.5,
            "news_sentiment_label": "bearish",
        }
    )

    score, reasons, tags = scorer.score(context)

    assert score < 0
    assert any("Headline risk" in reason for reason in reasons)
    assert "headline-risk" in tags
