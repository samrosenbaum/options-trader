"""Base definitions for storage backends."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Mapping, Optional, Sequence


class StorageError(RuntimeError):
    """Raised when a storage backend encounters an unrecoverable error."""


@dataclass(frozen=True)
class RunMetadata:
    """Metadata describing a single execution of the scanning workflow."""

    run_id: str
    run_at: datetime
    environment: Optional[str] = None
    watchlist: Optional[str] = None
    extra: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class OptionSnapshot:
    """Snapshot of an option contract at scan time."""

    symbol: str
    option_type: str
    expiration: str
    strike: float
    data: Mapping[str, Any]
    contract_symbol: Optional[str] = None


@dataclass(frozen=True)
class SignalSnapshot:
    """Snapshot of a generated signal and its computed score."""

    symbol: str
    option_type: str
    score: float
    data: Mapping[str, Any]
    contract_symbol: Optional[str] = None


class Storage(ABC):
    """Abstract base class for persistence backends."""

    @abstractmethod
    def save_run(
        self,
        metadata: RunMetadata,
        options: Sequence[OptionSnapshot],
        signals: Sequence[SignalSnapshot],
    ) -> None:
        """Persist a full scan run to storage."""

    @abstractmethod
    def list_runs(self, limit: Optional[int] = None) -> List[RunMetadata]:
        """Return stored run metadata sorted from newest to oldest."""

    @abstractmethod
    def get_metadata(self, run_id: str) -> Optional[RunMetadata]:
        """Fetch metadata for a given run identifier."""

    @abstractmethod
    def get_options(self, run_id: str) -> List[OptionSnapshot]:
        """Return option snapshots associated with a run."""

    @abstractmethod
    def get_signals(self, run_id: str) -> List[SignalSnapshot]:
        """Return generated signals associated with a run."""


__all__ = [
    "OptionSnapshot",
    "RunMetadata",
    "SignalSnapshot",
    "Storage",
    "StorageError",
]
