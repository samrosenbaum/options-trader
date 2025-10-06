from __future__ import annotations

from datetime import date, timedelta

from src.models.option import OptionContract, OptionGreeks
from src.scoring.engine import CompositeScoringEngine


def build_sample_contract() -> OptionContract:
    expiration = (date.today() + timedelta(days=45)).isoformat()
    return OptionContract.parse_obj(
        {
            "symbol": "AAPL",
            "type": "call",
            "strike": 150.0,
            "expiration": expiration,
            "lastPrice": 2.5,
            "bid": 2.4,
            "ask": 2.6,
            "volume": 3500,
            "openInterest": 4200,
            "impliedVolatility": 0.45,
            "stockPrice": 152.0,
        }
    )


def build_market_data() -> dict:
    return {
        "volume_ratio": 4.0,
        "spread_pct": 0.02,
        "theta_ratio": 0.015,
        "moneyness": 0.013,
        "iv_rank": 82.0,
        "gamma_squeeze": 10.0,
        "iv_anomaly": {
            "zscore": 2.4,
            "percentile": 0.97,
            "current_iv": 55.0,
            "mean_iv": 32.0,
            "realized_vol": 28.0,
            "iv_rv_spread": 27.0,
        },
        "projected_returns": {"10%": 6.2, "20%": 9.1, "30%": 12.4},
    }


def build_greeks() -> OptionGreeks:
    return OptionGreeks(delta=0.55, gamma=0.012, theta=-0.04, vega=0.18)


def test_default_engine_scores_within_bounds():
    engine = CompositeScoringEngine()
    result = engine.score(build_sample_contract(), build_greeks(), build_market_data())

    assert 0.0 <= result.score.total_score <= 100.0
    assert result.score.breakdowns
    assert set(engine.enabled_scorers) == {b.scorer for b in result.score.breakdowns}


def test_weight_override_influences_total_score():
    contract = build_sample_contract()
    greeks = build_greeks()
    market_data = build_market_data()

    baseline_engine = CompositeScoringEngine()
    boosted_engine = CompositeScoringEngine({"weights": {"volume": 3.0}})

    base_result = baseline_engine.score(contract, greeks, market_data)
    boosted_result = boosted_engine.score(contract, greeks, market_data)

    base_volume = next(b for b in base_result.score.breakdowns if b.scorer == "volume")
    boosted_volume = next(b for b in boosted_result.score.breakdowns if b.scorer == "volume")

    assert boosted_volume.weight == 3.0
    assert boosted_volume.weighted_score > base_volume.weighted_score
    assert boosted_result.score.total_score >= base_result.score.total_score


def test_custom_score_bounds_are_respected():
    engine = CompositeScoringEngine({"score_bounds": {"max": 60}})
    result = engine.score(build_sample_contract(), build_greeks(), build_market_data())

    assert result.score.total_score <= 60

