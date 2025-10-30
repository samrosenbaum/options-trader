import datetime as dt

import pytest

from src.signals.exit_engine import ExitSignalEngine


class DummyMomentum:
    """Helper to fabricate momentum snapshots for tests."""

    STRONG = {
        "strength": "STRONG",
        "volume_ratio": 1.6,
        "direction": "UP",
        "recent_changes": [1.2, 0.8, 0.4],
        "price_trend_pct": 4.2,
        "slope_pct": 3.1,
        "atr_pct": 2.4,
        "momentum_score": 12.0,
        "iv_change_pct": 5.0,
        "current_iv": 0.45,
    }

    MODERATE = {
        "strength": "MODERATE",
        "volume_ratio": 1.0,
        "direction": "DOWN",
        "recent_changes": [-1.1, -0.8, -0.5],
        "price_trend_pct": -1.5,
        "slope_pct": -0.4,
        "atr_pct": 1.8,
        "momentum_score": -2.0,
        "iv_change_pct": -3.0,
        "current_iv": 0.32,
    }


@pytest.fixture
def engine():
    return ExitSignalEngine()


def test_dynamic_stop_tightens_for_high_delta(engine, monkeypatch):
    """High-delta contracts should trigger tighter dynamic stops before the base threshold."""

    monkeypatch.setattr(engine, "_check_momentum", lambda *args, **kwargs: DummyMomentum.MODERATE)

    signal = engine.analyze_position(
        symbol="TEST",
        option_type="call",
        strike=100.0,
        expiration=(dt.date.today() + dt.timedelta(days=14)).isoformat(),
        entry_price=2.0,
        entry_date=dt.date.today().isoformat(),
        entry_stock_price=100.0,
        play_type="BREAKOUT",
        current_option_price=1.1,  # -45%
        current_stock_price=98.5,
        stop_loss_pct=-50,
        target_profit_pct=50,
        entry_greeks={"delta": 0.72, "theta": -0.08},
        current_greeks={"delta": 0.75, "theta": -0.12},
        entry_iv=0.28,
        current_iv=0.26,
    )

    assert signal.signal == "CUT_LOSS"
    assert any("Dynamic stop" in note for note in signal.reasoning)
    assert signal.risk_score is not None and signal.risk_score > 50


def test_supportive_flow_flags_conviction_hold(engine, monkeypatch):
    """Smart-money flow and strong momentum should surface conviction holds."""

    monkeypatch.setattr(engine, "_check_momentum", lambda *args, **kwargs: DummyMomentum.STRONG)

    signal = engine.analyze_position(
        symbol="FLOW",
        option_type="call",
        strike=50.0,
        expiration=(dt.date.today() + dt.timedelta(days=21)).isoformat(),
        entry_price=2.0,
        entry_date=dt.date.today().isoformat(),
        entry_stock_price=50.0,
        play_type="BREAKOUT",
        current_option_price=2.4,  # +20%
        current_stock_price=52.5,
        stop_loss_pct=-50,
        target_profit_pct=60,
        entry_greeks={"delta": 0.55, "theta": -0.02, "vega": 0.1},
        current_greeks={"delta": 0.58, "theta": -0.02, "vega": 0.12},
        entry_iv=0.35,
        current_iv=0.42,
        probability_of_profit=0.7,
        sentiment_score=0.6,
        unusual_activity={
            "bias": "bullish",
            "total_volume": 4500,
            "call_volume": 4200,
            "put_volume": 300,
            "vol_oi_ratio": 3.2,
            "dominant_volume": 2500,
        },
    )

    assert signal.signal == "HOLD"
    assert "Conviction hold" in signal.suggested_action
    assert signal.unusual_activity_bias == "bullish"
    assert signal.recovery_score is not None and signal.risk_score is not None
    assert signal.recovery_score > signal.risk_score
    assert any("Smart money" in note or "Unusual" in note for note in signal.reasoning)
