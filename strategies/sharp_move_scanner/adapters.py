"""Integration helpers for the Sharp Move scanner."""

from __future__ import annotations

import csv
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import numpy as np
import pandas as pd
import yfinance as yf

try:  # Prefer the configured adapter from the existing code base.
    from src.config import get_options_data_adapter
    from src.adapters.base import OptionsChain, OptionsDataAdapter
except Exception:  # pragma: no cover - defensive guard for minimal installs
    get_options_data_adapter = None  # type: ignore
    OptionsChain = None  # type: ignore
    OptionsDataAdapter = None  # type: ignore

LOGGER = logging.getLogger("sharp_move.adapters")

_SAMPLE_DATA_DIR = Path("data/sharp_move_samples")


def _sample_history_path(symbol: str) -> Path:
    return _SAMPLE_DATA_DIR / f"{symbol.upper()}_history.csv"


def _load_sample_history(symbol: str) -> pd.DataFrame:
    path = _sample_history_path(symbol)
    if not path.exists():
        return pd.DataFrame()
    history = pd.read_csv(path, parse_dates=["Date"])
    history.set_index("Date", inplace=True)
    return history


def _synthetic_expirations() -> Sequence[date]:
    today = date.today()
    base = today + timedelta(days=3)
    return [base, base + timedelta(days=2), base + timedelta(days=5)]


def _synthetic_chain(symbol: str, expiration: date) -> pd.DataFrame:
    history = _load_sample_history(symbol)
    if history.empty:
        spot = 100.0
    else:
        spot = float(history["Close"].iloc[-1])
    spread_width = max(spot * 0.02, 1.0)
    strikes = [round(spot * factor, 2) for factor in (0.95, 1.0, 1.05)]
    rows: List[Dict[str, object]] = []
    for idx, strike in enumerate(strikes):
        offset = strikes[idx] - spot
        base_mid = max(spread_width + abs(offset) * 0.1, 0.5)
        bid = base_mid * 0.98
        ask = base_mid * 1.02
        iv = max(0.2, min(0.6, 0.35 + (idx - 1) * 0.05))
        volume = 800 + idx * 150
        oi = 1200 + idx * 200
        gamma = 0.02 / (idx + 1)
        theta = -0.05 * (idx + 1)
        vega = 0.1 * (idx + 1)
        call_delta = 0.25 + idx * 0.2
        put_delta = -0.25 - idx * 0.2
        for opt_type, delta in (("call", call_delta), ("put", put_delta)):
            rows.append(
                {
                    "symbol": symbol,
                    "expiration": expiration,
                    "type": opt_type,
                    "strike": float(strike),
                    "bid": float(bid),
                    "ask": float(ask),
                    "lastPrice": base_mid,
                    "volume": float(volume),
                    "openInterest": float(oi),
                    "impliedVolatility": float(iv),
                    "delta": float(delta if opt_type == "call" else -abs(delta)),
                    "gamma": float(gamma),
                    "theta": float(theta),
                    "vega": float(vega),
                    "stockPrice": float(spot),
                }
            )
    frame = pd.DataFrame(rows)
    if not frame.empty:
        frame["mid"] = (frame["bid"] + frame["ask"]) / 2.0
        frame["spread_pct"] = (frame["ask"] - frame["bid"]).clip(lower=0) / frame["mid"].replace(0, np.nan)
        frame["spread_pct"] = frame["spread_pct"].fillna(0.05)
    return frame


@dataclass
class EarningsEvent:
    """Normalized corporate event details."""

    date: date
    event_type: str = "earnings"


@dataclass
class MacroEvent:
    """Macro economic event loaded from the shared CSV calendar."""

    date: date
    name: str


def _load_adapter() -> OptionsDataAdapter | None:
    if get_options_data_adapter is None:
        return None
    try:
        return get_options_data_adapter()
    except Exception as exc:  # pragma: no cover - defensive guard
        LOGGER.warning("Falling back to yfinance adapter: %s", exc)
        return None


