from __future__ import annotations

from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from strategies.sharp_move_scanner.ev import (
    RiskInputs,
    breakeven_price,
    expected_move,
    expected_value_per_contract,
    probability_of_profit,
)
from strategies.sharp_move_scanner.pipeline import SharpMoveScanner, SharpMoveScannerConfig
from strategies.sharp_move_scanner.scoring import EventWindows, ScoringWeights, score_row


@pytest.fixture()
def synthetic_history() -> pd.DataFrame:
    base = datetime(2024, 1, 1)
    rows = []
    price = 100.0
    for i in range(60):
        price *= 1 + 0.002 * ((-1) ** i)
        rows.append(
            {
                "Date": base + timedelta(days=i),
                "Open": price * 0.99,
                "High": price * 1.01,
                "Low": price * 0.98,
                "Close": price,
                "Volume": 1_000_000 + i * 1_000,
            }
        )
    frame = pd.DataFrame(rows).set_index("Date")
    return frame


@pytest.fixture()
def base_config() -> SharpMoveScannerConfig:
    return SharpMoveScannerConfig.from_dict(
        {
            "universe": {"default_tickers": ["ABC"]},
            "filters": {
                "min_liquidity": 10,
                "max_spread_pct": 0.5,
                "call_delta_range": [0.2, 0.8],
                "put_delta_range": [-0.8, -0.2],
            },
            "scoring_weights": {
                "w_event": 0.3,
                "w_vol": 0.2,
                "w_tech": 0.25,
                "w_flow": 0.15,
                "w_micro": 0.1,
            },
            "event_windows": {"earnings_days": 3, "macro_days": 2},
            "risk": {"risk_free_rate": 0.01},
        }
    )


def test_expected_move_and_probability() -> None:
    inputs = RiskInputs(
        spot=100.0,
        strike=105.0,
        option_type="call",
        mid_price=2.5,
        iv=0.4,
        dte_days=5,
        risk_free_rate=0.01,
    )
    move = expected_move(inputs.spot, inputs.iv, inputs.dte_days)
    assert pytest.approx(move, rel=1e-6) == inputs.spot * inputs.iv * np.sqrt(inputs.dte_days / 365)
    breakeven = breakeven_price(inputs.strike, inputs.mid_price, inputs.option_type)
    prob = probability_of_profit(inputs, breakeven)
    assert 0.0 <= prob <= 1.0
    theo_ev = expected_value_per_contract(inputs)
    assert isinstance(theo_ev, float)


def test_scoring_breakdown_structure() -> None:
    row = {
        "event_flag": True,
        "days_to_event": 2,
        "iv": 0.45,
        "iv_rank": 55.0,
        "hv20": 0.3,
        "iv_minus_hv": 0.15,
        "dist_to_be_pct": 5.0,
        "expected_move": 6.0,
        "spot": 100.0,
        "ema8_gt_ema21": True,
        "breakout_20d_high": True,
        "rsi14": 60.0,
        "vol_spike": 1.5,
        "bb_width_pct": 0.08,
        "spread_pct": 0.05,
        "volume": 5_000,
        "open_interest": 10_000,
        "delta": 0.45,
        "mid": 2.0,
        "flow_calls_ratio": 1.2,
        "flow_net_premium": 25_000,
    }
    weights = ScoringWeights(0.3, 0.2, 0.25, 0.15, 0.1)
    windows = EventWindows(earnings_days=3, macro_days=1)
    breakdown = score_row(row, weights, windows)
    assert 0.0 <= breakdown.total <= 100.0
    assert set(breakdown.components.keys()) == {"event", "vol", "tech", "flow", "micro"}


def test_pipeline_produces_ranked_contracts(monkeypatch, base_config, synthetic_history) -> None:
    scanner = SharpMoveScanner(base_config)
    as_of = datetime(2024, 6, 1, 14, 30)

    def fake_history(symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
        return synthetic_history

    def fake_expirations(symbol: str):
        return [date(2024, 6, 6)]

    def fake_chain(symbol: str, expiration: date) -> pd.DataFrame:
        return pd.DataFrame(
            {
                "type": ["call", "put"],
                "symbol": [symbol, symbol],
                "expiration": [expiration, expiration],
                "bid": [1.2, 1.4],
                "ask": [1.4, 1.6],
                "impliedVolatility": [0.35, 0.4],
                "stockPrice": [100.0, 100.0],
                "strike": [102.0, 98.0],
                "volume": [50, 60],
                "openInterest": [200, 220],
                "delta": [0.4, -0.4],
                "gamma": [0.02, 0.02],
                "theta": [-0.01, -0.01],
                "vega": [0.12, 0.12],
                "lastPrice": [1.3, 1.5],
            }
        )

    monkeypatch.setattr("strategies.sharp_move_scanner.adapters.get_price_history", fake_history)
    monkeypatch.setattr("strategies.sharp_move_scanner.adapters.list_expirations", fake_expirations)
    monkeypatch.setattr("strategies.sharp_move_scanner.adapters.get_options_chain", fake_chain)
    monkeypatch.setattr("strategies.sharp_move_scanner.adapters.get_spot_price", lambda symbol: 100.0)
    monkeypatch.setattr(
        "strategies.sharp_move_scanner.adapters.get_event_context",
        lambda symbol, window: {"event_flag": True, "days_to_event": 2, "event_type": "earnings"},
    )
    monkeypatch.setattr(
        "strategies.sharp_move_scanner.adapters.fetch_flow_metrics",
        lambda symbol, expiration: {"flow_calls_ratio": 1.0, "flow_net_premium": 0.0},
    )
    monkeypatch.setattr("strategies.sharp_move_scanner.adapters.as_of_timestamp", lambda: as_of)

    result = scanner.run(tickers=["ABC"], include_puts=False, min_score=10.0, include_flow=True)

    assert not result.empty
    assert list(result["ticker"]) == ["ABC"]
    assert all(col in result.columns for col in ["score", "prob_profit", "explanation"])
    assert result.iloc[0]["score"] >= 10.0
