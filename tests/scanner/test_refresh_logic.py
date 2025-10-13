from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd

from src.scanner.service import SmartOptionsScanner


def make_scanner(ttl_seconds: int = 900) -> SmartOptionsScanner:
    scanner = SmartOptionsScanner.__new__(SmartOptionsScanner)
    scanner.cache_ttl_seconds = ttl_seconds
    scanner.last_fetch_time = None
    scanner.data_freshness = None
    return scanner  # type: ignore[return-value]


def test_should_refresh_when_no_cache_metadata() -> None:
    scanner = make_scanner()
    assert scanner.should_refresh_data() is True


def test_should_not_refresh_when_cache_recent() -> None:
    scanner = make_scanner()
    now = datetime.now(timezone.utc)
    scanner.last_fetch_time = now
    scanner.data_freshness = {
        "cacheTimestamp": now.isoformat(),
        "cacheAgeMinutes": 5.0,
        "cacheStale": False,
        "hasFutureContracts": True,
    }

    assert scanner.should_refresh_data() is False


def test_should_refresh_when_only_expired_contracts() -> None:
    scanner = make_scanner()
    now = datetime.now(timezone.utc)
    scanner.last_fetch_time = now
    scanner.data_freshness = {
        "cacheTimestamp": now.isoformat(),
        "cacheAgeMinutes": 5.0,
        "cacheStale": False,
        "hasFutureContracts": False,
    }

    assert scanner.should_refresh_data() is True


def test_filter_current_contracts_removes_expired_rows() -> None:
    scanner = make_scanner()
    today = datetime.now(timezone.utc)
    data = pd.DataFrame(
        {
            "symbol": ["OLD", "FUT"],
            "expiration": [
                (today - timedelta(days=30)).date().isoformat(),
                (today + timedelta(days=5)).date().isoformat(),
            ],
            "volume": [1000, 1000],
        }
    )

    filtered = scanner._filter_current_contracts(data)

    assert list(filtered["symbol"]) == ["FUT"]