@lru_cache(maxsize=64)
def list_expirations(symbol: str) -> Sequence[date]:
    """Return available expirations, falling back to yfinance when needed."""

    normalized = symbol.upper().strip()
    adapter = _load_adapter()
    if adapter is not None:
        try:
            return adapter.get_expirations(normalized)
        except Exception as exc:
            LOGGER.info("Adapter could not list expirations for %s: %s", normalized, exc)

    ticker = yf.Ticker(normalized)
    try:
        expirations = getattr(ticker, "options", [])
    except Exception as exc:  # pragma: no cover - yfinance uses broad exceptions
        LOGGER.error("Failed to load expirations via yfinance for %s: %s", normalized, exc)
        return _synthetic_expirations()

    parsed: List[date] = []
    for raw in expirations:
        try:
            parsed.append(datetime.strptime(raw, "%Y-%m-%d").date())
        except Exception:
            continue
    return parsed or _synthetic_expirations()


def _fetch_chain_via_adapter(symbol: str, expiration: date) -> OptionsChain | None:
    adapter = _load_adapter()
    if adapter is None:
        return None
    try:
        return adapter.get_chain(symbol, expiration)
    except Exception as exc:
        LOGGER.info("Adapter failed to fetch chain for %s %s: %s", symbol, expiration, exc)
        return None


def get_options_chain(symbol: str, expiration: date) -> pd.DataFrame:
    """Fetch an options chain for the requested expiration."""

    normalized = symbol.upper().strip()
    chain = _fetch_chain_via_adapter(normalized, expiration)
    if chain is not None:
        frame = chain.to_dataframe()
        if not frame.empty:
            return frame

    ticker = yf.Ticker(normalized)
    try:
        option_chain = ticker.option_chain(expiration.strftime("%Y-%m-%d"))
    except Exception as exc:  # pragma: no cover - defensive guard
        LOGGER.error("yfinance failed to fetch option chain for %s %s: %s", normalized, expiration, exc)
        synthetic = _synthetic_chain(normalized, expiration)
        if synthetic.empty:
            return synthetic
        spot = get_spot_price(normalized)
        if spot is not None:
            synthetic["stockPrice"] = synthetic.get("stockPrice", spot)
        else:
            synthetic["stockPrice"] = synthetic.get("stockPrice")
        return synthetic

    calls = getattr(option_chain, "calls", pd.DataFrame()).copy()
    puts = getattr(option_chain, "puts", pd.DataFrame()).copy()
    for frame, kind in ((calls, "call"), (puts, "put")):
        if frame.empty:
            continue
        frame["type"] = kind
        frame["symbol"] = normalized
        frame["expiration"] = expiration
    if calls.empty and puts.empty:
        return _synthetic_chain(normalized, expiration)
    combined = pd.concat([calls, puts], ignore_index=True, sort=False)
    spot = get_spot_price(normalized)
    if spot is not None:
        combined["stockPrice"] = spot
    return combined


@lru_cache(maxsize=128)
def get_spot_price(symbol: str) -> float | None:
    """Return the latest underlying price using multiple fallbacks."""

    normalized = symbol.upper().strip()
    adapter = _load_adapter()
    if adapter is not None:
        try:
            expirations = adapter.get_expirations(normalized)
            if expirations:
                chain = adapter.get_chain(normalized, expirations[0])
                if chain.underlying_price is not None:
                    return float(chain.underlying_price)
        except Exception:
            LOGGER.debug("Adapter spot lookup failed for %s", normalized, exc_info=True)

    ticker = yf.Ticker(normalized)
    try:
        fast_info = getattr(ticker, "fast_info", {})
        for key in ("last_price", "lastPrice", "regular_market_price", "regularMarketPrice"):
            value = fast_info.get(key)
            if value:
                return float(value)
    except Exception:
        LOGGER.debug("fast_info lookup failed for %s", normalized, exc_info=True)

    try:
        info = ticker.info
        price = info.get("regularMarketPrice") or info.get("currentPrice")
        if price:
            return float(price)
    except Exception:
        LOGGER.debug("ticker.info lookup failed for %s", normalized, exc_info=True)

    history = _load_sample_history(normalized)
    if not history.empty:
        try:
            return float(history["Close"].iloc[-1])
        except Exception:
            LOGGER.debug("Sample history close lookup failed for %s", normalized, exc_info=True)
    return None


