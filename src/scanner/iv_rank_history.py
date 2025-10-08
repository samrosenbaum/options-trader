"""Historical implied volatility utilities for IV rank calculations."""

from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from math import isfinite
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple


TimestampedIV = Tuple[datetime, float]


def _coerce_timezone(value: datetime) -> datetime:
    """Ensure timestamps are timezone-aware and normalized to UTC."""

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class IVRankHistory:
    """Load and query historical implied volatility observations from storage."""

    def __init__(
        self,
        database_path: str | Path | None,
        *,
        lookback_days: int = 365,
        now_provider: Callable[[], datetime] | None = None,
    ) -> None:
        self._database_path = Path(database_path) if database_path else None
        self._lookback = max(lookback_days, 1)
        self._now_provider = now_provider or (lambda: datetime.now(timezone.utc))
        self._history: Dict[str, List[TimestampedIV]] | None = None

    def percentile(self, symbol: str, current_iv: float) -> Optional[float]:
        """Return the percentile rank of ``current_iv`` versus historical samples."""

        if not isfinite(current_iv) or current_iv <= 0:
            return None

        history = self._filtered_history(symbol)
        if not history:
            return None

        sorted_values = sorted(history)
        below = sum(1 for value in sorted_values if value < current_iv)
        equal = sum(1 for value in sorted_values if value == current_iv)
        percentile = ((below + 0.5 * equal) / len(sorted_values)) * 100.0
        return max(0.0, min(100.0, percentile))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _filtered_history(self, symbol: str) -> List[float]:
        history = self._load_history().get(symbol.upper(), [])
        if not history:
            return []

        cutoff = self._now_provider() - timedelta(days=self._lookback)
        recent = [value for timestamp, value in history if timestamp >= cutoff]
        if recent:
            return recent
        return [value for _, value in history]

    def _load_history(self) -> Dict[str, List[TimestampedIV]]:
        if self._history is not None:
            return self._history

        history: Dict[str, List[TimestampedIV]] = defaultdict(list)
        if not self._database_path or not self._database_path.exists():
            self._history = {}
            return self._history

        try:
            with sqlite3.connect(str(self._database_path)) as conn:
                cursor = conn.execute(
                    """
                    SELECT o.symbol, m.run_at, o.data
                    FROM options AS o
                    JOIN metadata AS m ON o.run_id = m.run_id
                    """
                )
                for symbol, run_at, payload in cursor:
                    symbol_key = str(symbol or "").upper()
                    if not symbol_key:
                        continue

                    iv_value = self._extract_iv(payload)
                    if iv_value is None:
                        continue

                    timestamp = self._resolve_timestamp(run_at, payload)
                    history[symbol_key].append((timestamp, iv_value))
        except sqlite3.DatabaseError:
            self._history = {}
            return self._history

        for symbol_key, samples in history.items():
            samples.sort(key=lambda item: item[0])

        self._history = dict(history)
        return self._history

    def _extract_iv(self, payload: str) -> Optional[float]:
        try:
            data = json.loads(payload) if isinstance(payload, str) else dict(payload)
        except (TypeError, ValueError):
            return None

        raw_iv = data.get("impliedVolatility") or data.get("implied_volatility")
        if raw_iv is None:
            return None

        try:
            iv_value = float(raw_iv)
        except (TypeError, ValueError):
            return None

        if not isfinite(iv_value) or iv_value <= 0:
            return None

        return iv_value

    def _resolve_timestamp(self, run_at: object, payload: str) -> datetime:
        timestamp = self._parse_datetime(run_at)
        if timestamp is not None:
            return timestamp

        try:
            data = json.loads(payload) if isinstance(payload, str) else dict(payload)
        except (TypeError, ValueError):
            data = {}

        for key in ("lastTradeDate", "lastTradeTime", "timestamp"):
            candidate = data.get(key)
            if candidate:
                parsed = self._parse_datetime(candidate)
                if parsed is not None:
                    return parsed

        return self._now_provider()

    def _parse_datetime(self, value: object) -> Optional[datetime]:
        if isinstance(value, datetime):
            return _coerce_timezone(value)

        if isinstance(value, str):
            sanitized = value.strip().replace("Z", "+00:00")
            try:
                parsed = datetime.fromisoformat(sanitized)
            except ValueError:
                return None
            return _coerce_timezone(parsed)

        return None


__all__ = ["IVRankHistory"]

