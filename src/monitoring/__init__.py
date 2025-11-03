"""Monitoring utilities for portfolio and market risk."""

from __future__ import annotations

from typing import TYPE_CHECKING

try:  # pragma: no cover - optional dependency wiring
    from .drop_alert_scanner import DropAlertScanner, DropRiskSignalResult
except (ModuleNotFoundError, ImportError):  # pragma: no cover - allow lightweight environments and handle circular imports
    DropAlertScanner = None  # type: ignore[assignment]
    DropRiskSignalResult = None  # type: ignore[assignment]

from .quote_integrity import QuoteIntegrityMonitor, QuoteIntegritySummary

__all__ = ["QuoteIntegrityMonitor", "QuoteIntegritySummary"]

if TYPE_CHECKING or DropAlertScanner is not None:
    __all__ += ["DropAlertScanner", "DropRiskSignalResult"]
