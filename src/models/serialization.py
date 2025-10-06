"""Serialization helpers shared between services."""

from __future__ import annotations

from typing import Any, Dict

from .signal import ScanRequest, ScanResponse, Signal


def serialize_signal(signal: Signal) -> Dict[str, Any]:
    """Return a JSON-compatible representation of a signal."""

    return signal.model_dump()


def serialize_scan_request(request: ScanRequest) -> Dict[str, Any]:
    """Return a JSON-compatible payload for scan requests."""

    return request.model_dump()


def serialize_scan_response(response: ScanResponse) -> Dict[str, Any]:
    """Return a JSON-compatible payload for scan responses."""

    return response.model_dump()


__all__ = [
    "serialize_scan_request",
    "serialize_scan_response",
    "serialize_signal",
]
