"""File-backed cache helpers for option and stock price snapshots."""

from __future__ import annotations

import json
import os
import tempfile
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, MutableMapping, Optional


def _coerce_datetime(value: str | datetime) -> Optional[datetime]:
    """Convert ISO strings to timezone-aware datetimes."""

    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        else:
            parsed = parsed.astimezone(timezone.utc)
        return parsed

    return None


@dataclass(frozen=True)
class CacheResult:
    """Represents a cached payload with freshness metadata."""

    value: Any
    age_seconds: float
    is_stale: bool
    timestamp: datetime


class PositionPriceCache:
    """Persist simple JSON cache files for options and stock snapshots."""

    _VERSION = 1

    def __init__(
        self,
        path: str | Path,
        *,
        ttl_seconds: int = 300,
        stale_ttl_seconds: int = 900,
    ) -> None:
        self.path = Path(path)
        self.ttl_seconds = max(int(ttl_seconds), 0)
        self.stale_ttl_seconds = max(int(stale_ttl_seconds), self.ttl_seconds)
        self._lock = threading.Lock()
        self._dirty = False
        self._store: Dict[str, Dict[str, Dict[str, Any]]] = {
            "options": {},
            "stocks": {},
        }
        self._load()

    # ------------------------------------------------------------------
    # Construction helpers
    # ------------------------------------------------------------------
    @classmethod
    def _default_path(cls) -> Path:
        base_dir = os.getenv("OPTIONS_TRADER_CACHE_DIR")
        if base_dir:
            return Path(base_dir).expanduser() / "position_prices.json"

        base_path = Path(tempfile.gettempdir()) / "options-trader"
        return base_path / "position_prices.json"

    @classmethod
    def from_environment(
        cls,
        *,
        ttl_seconds: int = 300,
        stale_ttl_seconds: int = 900,
    ) -> "PositionPriceCache":
        path = os.getenv("POSITION_PRICE_CACHE_PATH")
        if path:
            cache_path = Path(path).expanduser()
        else:
            cache_path = cls._default_path()

        return cls(cache_path, ttl_seconds=ttl_seconds, stale_ttl_seconds=stale_ttl_seconds)

    # ------------------------------------------------------------------
    # Core cache operations
    # ------------------------------------------------------------------
    def _load(self) -> None:
        if not self.path.exists():
            return

        try:
            with self.path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except Exception:
            return

        options = payload.get("options")
        stocks = payload.get("stocks")
        if isinstance(options, dict):
            self._store["options"] = {
                str(key): value
                for key, value in options.items()
                if isinstance(value, dict) and "timestamp" in value
            }
        if isinstance(stocks, dict):
            self._store["stocks"] = {
                str(key): value
                for key, value in stocks.items()
                if isinstance(value, dict) and "timestamp" in value
            }

    def save(self) -> None:
        with self._lock:
            if not self._dirty:
                return

            payload = {
                "version": self._VERSION,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "ttl_seconds": self.ttl_seconds,
                "stale_ttl_seconds": self.stale_ttl_seconds,
                "options": self._store.get("options", {}),
                "stocks": self._store.get("stocks", {}),
            }

            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = self.path.with_suffix(".tmp")
            with tmp_path.open("w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2, sort_keys=True)
            tmp_path.replace(self.path)
            self._dirty = False

    def prune(self) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=self.stale_ttl_seconds)
        removed = False

        for bucket_name in ("options", "stocks"):
            bucket = self._store.get(bucket_name, {})
            stale_keys = []
            for key, entry in bucket.items():
                ts = _coerce_datetime(entry.get("timestamp"))
                if ts is None or ts < cutoff:
                    stale_keys.append(key)

            for key in stale_keys:
                bucket.pop(key, None)
                removed = True

        if removed:
            self._dirty = True

    # ------------------------------------------------------------------
    # Public API for stock and contract snapshots
    # ------------------------------------------------------------------
    def get_stock(self, symbol: str, *, allow_stale: bool = True) -> Optional[CacheResult]:
        return self._get("stocks", symbol.upper(), allow_stale=allow_stale)

    def set_stock(self, symbol: str, payload: Any) -> None:
        self._set("stocks", symbol.upper(), payload)

    def get_contract(self, key: str, *, allow_stale: bool = True) -> Optional[CacheResult]:
        return self._get("options", key, allow_stale=allow_stale)

    def set_contract(self, key: str, payload: Any) -> None:
        self._set("options", key, payload)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _get(
        self,
        bucket_name: str,
        key: str,
        *,
        allow_stale: bool,
    ) -> Optional[CacheResult]:
        bucket = self._store.get(bucket_name)
        if bucket is None:
            return None

        entry = bucket.get(key)
        if not entry:
            return None

        timestamp = _coerce_datetime(entry.get("timestamp"))
        if timestamp is None:
            return None

        now = datetime.now(timezone.utc)
        age = (now - timestamp).total_seconds()
        fresh = age <= self.ttl_seconds
        stale = age <= self.stale_ttl_seconds

        if fresh or (allow_stale and stale):
            value = entry.get("value")
            if isinstance(value, MutableMapping):
                value = dict(value)
            return CacheResult(
                value=value,
                age_seconds=max(age, 0.0),
                is_stale=not fresh,
                timestamp=timestamp,
            )

        return None

    def _set(self, bucket_name: str, key: str, payload: Any) -> None:
        bucket = self._store.setdefault(bucket_name, {})
        stored_value: Any
        if isinstance(payload, MutableMapping):
            stored_value = dict(payload)
        else:
            stored_value = payload

        bucket[key] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "value": stored_value,
        }
        self._dirty = True

    # ------------------------------------------------------------------
    # Key helpers
    # ------------------------------------------------------------------
    @staticmethod
    def contract_key(symbol: str, expiration: str, strike: str, option_type: str) -> str:
        normalized = [
            str(symbol).upper().strip(),
            str(expiration).strip(),
            str(option_type).lower().strip(),
            str(strike).strip(),
        ]
        return "|".join(normalized)

