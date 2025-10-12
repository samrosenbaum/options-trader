from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd

from src.backtesting.engine import BacktestConfig, BacktestEngine


def _make_opportunity_row(
    date_value: datetime | str,
    *,
    symbol: str = "AAPL",
    score: float = 85.0,
    bid: float = 4.0,
    ask: float = 4.4,
    stock_price: float = 150.0,
) -> dict:
    date_dt = pd.to_datetime(date_value)
    expiration = (date_dt + timedelta(days=30)).date().isoformat()
    return {
        "date": date_value,
        "symbol": symbol,
        "type": "call",
        "strike": 150.0,
        "expiration": expiration,
        "bid": bid,
        "ask": ask,
        "stockPrice": stock_price,
        "score": score,
        "volume": 500,
        "openInterest": 1000,
        "days_to_expiration": 30,
        "impliedVolatility": 0.35,
        "delta": 0.55,
        "gamma": 0.012,
        "theta": -0.03,
        "vega": 0.18,
        "close": stock_price,
    }


def _build_historical_dataset(start: datetime, periods: int) -> pd.DataFrame:
    rows: list[dict] = []
    day = start
    added = 0
    while added < periods:
        if day.weekday() < 5:
            price = 150.0 + added
            rows.append(
                _make_opportunity_row(
                    day,
                    bid=3.0 + 0.05 * added,
                    ask=3.2 + 0.05 * added,
                    stock_price=price,
                )
            )
            added += 1
        day += timedelta(days=1)
    return pd.DataFrame(rows)


def test_run_backtest_handles_mixed_dates_and_skips_weekends():
    config = BacktestConfig(
        start_date=datetime(2024, 1, 5),
        end_date=datetime(2024, 1, 9),
        min_score_threshold=60.0,
        min_volume=10,
        min_open_interest=10,
        min_days_to_expiration=0,
    )
    engine = BacktestEngine(config)

    opportunities = pd.DataFrame(
        [
            _make_opportunity_row("2024-01-05"),
            _make_opportunity_row("2024-01-08", score=90.0, bid=5.0, ask=5.4),
        ]
    )

    historical_prices = pd.DataFrame(
        [
            {"symbol": "AAPL", "date": datetime(2024, 1, 5, 16), "close": 151.0},
            {"symbol": "AAPL", "date": datetime(2024, 1, 8, 16), "close": 152.0},
            {"symbol": "AAPL", "date": datetime(2024, 1, 9, 16), "close": 153.0},
        ]
    )

    metrics = engine.run_backtest(opportunities, historical_prices)

    assert metrics.total_trades >= 1
    assert all(ts.weekday() < 5 for ts, _ in engine.equity_curve[1:])


def test_position_sizing_respects_portfolio_heat():
    config = BacktestConfig(
        start_date=datetime(2024, 1, 5),
        end_date=datetime(2024, 1, 8),
        max_portfolio_heat=0.1,
        max_position_size=0.05,
        min_score_threshold=60.0,
        min_volume=10,
        min_open_interest=10,
        min_days_to_expiration=0,
    )
    engine = BacktestEngine(config)

    opportunities = pd.DataFrame(
        [
            _make_opportunity_row("2024-01-05", bid=50.0, ask=50.0, symbol="AAPL"),
            _make_opportunity_row("2024-01-05", bid=50.0, ask=50.0, symbol="MSFT"),
        ]
    )

    historical_prices = pd.DataFrame(
        [
            {"symbol": "AAPL", "date": datetime(2024, 1, 5, 16), "close": 151.0},
            {"symbol": "MSFT", "date": datetime(2024, 1, 5, 16), "close": 247.0},
            {"symbol": "AAPL", "date": datetime(2024, 1, 8, 16), "close": 150.0},
            {"symbol": "MSFT", "date": datetime(2024, 1, 8, 16), "close": 245.0},
        ]
    )

    engine.run_backtest(opportunities, historical_prices)

    assert {trade.contracts for trade in engine.trades} == {1}


def test_walk_forward_and_monte_carlo_cover_advanced_paths():
    start = datetime(2024, 1, 2)
    historical_data = _build_historical_dataset(start, periods=12)

    config = BacktestConfig(
        start_date=start,
        end_date=historical_data["date"].max().to_pydatetime(),
        min_score_threshold=55.0,
        min_volume=10,
        min_open_interest=10,
        min_days_to_expiration=0,
        optimization_window_days=5,
        out_of_sample_days=3,
        reoptimize_frequency_days=4,
    )
    engine = BacktestEngine(config)

    parameter_ranges = {"min_score_threshold": [50.0, 60.0]}
    wf_results = engine.run_walk_forward_analysis(historical_data, parameter_ranges, optimization_metric="win_rate")

    assert wf_results["periods"]
    assert wf_results["optimal_parameters"]
    assert wf_results["out_of_sample_performance"]

    mc_results = engine.monte_carlo_analysis(historical_data, num_simulations=5, bootstrap_window=5)

    assert mc_results["num_simulations"] == 5
    assert "net_pnl" in mc_results and "win_rate" in mc_results
