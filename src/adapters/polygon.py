"""Polygon.io adapter placeholders and documentation."""

from __future__ import annotations

from datetime import date
from typing import Sequence

from .base import OptionsChain, OptionsDataAdapter


class PolygonOptionsDataAdapter(OptionsDataAdapter):
    """Options data adapter for Polygon.io.

    Expected environment variables:
        * ``POLYGON_API_KEY`` - API key used to authenticate requests.
        * ``POLYGON_BASE_URL`` - Optional override for the Polygon REST endpoint.
    """

    @property
    def name(self) -> str:
        return "polygon"

    def get_chain(self, symbol: str, expiration: date) -> OptionsChain:  # pragma: no cover - placeholder
        raise NotImplementedError("Polygon adapter is not yet implemented")

    def get_expirations(self, symbol: str) -> Sequence[date]:  # pragma: no cover - placeholder
        raise NotImplementedError("Polygon adapter is not yet implemented")


__all__ = ["PolygonOptionsDataAdapter"]
