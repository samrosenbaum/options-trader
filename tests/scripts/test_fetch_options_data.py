from datetime import date, timedelta

import pandas as pd

from scripts.fetch_options_data import (
    calculate_greeks,
    estimate_profit_probability,
    summarize_risk_metrics,
)
from src.models.option import OptionContract


def make_future_expiration(days: int = 120) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def test_calculate_greeks_falls_back_when_iv_missing():
    row = pd.Series(
        {
            "stockPrice": 150.0,
            "strike": 145.0,
            "expiration": make_future_expiration(150),
            "impliedVolatility": 0.0,
            "type": "call",
        }
    )

    greeks = calculate_greeks(row)

    assert greeks.delta != 0.0
    assert greeks.gamma != 0.0


def build_sample_contract() -> OptionContract:
    return OptionContract.parse_obj(
        {
            "symbol": "NVDA",
            "type": "call",
            "strike": 450.0,
            "expiration": make_future_expiration(90),
            "lastPrice": 12.5,
            "bid": 12.0,
            "ask": 13.0,
            "volume": 5000,
            "openInterest": 4200,
            "impliedVolatility": 0.55,
            "stockPrice": 470.0,
        }
    )


def test_estimate_profit_probability_returns_reasonable_values():
    contract = build_sample_contract()

    intel = estimate_profit_probability(contract)

    assert 0.0 <= intel["probability"] <= 1.0
    explanation = intel["explanation"].lower()
    assert "break even" in explanation or "breakeven" in explanation
    assert intel["required_move_pct"] is None or intel["required_move_pct"] >= 0.0


def test_summarize_risk_metrics_produces_asymmetry_ratio():
    contract = build_sample_contract()
    projected_returns = {"10%": 2.4, "20%": 3.6, "30%": 5.2}

    metrics = summarize_risk_metrics(contract, projected_returns)

    assert metrics["max_return_pct"] == 520.0
    assert metrics["max_loss_pct"] == 100.0
    assert metrics["reward_to_risk"] > 1.0
    assert metrics["max_loss_amount"] == round(contract.last_price * 100, 2)
    assert metrics["max_return_amount"] == round(metrics["max_return_pct"] / 100 * contract.last_price * 100, 2)
