import json
from datetime import datetime, timedelta
from types import SimpleNamespace

import pandas as pd
import pytest

from scripts.bulk_options_fetcher import BulkOptionsFetcher


def make_fetcher(monkeypatch: pytest.MonkeyPatch) -> BulkOptionsFetcher:
    settings = SimpleNamespace(
        fetcher=SimpleNamespace(max_priority_symbols=5),
        watchlists={},
    )
    monkeypatch.setattr("scripts.bulk_options_fetcher.get_options_data_adapter", lambda: SimpleNamespace())
    return BulkOptionsFetcher(settings)


def test_load_from_cache_allows_stale_when_requested(monkeypatch: pytest.MonkeyPatch, tmp_path):
    fetcher = make_fetcher(monkeypatch)
    cache_path = tmp_path / "options_cache.json"
    stale_timestamp = (datetime.now() - timedelta(hours=4)).isoformat()
    cache_payload = {
        "timestamp": stale_timestamp,
        "data_count": 1,
        "symbols": ["TSLA"],
        "options": [
            {
                "symbol": "TSLA",
                "volume": 1200,
                "openInterest": 5000,
                "lastPrice": 4.2,
            }
        ],
    }
    cache_path.write_text(json.dumps(cache_payload))

    # Without allowing stale data we should reject the cache
    assert (
        fetcher.load_from_cache(
            filename=str(cache_path),
            symbols=["TSLA"],
            max_age_minutes=15,
        )
        is None
    )

    # Allowing stale data should return the cached frame with metadata
    frame = fetcher.load_from_cache(
        filename=str(cache_path),
        symbols=["TSLA"],
        max_age_minutes=15,
        allow_stale=True,
    )
    assert frame is not None
    assert frame.attrs.get("cache_stale") is True
    assert frame.attrs.get("cache_source") == "adapter-cache-stale"
    assert frame.attrs.get("cache_used") is True
    age_minutes = frame.attrs.get("cache_age_minutes")
    assert isinstance(age_minutes, (int, float))
    assert age_minutes >= 240  # At least four hours old


def test_get_fresh_options_data_uses_stale_cache_on_failure(monkeypatch: pytest.MonkeyPatch):
    fetcher = make_fetcher(monkeypatch)

    stale_frame = pd.DataFrame(
        [
            {
                "symbol": "TSLA",
                "volume": 900,
                "openInterest": 3000,
                "lastPrice": 5.1,
            }
        ]
    )
    stale_frame.attrs.update(
        {
            "cache_stale": True,
            "cache_source": "adapter-cache-stale",
            "cache_age_minutes": 180.0,
            "cache_timestamp": datetime.now().isoformat(),
            "cache_used": True,
        }
    )

    load_calls: list[bool] = []

    def fake_load(
        self,
        filename: str = "options_cache.json",
        max_age_minutes: int = 15,
        symbols=None,
        *,
        allow_stale: bool = False,
    ):
        load_calls.append(allow_stale)
        if allow_stale:
            return stale_frame
        return None

    def fake_fetch(self, **_kwargs):
        return None

    def fake_save(self, data, filename: str = "options_cache.json"):
        raise AssertionError("Should not attempt to save when using stale cache")

    monkeypatch.setattr(BulkOptionsFetcher, "load_from_cache", fake_load)
    monkeypatch.setattr(BulkOptionsFetcher, "fetch_bulk_options_parallel", fake_fetch)
    monkeypatch.setattr(BulkOptionsFetcher, "save_to_cache", fake_save)

    result = fetcher.get_fresh_options_data(use_cache=True, symbols=["TSLA"])

    assert result is stale_frame
    assert load_calls == [False, True]
    assert result.attrs.get("cache_stale") is True
