"""Core Python package for options trader utilities."""

from __future__ import annotations

from typing import Any


def get_options_data_adapter(*args: Any, **kwargs: Any):  # pragma: no cover - thin wrapper
    """Lazily import the configured data adapter factory."""

    from .config import get_options_data_adapter as _impl

    return _impl(*args, **kwargs)


__all__ = ["get_options_data_adapter"]
