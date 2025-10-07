"""Adapter implementation backed by the public yfinance client."""

from __future__ import annotations

import math
import random
import time
from datetime import date, datetime
from typing import Any, Callable, List, Sequence

import pandas as pd
import yfinance as yf

from .base import AdapterError, OptionsChain, OptionsDataAdapter


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
        underlying_price = self._extract_price(ticker)

        return OptionsChain(
            symbol=symbol,
            expiration=expiration,
            calls=calls,
            puts=puts,
            underlying_price=underlying_price,
        )

    def _retry(self, operation: Callable[[], Any], context: str):
        last_error: Exception | None = None
        for attempt in range(self._max_retries):
            try:
                return operation()
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

    def _extract_price(self, ticker: yf.Ticker) -> float | None:
        """Return the most up-to-date underlying price available."""

        def _add_candidate(value: Any, candidates: List[float]) -> None:
            if value in (None, 0, ""):
                return
            try:
                price_val = float(value)
            except (TypeError, ValueError):  # pragma: no cover - defensive branch
                return
            if not math.isfinite(price_val) or price_val <= 0:
                return
            candidates.append(price_val)

        candidates: List[float] = []

        # Prefer fast_info which is closer to real-time than the general info payload
        try:
            fast_info = self._retry(lambda: getattr(ticker, "fast_info", {}), context="fetch fast price info")
        except AdapterError:
            fast_info = {}
        if isinstance(fast_info, dict):
            for key in ("last_price", "lastPrice", "regular_market_price", "regularMarketPrice"):
                _add_candidate(fast_info.get(key), candidates)

        # Fall back to recent intraday history for a spot price if fast_info failed
        if not candidates:
            try:
                history = self._retry(
                    lambda: ticker.history(period="1d", interval="1m"),
                    context="fetch intraday price history",
                )
            except AdapterError:
                history = None
            if isinstance(history, pd.DataFrame) and not history.empty:
                last_close = history["Close"].dropna()
                if not last_close.empty:
                    _add_candidate(last_close.iloc[-1], candidates)

        # Finally fall back to the (potentially stale) info payload if needed
        if not candidates:
            try:
                info = self._retry(lambda: ticker.info, context="fetch price metadata")
            except AdapterError:
                info = None
            if isinstance(info, dict):
                for key in ("currentPrice", "regularMarketPrice", "previousClose"):
                    _add_candidate(info.get(key), candidates)

        return candidates[0] if candidates else None


__all__ = ["YFinanceOptionsDataAdapter"]
