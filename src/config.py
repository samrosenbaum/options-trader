"""Configuration helpers for Python scripts."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Optional

from .adapters import OptionsDataAdapter, create_adapter

DEFAULT_OPTIONS_PROVIDER = "yfinance"


@lru_cache(maxsize=None)
def _get_options_data_adapter(provider: Optional[str]) -> OptionsDataAdapter:
    name = (provider or os.getenv("OPTIONS_DATA_PROVIDER", DEFAULT_OPTIONS_PROVIDER)).strip().lower()
    try:
        return create_adapter(name)
    except KeyError as exc:  # pragma: no cover - defensive branch
        raise ValueError(f"Unsupported options data provider: {name}") from exc


def get_options_data_adapter(provider: Optional[str] = None) -> OptionsDataAdapter:
    """Return an options data adapter instance based on configuration."""

    return _get_options_data_adapter(provider)


def reset_options_data_adapter_cache() -> None:
    """Clear the cached adapter instance (useful for tests)."""

    _get_options_data_adapter.cache_clear()


__all__ = [
    "DEFAULT_OPTIONS_PROVIDER",
    "get_options_data_adapter",
    "reset_options_data_adapter_cache",
]
