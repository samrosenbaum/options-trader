"""Adapter implementation backed by the public yfinance client."""

from __future__ import annotations

import math
import random
import sys
import time
import threading
from datetime import date, datetime, timezone
from typing import Any, Callable, List, NamedTuple, Sequence, Optional

import pandas as pd
import yfinance as yf

from .base import AdapterError, OptionsChain, OptionsDataAdapter


class TimeoutError(Exception):
    """Raised when operation exceeds timeout."""
    pass


def run_with_timeout(func: Callable, timeout_seconds: int) -> Any:
    """Run a function with a timeout using threading.

    This is more reliable than signal-based timeouts, especially in subprocesses.
    """
    result_container: List[Any] = []
    exception_container: List[Exception] = []

    def wrapper():
        try:
            result_container.append(func())
        except Exception as e:
            exception_container.append(e)

    thread = threading.Thread(target=wrapper, daemon=True)
    thread.start()
    thread.join(timeout=timeout_seconds)

    if thread.is_alive():
        # Thread is still running - timeout occurred
        raise TimeoutError(f"Operation timed out after {timeout_seconds} seconds")

    if exception_container:
        raise exception_container[0]

    if result_container:
        return result_container[0]

    raise TimeoutError("Operation completed but returned no result")


class PriceInfo(NamedTuple):
    """Container for price data with metadata for quality tracking."""

    price: float
    timestamp: datetime
    source: str
    age_seconds: float


