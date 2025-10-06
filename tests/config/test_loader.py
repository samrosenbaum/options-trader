import pytest

from src.config import get_settings, reset_settings_cache
from src.config.loader import ENVIRONMENT_VARIABLE


@pytest.fixture(autouse=True)
def clear_settings_cache():
    reset_settings_cache()
    yield
    reset_settings_cache()


def test_dev_settings_load(monkeypatch):
    monkeypatch.setenv(ENVIRONMENT_VARIABLE, "dev")
    settings = get_settings()

    watchlist = settings.get_watchlist()
    assert "AAPL" in watchlist
    assert settings.adapter.provider == "yfinance"
    assert settings.cache.ttl_seconds == 900
    assert settings.scoring.weights["risk_reward"] == 1.5
    assert settings.scoring.score_bounds["max"] == 100.0


def test_prod_settings_override(monkeypatch):
    monkeypatch.setenv(ENVIRONMENT_VARIABLE, "prod")
    settings = get_settings()

    assert settings.adapter.provider == "polygon"
    assert "GLD" in settings.get_watchlist("default")
    assert settings.cache.ttl_seconds == 300
    assert settings.scoring.score_bounds["min"] == 10.0


def test_missing_environment_raises(monkeypatch):
    monkeypatch.setenv(ENVIRONMENT_VARIABLE, "unknown")
    with pytest.raises(FileNotFoundError):
        get_settings()