@lru_cache(maxsize=128)
def get_price_history(symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
    """Download OHLCV data for indicator calculations."""

    normalized = symbol.upper().strip()
    ticker = yf.Ticker(normalized)
    try:
        history = ticker.history(period=period, interval=interval, auto_adjust=False)
    except Exception as exc:  # pragma: no cover - yfinance raises broad errors
        LOGGER.error("Failed to download price history for %s: %s", normalized, exc)
        history = pd.DataFrame()
    if history is not None and not history.empty:
        return history.dropna(how="all")

    sample = _load_sample_history(normalized)
    if sample.empty:
        LOGGER.warning("No sample history available for %s", normalized)
        return pd.DataFrame()
    return sample


@lru_cache(maxsize=64)
def get_earnings_calendar(symbol: str, limit: int = 4) -> List[EarningsEvent]:
    """Fetch future earnings dates from yfinance."""

    normalized = symbol.upper().strip()
    ticker = yf.Ticker(normalized)
    events: List[EarningsEvent] = []
    try:
        calendar = ticker.get_earnings_dates(limit=limit)
    except Exception:
        calendar = pd.DataFrame()
    if isinstance(calendar, pd.DataFrame) and not calendar.empty:
        for idx in calendar.index:
            try:
                raw_date = calendar.loc[idx, "Earnings Date"]
                if isinstance(raw_date, (list, tuple)):
                    raw_date = raw_date[0]
                earnings_date = pd.to_datetime(raw_date).date()
            except Exception:
                continue
            if earnings_date >= date.today():
                events.append(EarningsEvent(date=earnings_date))
    return events


def _macro_calendar_path() -> Path:
    return Path("data/macro_events.csv")


@lru_cache(maxsize=1)
def get_macro_calendar() -> List[MacroEvent]:
    """Load macro events from the shared CSV calendar if it exists."""

    path = _macro_calendar_path()
    if not path.exists():
        return []
    events: List[MacroEvent] = []
    with path.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            try:
                event_date = datetime.strptime(row.get("date", ""), "%Y-%m-%d").date()
            except Exception:
                continue
            name = row.get("name") or "macro"
            events.append(MacroEvent(date=event_date, name=name))
    return events


def get_event_context(symbol: str, window_days: int) -> Dict[str, object]:
    """Return the closest upcoming event and days until it occurs."""

    today = date.today()
    earnings_events = get_earnings_calendar(symbol)
    macro_events = get_macro_calendar()

    upcoming: List[tuple[str, int]] = []
    for event in earnings_events:
        delta = (event.date - today).days
        if delta >= -window_days:
            upcoming.append((event.event_type, delta))
    for event in macro_events:
        delta = (event.date - today).days
        if delta >= -window_days:
            upcoming.append((event.name, delta))

    if not upcoming:
        return {"event_flag": False, "days_to_event": None, "event_type": None}

    event_type, days = min(upcoming, key=lambda item: abs(item[1]))
    return {"event_flag": True, "days_to_event": days, "event_type": event_type}


def fetch_flow_metrics(symbol: str, expiration: date) -> Dict[str, Optional[float]]:
    """Placeholder for unusual options activity integrations."""

    # This project intentionally avoids paid APIs. Expose a deterministic stub so callers
    # can plug in their own provider by monkeypatching or extending this module.
    LOGGER.debug("Flow metrics unavailable for %s %s", symbol, expiration)
    return {"flow_calls_ratio": None, "flow_net_premium": None}


def as_of_timestamp() -> datetime:
    """Return a timestamp representing the data retrieval moment."""

    return datetime.utcnow()


__all__ = [
    "EarningsEvent",
    "MacroEvent",
    "list_expirations",
    "get_options_chain",
    "get_spot_price",
    "get_price_history",
    "get_event_context",
    "fetch_flow_metrics",
    "as_of_timestamp",
]
