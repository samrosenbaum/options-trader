"""Adapter implementations for external options data providers."""

from __future__ import annotations

from importlib import import_module
from typing import Dict, Type

from .base import OptionsDataAdapter

_ADAPTER_REGISTRY: Dict[str, str] = {
    "yfinance": "src.adapters.yfinance:YFinanceOptionsDataAdapter",
    "polygon": "src.adapters.polygon:PolygonOptionsDataAdapter",
    "tradier": "src.adapters.tradier:TradierOptionsDataAdapter",
}


def create_adapter(provider: str) -> OptionsDataAdapter:
    """Instantiate an options data adapter by name.

    Args:
        provider: The lowercase name of the provider to load.

    Returns:
        An instance of the requested adapter implementation.

    Raises:
        KeyError: If the provider name is unknown.
    """

    normalized = provider.lower()
    try:
        dotted_path = _ADAPTER_REGISTRY[normalized]
    except KeyError as exc:  # pragma: no cover - defensive branch
        raise KeyError(f"Unknown options data provider: {provider}") from exc

    module_name, class_name = dotted_path.split(":", 1)
    module = import_module(module_name)
    adapter_cls: Type[OptionsDataAdapter] = getattr(module, class_name)
    return adapter_cls()


__all__ = ["OptionsDataAdapter", "create_adapter"]
