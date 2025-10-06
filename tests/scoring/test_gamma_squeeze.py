from __future__ import annotations

from src.models.option import OptionContract, OptionGreeks
from src.scoring.base import ScoreContext
from src.scoring.gamma_squeeze import GammaSqueezeScorer


def _build_context(signal: dict | None) -> ScoreContext:
    contract = OptionContract.parse_obj(
        {
            "symbol": "AAPL",
            "type": "call",
            "strike": 150.0,
            "expiration": "2030-01-17",
            "lastPrice": 5.4,
            "bid": 5.3,
            "ask": 5.5,
            "volume": 8000,
            "openInterest": 12000,
            "impliedVolatility": 0.45,
            "stockPrice": 151.0,
        }
    )
    greeks = OptionGreeks(delta=0.55, gamma=0.012, theta=-0.03, vega=0.18)
    return ScoreContext(contract=contract, greeks=greeks, market_data={"gamma_squeeze": signal}, config={})


def test_gamma_squeeze_scores_extreme_short_gamma():
    signal = {
        "score": 65.0,
        "risk_level": "EXTREME",
        "max_short_gamma": -185_000,
        "squeeze_strike": 148.0,
        "call_volume_ratio": 2.5,
        "gamma_flip": 152.0,
        "reasons": ["Dealers short 185k gamma"],
    }
    context = _build_context(signal)
    scorer = GammaSqueezeScorer()

    score, reasons, tags = scorer.score(context)

    assert score > 70
    assert any("185,000" in reason for reason in reasons)
    assert "gamma-flip" in tags
    assert "volume-surge" in tags


def test_gamma_squeeze_handles_missing_signal():
    context = _build_context(None)
    scorer = GammaSqueezeScorer()

    score, reasons, tags = scorer.score(context)

    assert score == 5.0
    assert "No gamma positioning" in reasons[0]
    assert not tags
