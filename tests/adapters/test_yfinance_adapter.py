from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from src.adapters.base import AdapterError
from src.adapters.yfinance import YFinanceOptionsDataAdapter


@pytest.fixture
def ticker_mock():
    ticker = MagicMock()
    ticker.info = {"currentPrice": 100.0}
    ticker.options = ["2024-01-19", "2024-02-16"]
    return ticker


def make_option_chain() -> SimpleNamespace:
    calls = pd.DataFrame(
        {
            "contractSymbol": ["AAPL240119C00100000"],
            "strike": [100.0],
            "lastPrice": [1.25],
            "volume": [10],
            "openInterest": [20],
            "impliedVolatility": [0.3],
            "bid": [1.2],
            "ask": [1.3],
        }
    )
    puts = pd.DataFrame(
        {
            "contractSymbol": ["AAPL240119P00100000"],
            "strike": [100.0],
            "lastPrice": [1.10],
            "volume": [12],
            "openInterest": [22],
            "impliedVolatility": [0.31],
            "bid": [1.05],
            "ask": [1.15],
        }
    )
    return SimpleNamespace(calls=calls, puts=puts)


def test_get_chain_retries_and_combines_frames(ticker_mock):
    chain_result = make_option_chain()
    ticker_mock.option_chain.side_effect = [Exception("rate limit"), chain_result]

    adapter = YFinanceOptionsDataAdapter(ticker_factory=lambda _: ticker_mock, max_retries=3)

    with patch("src.adapters.yfinance.random.uniform", return_value=0), patch(
        "src.adapters.yfinance.time.sleep"
    ) as sleep_mock:
        chain = adapter.get_chain("AAPL", date(2024, 1, 19))

    assert ticker_mock.option_chain.call_count == 2
    sleep_mock.assert_called_once()

    combined = chain.to_dataframe()
    assert set(combined["type"]) == {"call", "put"}
    assert combined["symbol"].unique().tolist() == ["AAPL"]
    assert combined["expiration"].unique().tolist() == ["2024-01-19"]
    assert combined["stockPrice"].notna().all()


def test_get_expirations_parses_dates(ticker_mock):
    ticker_mock.option_chain.return_value = make_option_chain()

    adapter = YFinanceOptionsDataAdapter(ticker_factory=lambda _: ticker_mock)
    expirations = adapter.get_expirations("AAPL")

    assert expirations[0] == date(2024, 1, 19)
    assert expirations[1] == date(2024, 2, 16)


def test_get_chain_raises_after_retries(ticker_mock):
    ticker_mock.option_chain.side_effect = Exception("down")

    adapter = YFinanceOptionsDataAdapter(
        ticker_factory=lambda _: ticker_mock, max_retries=2, base_delay=0, jitter=0
    )

    with patch("src.adapters.yfinance.random.uniform", return_value=0), patch(
        "src.adapters.yfinance.time.sleep"
    ) as sleep_mock:
        with pytest.raises(AdapterError):
            adapter.get_chain("AAPL", date(2024, 1, 19))

    assert sleep_mock.call_count == 1