class YFinanceOptionsDataAdapter(OptionsDataAdapter):
    """Fetch options data from Yahoo Finance via yfinance."""

    def __init__(
        self,
        ticker_factory: Callable[[str], yf.Ticker] | None = None,
        max_retries: int = 3,
        base_delay: float = 0.75,
        max_delay: float = 4.0,
        jitter: float = 0.3,
    ) -> None:
        self._ticker_factory = ticker_factory or yf.Ticker
        self._max_retries = max(1, max_retries)
        self._base_delay = base_delay
        self._max_delay = max_delay
        self._jitter = jitter

    @property
    def name(self) -> str:
        return "yfinance"

    def get_expirations(self, symbol: str) -> Sequence[date]:
        ticker = self._ticker_factory(symbol)
        expirations = self._retry(lambda: ticker.options, context="fetch expirations")
        parsed: List[date] = []
        for raw in expirations:
            try:
                parsed.append(datetime.strptime(raw, "%Y-%m-%d").date())
            except ValueError:  # pragma: no cover - defensive branch
                continue
        return parsed

    def get_chain(self, symbol: str, expiration: date) -> OptionsChain:
        ticker = self._ticker_factory(symbol)
        expiration_str = expiration.strftime("%Y-%m-%d")
        option_chain = self._retry(
            lambda: ticker.option_chain(expiration_str),
            context=f"fetch options chain for {symbol} {expiration_str}",
        )

        calls_frame = getattr(option_chain, "calls", None)
        puts_frame = getattr(option_chain, "puts", None)
        calls = calls_frame.copy() if calls_frame is not None else pd.DataFrame()
        puts = puts_frame.copy() if puts_frame is not None else pd.DataFrame()
        price_info = self._extract_price(ticker)

        return OptionsChain(
            symbol=symbol,
            expiration=expiration,
            calls=calls,
            puts=puts,
            underlying_price=price_info.price if price_info else None,
            price_timestamp=price_info.timestamp if price_info else None,
            price_source=price_info.source if price_info else None,
        )

    def _retry(self, operation: Callable[[], Any], context: str, timeout_seconds: int = 30):
        last_error: Exception | None = None
        for attempt in range(self._max_retries):
            try:
                # Use threading-based timeout (more reliable than signal.alarm() in subprocesses)
                result = run_with_timeout(operation, timeout_seconds)
                return result

            except TimeoutError as timeout_exc:
                last_error = timeout_exc
                print(f"⏱️  Timeout after {timeout_seconds}s while trying to {context} (attempt {attempt + 1}/{self._max_retries})", file=sys.stderr)
                if attempt == self._max_retries - 1:
                    raise AdapterError(f"Timeout after {timeout_seconds}s while trying to {context}") from timeout_exc
                self._apply_rate_limit_backoff(attempt)

            except Exception as exc:  # pragma: no cover - yfinance raises generic errors
                last_error = exc
                if attempt == self._max_retries - 1:
                    break
                self._apply_rate_limit_backoff(attempt)

        if last_error is not None:
            raise AdapterError(f"Failed to {context}: {last_error}") from last_error
        raise AdapterError(f"Failed to {context}: unknown error")

    def _apply_rate_limit_backoff(self, attempt: int) -> None:
        delay = min(self._max_delay, self._base_delay * (1 + attempt))
        delay += random.uniform(0, self._jitter)
        time.sleep(delay)

    def _extract_price(self, ticker: yf.Ticker) -> PriceInfo | None:
        """
        Return the most up-to-date underlying price with timestamp and source tracking.

        Attempts multiple data sources in priority order, tracking which source was used
        and how fresh the data is. This allows downstream consumers to validate data quality.
        """
        fetch_time = datetime.now(timezone.utc)

        # Priority 1: fast_info (real-time or near real-time)
        try:
            fast_info = self._retry(lambda: getattr(ticker, "fast_info", {}), context="fetch fast price info")
            if isinstance(fast_info, dict):
                for key in ("last_price", "lastPrice", "regular_market_price", "regularMarketPrice"):
                    value = fast_info.get(key)
                    if self._is_valid_price(value):
                        price = float(value)
                        # fast_info is typically real-time, assume minimal age
                        return PriceInfo(
                            price=price,
                            timestamp=fetch_time,
                            source=f"fast_info.{key}",
                            age_seconds=0.0,
                        )
        except AdapterError:
            pass

        # Priority 2: Intraday history (1-minute bars)
        try:
            history = self._retry(
                lambda: ticker.history(period="1d", interval="1m"),
                context="fetch intraday price history",
            )
            if isinstance(history, pd.DataFrame) and not history.empty:
                last_close = history["Close"].dropna()
                if not last_close.empty:
                    last_price = float(last_close.iloc[-1])
                    # Get timestamp of the last bar
                    last_timestamp = history.index[-1]

                    # Convert to UTC if needed
                    if last_timestamp.tzinfo is None:
                        last_timestamp = last_timestamp.tz_localize("America/New_York").tz_convert(timezone.utc)
                    else:
                        last_timestamp = last_timestamp.tz_convert(timezone.utc)

                    age_seconds = (fetch_time - last_timestamp).total_seconds()

                    # Only use if reasonably fresh (within 15 minutes during market hours)
                    if age_seconds < 900:  # 15 minutes
                        return PriceInfo(
                            price=last_price,
                            timestamp=last_timestamp,
                            source=f"intraday_1m",
                            age_seconds=age_seconds,
                        )
        except AdapterError:
            pass

        # Priority 3: info dict (may be cached/stale)
        try:
            info = self._retry(lambda: ticker.info, context="fetch price metadata")
            if isinstance(info, dict):
                # Try current/regular market price first
                for key in ("currentPrice", "regularMarketPrice"):
                    value = info.get(key)
                    if self._is_valid_price(value):
                        market_state = info.get("marketState", "UNKNOWN")
                        price = float(value)

                        # Try to get market time from info
                        market_time = info.get("regularMarketTime")
                        if market_time:
                            try:
                                price_timestamp = datetime.fromtimestamp(market_time, tz=timezone.utc)
                            except (TypeError, ValueError, OSError):
                                price_timestamp = fetch_time
                        else:
                            price_timestamp = fetch_time

                        age_seconds = (fetch_time - price_timestamp).total_seconds()

                        return PriceInfo(
                            price=price,
                            timestamp=price_timestamp,
                            source=f"info.{key}_{market_state}",
                            age_seconds=age_seconds,
                        )

                # Last resort: previous close
                value = info.get("previousClose")
                if self._is_valid_price(value):
                    price = float(value)
                    # previousClose is from prior trading day - estimate age
                    # Assume previous close was ~16 hours ago (4pm previous day)
                    estimated_age = 16 * 3600  # 16 hours in seconds
                    return PriceInfo(
                        price=price,
                        timestamp=fetch_time - pd.Timedelta(seconds=estimated_age),
                        source="info.previousClose_STALE",
                        age_seconds=estimated_age,
                    )
        except AdapterError:
            pass

        return None

    def _is_valid_price(self, value: Any) -> bool:
        """Check if a value represents a valid price."""
        if value in (None, 0, ""):
            return False
        try:
            price_val = float(value)
        except (TypeError, ValueError):
            return False
        return math.isfinite(price_val) and price_val > 0


__all__ = ["YFinanceOptionsDataAdapter"]
