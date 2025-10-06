"""SQLite-backed storage implementation."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence

from .base import OptionSnapshot, RunMetadata, SignalSnapshot, Storage, StorageError


def _default_json_serializer(obj: Any) -> Any:
    """Best-effort conversion for non-native JSON objects."""

    try:
        import numpy as np  # type: ignore
    except Exception:  # pragma: no cover - optional dependency
        np = None  # type: ignore

    try:
        import pandas as pd  # type: ignore
    except Exception:  # pragma: no cover - optional dependency
        pd = None  # type: ignore

    if isinstance(obj, datetime):
        return obj.isoformat()
    if np is not None and isinstance(obj, np.generic):  # type: ignore[attr-defined]
        return obj.item()
    if pd is not None and isinstance(obj, pd.Timestamp):  # type: ignore[attr-defined]
        return obj.to_pydatetime().isoformat()
    if hasattr(obj, "isoformat"):
        try:
            return obj.isoformat()
        except Exception:  # pragma: no cover - best effort
            return str(obj)
    if hasattr(obj, "tolist"):
        try:
            return obj.tolist()
        except Exception:  # pragma: no cover - best effort
            return str(obj)
    return str(obj)


def _json_dumps(payload: Mapping[str, Any]) -> str:
    return json.dumps(dict(payload), default=_default_json_serializer)


def _json_loads(payload: str) -> Dict[str, Any]:
    return json.loads(payload) if payload else {}


def _ensure_parent_exists(path: Path) -> None:
    if path.name == ":memory:":
        return
    if not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)


class SQLiteStorage(Storage):
    """Persist scan data using a lightweight SQLite database."""

    def __init__(
        self,
        database: str | Path,
        pragmas: Optional[Mapping[str, Any]] = None,
        *,
        uri: bool = False,
    ) -> None:
        self._database = str(database)
        self._uri = uri
        self._pragmas = dict(pragmas or {})
        if not uri and self._database != ":memory:":
            _ensure_parent_exists(Path(self._database))
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._database, uri=self._uri)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        for key, value in self._pragmas.items():
            conn.execute(f"PRAGMA {key}={value};")
        return conn

    def _ensure_schema(self) -> None:
        schema = """
        CREATE TABLE IF NOT EXISTS metadata (
            run_id TEXT PRIMARY KEY,
            run_at TEXT NOT NULL,
            environment TEXT,
            watchlist TEXT,
            extra TEXT
        );

        CREATE TABLE IF NOT EXISTS options (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            option_type TEXT,
            expiration TEXT,
            strike REAL,
            contract_symbol TEXT,
            data TEXT NOT NULL,
            FOREIGN KEY(run_id) REFERENCES metadata(run_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            option_type TEXT,
            score REAL,
            contract_symbol TEXT,
            data TEXT NOT NULL,
            FOREIGN KEY(run_id) REFERENCES metadata(run_id) ON DELETE CASCADE
        );
        """
        with self._connect() as conn:
            conn.executescript(schema)

    def save_run(
        self,
        metadata: RunMetadata,
        options: Sequence[OptionSnapshot],
        signals: Sequence[SignalSnapshot],
    ) -> None:
        try:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO metadata(run_id, run_at, environment, watchlist, extra)
                    VALUES(?, ?, ?, ?, ?)
                    ON CONFLICT(run_id) DO UPDATE SET
                        run_at=excluded.run_at,
                        environment=excluded.environment,
                        watchlist=excluded.watchlist,
                        extra=excluded.extra
                    """,
                    (
                        metadata.run_id,
                        metadata.run_at.isoformat(),
                        metadata.environment,
                        metadata.watchlist,
                        _json_dumps(metadata.extra),
                    ),
                )
                conn.execute("DELETE FROM options WHERE run_id = ?", (metadata.run_id,))
                conn.execute("DELETE FROM signals WHERE run_id = ?", (metadata.run_id,))

                option_rows = [
                    (
                        metadata.run_id,
                        snapshot.symbol,
                        snapshot.option_type,
                        snapshot.expiration,
                        float(snapshot.strike),
                        snapshot.contract_symbol,
                        _json_dumps(snapshot.data),
                    )
                    for snapshot in options
                ]
                if option_rows:
                    conn.executemany(
                        """
                        INSERT INTO options(run_id, symbol, option_type, expiration, strike, contract_symbol, data)
                        VALUES(?, ?, ?, ?, ?, ?, ?)
                        """,
                        option_rows,
                    )

                signal_rows = [
                    (
                        metadata.run_id,
                        snapshot.symbol,
                        snapshot.option_type,
                        float(snapshot.score),
                        snapshot.contract_symbol,
                        _json_dumps(snapshot.data),
                    )
                    for snapshot in signals
                ]
                if signal_rows:
                    conn.executemany(
                        """
                        INSERT INTO signals(run_id, symbol, option_type, score, contract_symbol, data)
                        VALUES(?, ?, ?, ?, ?, ?)
                        """,
                        signal_rows,
                    )
        except sqlite3.DatabaseError as exc:
            raise StorageError(f"Failed to persist run '{metadata.run_id}': {exc}") from exc

    def list_runs(self, limit: Optional[int] = None) -> List[RunMetadata]:
        query = "SELECT run_id, run_at, environment, watchlist, extra FROM metadata ORDER BY run_at DESC"
        if limit is not None:
            query += " LIMIT ?"
        with self._connect() as conn:
            cursor = conn.execute(query, (limit,) if limit is not None else ())
            rows = cursor.fetchall()
        return [self._row_to_metadata(row) for row in rows]

    def get_metadata(self, run_id: str) -> Optional[RunMetadata]:
        with self._connect() as conn:
            cursor = conn.execute(
                "SELECT run_id, run_at, environment, watchlist, extra FROM metadata WHERE run_id = ?",
                (run_id,),
            )
            row = cursor.fetchone()
        return self._row_to_metadata(row) if row else None

    def get_options(self, run_id: str) -> List[OptionSnapshot]:
        with self._connect() as conn:
            cursor = conn.execute(
                """
                SELECT symbol, option_type, expiration, strike, contract_symbol, data
                FROM options
                WHERE run_id = ?
                ORDER BY id ASC
                """,
                (run_id,),
            )
            rows = cursor.fetchall()
        return [self._row_to_option(row) for row in rows]

    def get_signals(self, run_id: str) -> List[SignalSnapshot]:
        with self._connect() as conn:
            cursor = conn.execute(
                """
                SELECT symbol, option_type, score, contract_symbol, data
                FROM signals
                WHERE run_id = ?
                ORDER BY id ASC
                """,
                (run_id,),
            )
            rows = cursor.fetchall()
        return [self._row_to_signal(row) for row in rows]

    def _row_to_metadata(self, row: sqlite3.Row) -> RunMetadata:
        extra = _json_loads(row["extra"])
        return RunMetadata(
            run_id=row["run_id"],
            run_at=datetime.fromisoformat(row["run_at"]),
            environment=row["environment"],
            watchlist=row["watchlist"],
            extra=extra,
        )

    def _row_to_option(self, row: sqlite3.Row) -> OptionSnapshot:
        return OptionSnapshot(
            symbol=row["symbol"],
            option_type=row["option_type"] or "",
            expiration=row["expiration"] or "",
            strike=float(row["strike"] or 0.0),
            contract_symbol=row["contract_symbol"],
            data=_json_loads(row["data"]),
        )

    def _row_to_signal(self, row: sqlite3.Row) -> SignalSnapshot:
        return SignalSnapshot(
            symbol=row["symbol"],
            option_type=row["option_type"] or "",
            score=float(row["score"] or 0.0),
            contract_symbol=row["contract_symbol"],
            data=_json_loads(row["data"]),
        )


__all__ = ["SQLiteStorage"]
