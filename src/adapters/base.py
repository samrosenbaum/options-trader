"""Core abstractions for options data adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
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
    """Normalized representation of an options chain with data quality metadata."""

    symbol: str
    expiration: date
    calls: pd.DataFrame
    puts: pd.DataFrame
    underlying_price: Optional[float] = None
    price_timestamp: Optional[datetime] = None
    price_source: Optional[str] = None

    def to_dataframe(self) -> pd.DataFrame:
        """Combine call and put DataFrames into a single normalized DataFrame with metadata."""

        frames: List[pd.DataFrame] = []
        for option_type, frame in (("call", self.calls), ("put", self.puts)):
            if frame is None or frame.empty:
                continue

            enriched = frame.copy()
            enriched["type"] = option_type
            enriched["symbol"] = self.symbol
            enriched["expiration"] = self.expiration.isoformat()

            # Add stock price
            if self.underlying_price is not None:
                if "stockPrice" not in enriched.columns:
                    enriched["stockPrice"] = self.underlying_price
                else:
                    enriched["stockPrice"] = enriched["stockPrice"].fillna(self.underlying_price)
            elif "stockPrice" not in enriched.columns:
                # Ensure the column exists even if we do not know the price.
                enriched["stockPrice"] = pd.NA

            # Add price metadata for data quality tracking
            if self.price_timestamp is not None:
                enriched["_price_timestamp"] = self.price_timestamp.isoformat()
            else:
                enriched["_price_timestamp"] = None

            if self.price_source is not None:
                enriched["_price_source"] = self.price_source
            else:
                enriched["_price_source"] = "unknown"

            # Calculate age in seconds for quick filtering
            if self.price_timestamp is not None:
                from datetime import timezone
                now = datetime.now(timezone.utc)
                age_seconds = (now - self.price_timestamp).total_seconds()
                enriched["_price_age_seconds"] = age_seconds
            else:
                enriched["_price_age_seconds"] = None

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
