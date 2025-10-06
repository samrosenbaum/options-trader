from __future__ import annotations

from datetime import date

import pytest

from src.adapters.polygon import PolygonOptionsDataAdapter
from src.adapters.yfinance import YFinanceOptionsDataAdapter
from src.config import (
    DEFAULT_OPTIONS_PROVIDER,
    get_options_data_adapter,
    reset_options_data_adapter_cache,
)


@pytest.fixture(autouse=True)
def clear_adapter_cache():
    reset_options_data_adapter_cache()
    yield
    reset_options_data_adapter_cache()


def test_default_provider_is_yfinance(monkeypatch):
    monkeypatch.delenv("OPTIONS_DATA_PROVIDER", raising=False)
    adapter = get_options_data_adapter()
    assert isinstance(adapter, YFinanceOptionsDataAdapter)
    assert adapter.name == DEFAULT_OPTIONS_PROVIDER


def test_environment_override(monkeypatch):
    monkeypatch.setenv("OPTIONS_DATA_PROVIDER", "polygon")
    adapter = get_options_data_adapter()
    assert isinstance(adapter, PolygonOptionsDataAdapter)

    with pytest.raises(NotImplementedError):
        adapter.get_chain("AAPL", date.today())


def test_invalid_provider_raises(monkeypatch):
    monkeypatch.setenv("OPTIONS_DATA_PROVIDER", "unknown")
    with pytest.raises(ValueError):
        get_options_data_adapter()
