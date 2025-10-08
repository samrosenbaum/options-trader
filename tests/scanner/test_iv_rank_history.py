from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from src.scanner.iv_rank_history import IVRankHistory


def _build_test_database(tmp_path: Path, rows: list[tuple[datetime, float]]) -> Path:
    db_path = tmp_path / "iv-history.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE metadata (
                run_id TEXT PRIMARY KEY,
                run_at TEXT NOT NULL,
                environment TEXT,
                watchlist TEXT,
                extra TEXT
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE options (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                option_type TEXT,
                expiration TEXT,
                strike REAL,
                contract_symbol TEXT,
                data TEXT NOT NULL
            );
            """
        )

        for index, (timestamp, iv) in enumerate(rows):
            run_id = f"run_{index}"
            payload = json.dumps(
                {
                    "impliedVolatility": iv,
                    "lastTradeDate": timestamp.isoformat(),
                }
            )
            conn.execute(
                "INSERT INTO metadata(run_id, run_at) VALUES(?, ?)",
                (run_id, timestamp.isoformat()),
            )
            conn.execute(
                "INSERT INTO options(run_id, symbol, data) VALUES(?, ?, ?)",
                (run_id, "AAPL", payload),
            )
        conn.commit()
    finally:
        conn.close()

    return db_path


def test_percentile_uses_recent_history(tmp_path: Path) -> None:
    now = datetime(2025, 1, 1, tzinfo=timezone.utc)
    rows = [
        (now - timedelta(days=30), 0.25),
        (now - timedelta(days=120), 0.30),
        (now - timedelta(days=240), 0.45),
    ]
    db_path = _build_test_database(tmp_path, rows)

    history = IVRankHistory(db_path, now_provider=lambda: now)
    percentile = history.percentile("AAPL", 0.33)

    assert percentile == pytest.approx(66.666, rel=1e-3)


def test_lookback_filters_old_samples(tmp_path: Path) -> None:
    now = datetime(2025, 6, 1, tzinfo=timezone.utc)
    rows = [
        (now - timedelta(days=400), 0.20),
        (now - timedelta(days=15), 0.60),
    ]
    db_path = _build_test_database(tmp_path, rows)

    history = IVRankHistory(db_path, lookback_days=180, now_provider=lambda: now)
    percentile = history.percentile("AAPL", 0.30)

    assert percentile == 0.0


def test_returns_none_when_history_missing(tmp_path: Path) -> None:
    db_path = _build_test_database(tmp_path, [])
    history = IVRankHistory(db_path)

    assert history.percentile("MSFT", 0.42) is None

