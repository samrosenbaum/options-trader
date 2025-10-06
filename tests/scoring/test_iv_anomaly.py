from __future__ import annotations

from src.scoring.iv_anomaly import IVAnomalyScorer
from src.scoring.base import ScoreContext
from src.models.option import OptionContract, OptionGreeks


def _build_context(zscore: float | None, spread: float = 0.0) -> ScoreContext:
    contract = OptionContract.parse_obj(
        {
            "symbol": "TSLA",
            "type": "call",
            "strike": 200.0,
            "expiration": "2030-01-17",
            "lastPrice": 12.5,
            "bid": 12.4,
            "ask": 12.6,
            "volume": 1000,
            "openInterest": 5000,
            "impliedVolatility": 0.65,
            "stockPrice": 198.0,
        }
    )
    greeks = OptionGreeks(delta=0.5, gamma=0.01, theta=-0.02, vega=0.3)
    market_data = {
        "iv_anomaly": {
            "zscore": zscore,
            "percentile": 0.98 if zscore is not None else None,
            "current_iv": 65.0,
            "mean_iv": 32.0,
            "realized_vol": 28.0,
            "iv_rv_spread": spread,
        }
    }
    return ScoreContext(contract=contract, greeks=greeks, market_data=market_data, config={})


def test_iv_anomaly_scores_extreme_zscore():
    scorer = IVAnomalyScorer()
    context = _build_context(3.1, spread=20.0)

    score, reasons, tags = scorer.score(context)

    assert score >= 70
    assert any("3.1" in reason for reason in reasons)
    assert "iv-extreme" in tags


def test_iv_anomaly_handles_missing_history():
    scorer = IVAnomalyScorer()
    context = _build_context(None)

    score, reasons, tags = scorer.score(context)

    assert score == 5.0
    assert "Insufficient" in reasons[0]
    assert not tags

