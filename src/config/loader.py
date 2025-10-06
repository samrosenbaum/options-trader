"""Environment aware configuration loader for the options scanner."""

from __future__ import annotations

import copy
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Mapping, MutableMapping, Optional

try:  # pragma: no cover - exercised indirectly in environments with PyYAML
    import yaml  # type: ignore

    _safe_load = yaml.safe_load
except ModuleNotFoundError:  # pragma: no cover - executed in minimal environments
    from ._yaml_compat import safe_load as _safe_load
from pydantic import BaseModel, Field, root_validator, validator

from src.scoring.config import DEFAULT_SCORER_CONFIG

DEFAULT_SETTINGS: Dict[str, Any] = {
    "watchlists": {
        "default": ["SPY", "QQQ"],
    },
    "scoring": copy.deepcopy(DEFAULT_SCORER_CONFIG),
    "adapter": {
        "provider": "yfinance",
        "settings": {},
    },
    "cache": {
        "ttl_seconds": 900,
    },
    "storage": {
        "backend": "sqlite",
        "sqlite": {
            "path": "data/options.db",
            "pragmas": {},
        },
    },
}

CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"
ENVIRONMENT_VARIABLE = "APP_ENV"


class ScoringSettings(BaseModel):
    """Scoring configuration wrapper for the composite engine."""

    enabled: List[str] = Field(default_factory=lambda: list(DEFAULT_SCORER_CONFIG.get("enabled", [])))
    weights: Dict[str, float] = Field(default_factory=lambda: dict(DEFAULT_SCORER_CONFIG.get("weights", {})))
    score_bounds: Dict[str, float] = Field(default_factory=lambda: dict(DEFAULT_SCORER_CONFIG.get("score_bounds", {})))
    extra: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        extra = "allow"

    @root_validator(pre=True)
    def _capture_extra(cls, values: Dict[str, Any]) -> Dict[str, Any]:  # type: ignore[override]
        known_keys = {"enabled", "weights", "score_bounds", "extra"}
        extras = {key: values[key] for key in list(values.keys()) if key not in known_keys}
        merged_extra = dict(values.get("extra", {}))
        merged_extra.update(extras)
        for key in extras:
            values.pop(key, None)
        values["extra"] = merged_extra
        return values

    @validator("weights", pre=True)
    def _coerce_weights(cls, value: Mapping[str, Any]) -> Dict[str, float]:  # type: ignore[override]
        return {key: float(val) for key, val in dict(value or {}).items()}

    def to_engine_config(self) -> Dict[str, Any]:
        config = {
            "enabled": list(self.enabled),
            "weights": dict(self.weights),
            "score_bounds": dict(self.score_bounds),
        }
        config.update(self.extra)
        return config


class AdapterSettings(BaseModel):
    provider: str = "yfinance"
    settings: Dict[str, Any] = Field(default_factory=dict)


class CacheSettings(BaseModel):
    ttl_seconds: int = 900


class SQLiteSettings(BaseModel):
    path: str = "data/options.db"
    pragmas: Dict[str, Any] = Field(default_factory=dict)


class StorageSettings(BaseModel):
    backend: str = "sqlite"
    sqlite: SQLiteSettings = Field(default_factory=SQLiteSettings)

    def require_sqlite(self) -> SQLiteSettings:
        if self.backend != "sqlite":
            raise ValueError(f"Unsupported storage backend: {self.backend}")
        return self.sqlite


class AppSettings(BaseModel):
    """Fully resolved application settings loaded from YAML."""

    env: str
    watchlists: Dict[str, List[str]]
    scoring: ScoringSettings
    adapter: AdapterSettings
    cache: CacheSettings
    storage: StorageSettings

    class Config:
        frozen = True

    @validator("env")
    def _normalize_env(cls, value: str) -> str:  # type: ignore[override]
        return value.lower()

    @validator("watchlists", pre=True)
    def _coerce_watchlists(cls, value: Mapping[str, Any]) -> Dict[str, List[str]]:  # type: ignore[override]
        return {key: list(items or []) for key, items in dict(value or {}).items()}

    def get_watchlist(self, name: str = "default") -> List[str]:
        return list(self.watchlists.get(name, []))

    def scoring_dict(self) -> Dict[str, Any]:
        return self.scoring.to_engine_config()


def _deep_merge(base: MutableMapping[str, Any], overrides: Mapping[str, Any]) -> MutableMapping[str, Any]:
    for key, value in overrides.items():
        if isinstance(value, Mapping):
            existing = base.get(key)
            if isinstance(existing, MutableMapping):
                base[key] = _deep_merge(copy.deepcopy(existing), value)
            else:
                base[key] = copy.deepcopy(value)
        else:
            base[key] = copy.deepcopy(value)
    return base


def _load_yaml(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = _safe_load(handle.read()) or {}
        if not isinstance(data, dict):
            raise ValueError(f"Configuration file {path} must contain a mapping at the root.")
        return data


def _build_settings(env: str) -> AppSettings:
    config_path = CONFIG_DIR / f"{env}.yaml"
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file for environment '{env}' not found at {config_path}")

    merged = copy.deepcopy(DEFAULT_SETTINGS)
    overrides = _load_yaml(config_path)
    merged = _deep_merge(merged, overrides)
    merged["env"] = env
    return AppSettings.parse_obj(merged)


@lru_cache(maxsize=None)
def _cached_settings(env: str) -> AppSettings:
    return _build_settings(env)


def get_settings(env: Optional[str] = None) -> AppSettings:
    """Load settings for the requested environment (default: APP_ENV or 'dev')."""

    resolved_env = (env or os.getenv(ENVIRONMENT_VARIABLE, "dev")).strip().lower()
    return _cached_settings(resolved_env)


def reset_settings_cache() -> None:
    """Clear the cached settings, primarily used during tests."""

    _cached_settings.cache_clear()


__all__ = [
    "AppSettings",
    "AdapterSettings",
    "CacheSettings",
    "ScoringSettings",
    "SQLiteSettings",
    "StorageSettings",
    "get_settings",
    "reset_settings_cache",
]
