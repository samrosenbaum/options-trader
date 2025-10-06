"""Core abstractions for options data adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from typing import List, Optional, Sequence

import pandas as pd


class AdapterError(Exception):
    """Base exception raised for adapter related failures."""


class RateLimitError(AdapterError):
    """Raised when a provider reports rate limiting errors."""


class DataNotAvailable(AdapterError):
    """Raised when requested data is not available from a provider."""


@dataclass
class OptionsChain:
    """Normalized representation of an options chain."""

    symbol: str
    expiration: date
    calls: pd.DataFrame
    puts: pd.DataFrame
    underlying_price: Optional[float] = None

    def to_dataframe(self) -> pd.DataFrame:
        """Combine call and put DataFrames into a single normalized DataFrame."""

        frames: List[pd.DataFrame] = []
        for option_type, frame in (("call", self.calls), ("put", self.puts)):
            if frame is None or frame.empty:
                continue

            enriched = frame.copy()
            enriched["type"] = option_type
            enriched["symbol"] = self.symbol
            enriched["expiration"] = self.expiration.isoformat()

            if self.underlying_price is not None:
                if "stockPrice" not in enriched.columns:
                    enriched["stockPrice"] = self.underlying_price
                else:
                    enriched["stockPrice"] = enriched["stockPrice"].fillna(self.underlying_price)
            elif "stockPrice" not in enriched.columns:
                # Ensure the column exists even if we do not know the price.
                enriched["stockPrice"] = pd.NA

            frames.append(enriched)

        if not frames:
            return pd.DataFrame()

        return pd.concat(frames, ignore_index=True)


class OptionsDataAdapter(ABC):
    """Abstract base class for fetching options data from external providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Human readable provider name."""

    @abstractmethod
    def get_chain(self, symbol: str, expiration: date) -> OptionsChain:
        """Return the options chain for a symbol and expiration date."""

    def get_expirations(self, symbol: str) -> Sequence[date]:
        """Return available expirations for a symbol."""

        raise NotImplementedError


__all__ = [
    "AdapterError",
    "RateLimitError",
    "DataNotAvailable",
    "OptionsChain",
    "OptionsDataAdapter",
]
