"""Tradier adapter placeholders and documentation."""

from __future__ import annotations

from datetime import date
from typing import Sequence

from .base import OptionsChain, OptionsDataAdapter


class TradierOptionsDataAdapter(OptionsDataAdapter):
    """Options data adapter for Tradier's brokerage API.

    Expected environment variables:
        * ``TRADIER_API_KEY`` - Authentication token for the Tradier API.
        * ``TRADIER_BASE_URL`` - Optional base URL override for sandbox vs production.
    """

    @property
    def name(self) -> str:
        return "tradier"

    def get_chain(self, symbol: str, expiration: date) -> OptionsChain:  # pragma: no cover - placeholder
        raise NotImplementedError("Tradier adapter is not yet implemented")

    def get_expirations(self, symbol: str) -> Sequence[date]:  # pragma: no cover - placeholder
        raise NotImplementedError("Tradier adapter is not yet implemented")


__all__ = ["TradierOptionsDataAdapter"]
