"""Shared helpers for deriving actionable option pricing information."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any, Mapping, MutableMapping, Tuple

_PRICING_FIELDS: Tuple[str, ...] = (
    "mark",
    "markPrice",
    "midpoint",
    "mid",
    "fairValue",
    "fair_price",
    "theoValue",
)


def _extract(option: Any, field: str) -> Any:
    """Best-effort accessor that works with dicts, Series, and objects."""

    if option is None:
        return None

    if isinstance(option, Mapping):
        return option.get(field)

    getter = getattr(option, "get", None)
    if callable(getter):
        try:
            return getter(field, None)
        except TypeError:
            # pandas Series.get accepts default, but guard for signature mismatch
            try:
                return getter(field)
            except Exception:
                pass
        except Exception:
            pass

    try:
        return option[field]
    except Exception:
        return getattr(option, field, None)


def safe_float(value: Any) -> float:
    """Convert arbitrary input to a finite float, returning 0.0 on failure."""

    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.0

    if not isfinite(parsed):
        return 0.0

    return parsed


@dataclass(frozen=True)
class OptionPricing:
    """Resolved pricing context for a single option contract."""

    price: float
    source: str
    bid: float
    ask: float
    last_trade: float

    @property
    def is_actionable(self) -> bool:
        if self.price <= 0.0:
            return False

        if self.source == "ask":
            return True

        if self.source in _PRICING_FIELDS or self.source == "midpoint":
            return self.ask > 0

        if self.source == "lastPrice":
            return self.ask > 0

        return False


def infer_option_pricing(option: Any) -> OptionPricing:
    """Derive the most reliable live price available for a contract."""

    bid = safe_float(_extract(option, "bid"))
    ask = safe_float(_extract(option, "ask"))
    last_trade = safe_float(_extract(option, "lastPrice"))

    def positive(value: Any) -> float:
        parsed = safe_float(value)
        return parsed if parsed > 0 else 0.0

    if ask > 0:
        return OptionPricing(price=ask, source="ask", bid=bid, ask=ask, last_trade=last_trade)

    for field in _PRICING_FIELDS:
        price = positive(_extract(option, field))
        if price > 0:
            return OptionPricing(price=price, source=field, bid=bid, ask=ask, last_trade=last_trade)

    if bid > 0 and ask > 0:
        midpoint = (bid + ask) / 2
        if midpoint > 0:
            return OptionPricing(price=midpoint, source="midpoint", bid=bid, ask=ask, last_trade=last_trade)

    if bid > 0:
        return OptionPricing(price=bid, source="bid", bid=bid, ask=ask, last_trade=last_trade)

    if last_trade > 0:
        return OptionPricing(price=last_trade, source="lastPrice", bid=bid, ask=ask, last_trade=last_trade)

    return OptionPricing(price=0.0, source="unavailable", bid=bid, ask=ask, last_trade=last_trade)


def apply_pricing_annotations(option: MutableMapping[str, Any], pricing: OptionPricing) -> None:
    """Persist pricing metadata on the option payload for downstream consumers."""

    option["lastPrice"] = pricing.price
    option["_effectivePrice"] = pricing.price
    option["_pricing_basis"] = pricing.source
    option["_price_source"] = pricing.source
    option["_rawLastPrice"] = pricing.last_trade
    if pricing.bid > 0 and safe_float(option.get("bid")) <= 0:
        option["bid"] = pricing.bid
    if pricing.ask > 0 and safe_float(option.get("ask")) <= 0:
        option["ask"] = pricing.ask
