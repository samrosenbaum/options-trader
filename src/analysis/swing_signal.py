"""Swing detection utilities built on multi-factor analysis."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Dict, Iterable, List, Optional

import numpy as np
import pandas as pd
import yfinance as yf

from .news_sentiment import NewsHeadline, fetch_symbol_news


@dataclass
class FactorScore:
    """Normalized score for an analysis factor."""

    name: str
    score: float
    rationale: str
    details: Dict[str, object]

    def to_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "score": round(self.score, 2),
            "rationale": self.rationale,
            "details": self.details,
        }


@dataclass
class SwingSignal:
    """Composite swing signal for a given symbol."""

    symbol: str
    composite_score: float
    classification: str
    factors: List[FactorScore]
    metadata: Dict[str, object]

    def to_dict(self) -> Dict[str, object]:
        return {
            "symbol": self.symbol,
            "composite_score": round(self.composite_score, 2),
            "classification": self.classification,
            "factors": [factor.to_dict() for factor in self.factors],
            "metadata": self.metadata,
        }


PriceFetcher = Callable[[str, str, str], pd.DataFrame]
NewsFetcher = Callable[[str, int], Iterable[NewsHeadline]]
MarketFetcher = Callable[[], Dict[str, float]]


class SwingSignalAnalyzer:
    """Analyze multiple data sources to infer swing potential."""

    def __init__(
        self,
        *,
        lookback: str = "6mo",
        interval: str = "1d",
        news_limit: int = 5,
        price_fetcher: Optional[PriceFetcher] = None,
        news_fetcher: Optional[NewsFetcher] = None,
        market_fetcher: Optional[MarketFetcher] = None,
    ) -> None:
        self.lookback = lookback
        self.interval = interval
        self.news_limit = news_limit
        self.price_fetcher = price_fetcher or self._fetch_price_history
        self.news_fetcher = news_fetcher or self._fetch_news
        self.market_fetcher = market_fetcher or self._fetch_market_context
        self._market_cache: Optional[Dict[str, float]] = None

    def analyze(self, symbol: str) -> SwingSignal:
        symbol = symbol.upper()
        history = self.price_fetcher(symbol, self.lookback, self.interval)
        history = self._normalize_history(symbol, history)

        if history.empty or len(history) < 40:
            raise ValueError(
                f"Not enough price history to evaluate {symbol}. Need at least 40 data points."
            )

        required_columns = ["High", "Low", "Close", "Volume"]
        missing_columns = [col for col in required_columns if col not in history.columns]
        if missing_columns:
            raise ValueError(
                f"Price history for {symbol} is missing required columns: {missing_columns}"
            )

        history = history.dropna(subset=required_columns)
        if history.empty:
            raise ValueError(f"Price history for {symbol} is missing OHLCV data.")

        factors: List[FactorScore] = []

        volatility_factor = self._volatility_expansion_factor(history)
        factors.append(volatility_factor)

        momentum_factor = self._momentum_factor(history)
        factors.append(momentum_factor)

        volume_factor = self._volume_factor(history)
        factors.append(volume_factor)

        news_factor = self._news_factor(symbol)
        factors.append(news_factor)

        market_factor = self._market_regime_factor()
        factors.append(market_factor)

        weights = {
            "Volatility Expansion": 0.3,
            "Momentum Breakout": 0.2,
            "Volume Imbalance": 0.2,
            "News & Catalysts": 0.15,
            "Market Regime": 0.15,
        }

        composite = 0.0
        for factor in factors:
            weight = weights.get(factor.name, 0.0)
            composite += factor.score * weight

        classification = self._classify_score(composite)

        metadata = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "lookback": self.lookback,
            "interval": self.interval,
            "atr_ratio": volatility_factor.details.get("atr_ratio"),
            "momentum_zscore": momentum_factor.details.get("momentum_zscore"),
            "volume_zscore": volume_factor.details.get("volume_zscore"),
            "news_sample": news_factor.details.get("headlines", [])[:2],
            "market_context": market_factor.details,
        }

        return SwingSignal(
            symbol=symbol,
            composite_score=composite,
            classification=classification,
            factors=factors,
            metadata=metadata,
        )

    # ------------------------------------------------------------------
    # Fetchers
    # ------------------------------------------------------------------
    def _fetch_price_history(self, symbol: str, lookback: str, interval: str) -> pd.DataFrame:
        return yf.download(symbol, period=lookback, interval=interval, progress=False)

    def _fetch_news(self, symbol: str, limit: int) -> Iterable[NewsHeadline]:
        return fetch_symbol_news(symbol, limit=limit)

    def _fetch_market_context(self) -> Dict[str, float]:
        try:
            vix = yf.download("^VIX", period="3mo", interval="1d", progress=False)
            spy = yf.download("SPY", period="3mo", interval="1d", progress=False)
        except Exception:
            return {}

        context: Dict[str, float] = {}
        if not vix.empty:
            vix_ma = vix["Close"].rolling(20).mean().iloc[-1]
            vix_latest = vix["Close"].iloc[-1]
            if vix_ma and not np.isnan(vix_ma):
                context["vix_ratio"] = float(vix_latest / vix_ma) if vix_ma else 1.0
        if not spy.empty:
            spy_ret = spy["Close"].pct_change(5).iloc[-1]
            if not np.isnan(spy_ret):
                context["spy_return_5d"] = float(spy_ret)
        return context

    def _market_context(self) -> Dict[str, float]:
        if self._market_cache is None:
            self._market_cache = self.market_fetcher() or {}
        return self._market_cache

    # ------------------------------------------------------------------
    # Factor computations
    # ------------------------------------------------------------------
    def _volatility_expansion_factor(self, history: pd.DataFrame) -> FactorScore:
        atr = self._average_true_range(history, window=14)
        current_atr = float(atr.iloc[-1])
        baseline = float(atr.rolling(30).mean().iloc[-1]) if len(atr) >= 30 else current_atr

        if baseline == 0 or np.isnan(baseline):
            ratio = 1.0
        else:
            ratio = current_atr / baseline

        score = self._scale(ratio, lower=0.8, upper=2.2)
        rationale = (
            "ATR is {:.1f}% of its 30-day baseline, suggesting {} volatility expansion.".format(
                ratio * 100,
                "strong" if score > 70 else "moderate" if score > 55 else "limited",
            )
        )
        return FactorScore(
            name="Volatility Expansion",
            score=score,
            rationale=rationale,
            details={
                "atr": round(current_atr, 4),
                "atr_baseline": round(baseline, 4),
                "atr_ratio": round(ratio, 3),
            },
        )

    def _momentum_factor(self, history: pd.DataFrame) -> FactorScore:
        close = history["Close"]
        mean_20 = close.rolling(20).mean().iloc[-1]
        std_20 = close.rolling(20).std().iloc[-1]

        if std_20 == 0 or np.isnan(std_20):
            zscore = 0.0
        else:
            zscore = float((close.iloc[-1] - mean_20) / std_20)

        score = self._scale(zscore, lower=-1.5, upper=2.5)
        rationale = (
            "Price is {:.2f} standard deviations from the 20-day mean, indicating {} breakout risk.".format(
                zscore,
                "potential" if score >= 60 else "muted",
            )
        )
        return FactorScore(
            name="Momentum Breakout",
            score=score,
            rationale=rationale,
            details={
                "momentum_zscore": round(zscore, 3),
                "price": round(close.iloc[-1], 2),
                "mean_20": round(mean_20, 2),
            },
        )

    def _volume_factor(self, history: pd.DataFrame) -> FactorScore:
        volume = history["Volume"]
        avg_30 = volume.rolling(30).mean().iloc[-1]
        std_30 = volume.rolling(30).std().iloc[-1]

        if std_30 == 0 or np.isnan(std_30):
            zscore = 0.0
        else:
            zscore = float((volume.iloc[-1] - avg_30) / std_30)

        score = self._scale(zscore, lower=-1.0, upper=3.0)
        rationale = (
            "Volume z-score of {:.2f} versus 30-day average suggests {} participation.".format(
                zscore,
                "institutional" if score > 70 else "elevated" if score > 55 else "normal",
            )
        )
        return FactorScore(
            name="Volume Imbalance",
            score=score,
            rationale=rationale,
            details={
                "volume": int(volume.iloc[-1]),
                "volume_avg_30": int(avg_30) if not np.isnan(avg_30) else None,
                "volume_zscore": round(zscore, 3),
            },
        )

    def _news_factor(self, symbol: str) -> FactorScore:
        headlines = list(self.news_fetcher(symbol, self.news_limit) or [])
        if not headlines:
            return FactorScore(
                name="News & Catalysts",
                score=50.0,
                rationale="No recent headlines fetched; sentiment treated as neutral.",
                details={"headlines": []},
            )

        scores = [headline.sentiment_score for headline in headlines]
        avg_score = float(np.mean(scores))
        score = self._scale(avg_score, lower=-0.5, upper=0.6)
        rationale = (
            "Average news sentiment score of {:.2f} across {} headlines.".format(
                avg_score,
                len(headlines),
            )
        )
        return FactorScore(
            name="News & Catalysts",
            score=score,
            rationale=rationale,
            details={
                "average_sentiment": round(avg_score, 3),
                "headlines": [headline.to_dict() for headline in headlines],
            },
        )

    def _market_regime_factor(self) -> FactorScore:
        context = self._market_context()
        if not context:
            return FactorScore(
                name="Market Regime",
                score=50.0,
                rationale="Global market context unavailable; defaulting to neutral.",
                details={},
            )

        vix_ratio = context.get("vix_ratio", 1.0)
        spy_return = context.get("spy_return_5d", 0.0)

        # Higher VIX ratio increases swing potential, negative SPY returns too
        normalized_vix = self._scale(vix_ratio, lower=0.8, upper=1.7)
        normalized_spy = self._scale(-spy_return, lower=-0.05, upper=0.05)
        score = 0.7 * normalized_vix + 0.3 * normalized_spy

        rationale = (
            "VIX at {:.0f}% of 20-day average with 5-day SPY return {:.2%}.".format(
                vix_ratio * 100,
                spy_return,
            )
        )
        return FactorScore(
            name="Market Regime",
            score=score,
            rationale=rationale,
            details=context,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _normalize_history(symbol: str, history: pd.DataFrame) -> pd.DataFrame:
        """Normalize price history to a standard single-index column layout.

        Some price providers (notably yfinance) can return a MultiIndex where
        the first level contains the ticker symbol. This helper extracts the
        relevant slice so the rest of the analyzer can operate on a predictable
        OHLCV schema.
        """

        if history.empty:
            return history

        if isinstance(history.columns, pd.MultiIndex):
            try:
                history = history.xs(symbol, axis=1, level=0)
            except KeyError:
                # Fall back to the first level if the exact symbol is not present
                history = history.droplevel(0, axis=1)

        # Ensure the columns are simple strings (xs can return Index with name)
        history.columns = [str(col) for col in history.columns]
        return history

    @staticmethod
    def _average_true_range(history: pd.DataFrame, window: int) -> pd.Series:
        high_low = history["High"] - history["Low"]
        high_close = (history["High"] - history["Close"].shift()).abs()
        low_close = (history["Low"] - history["Close"].shift()).abs()
        true_range = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
        return true_range.rolling(window).mean()

    @staticmethod
    def _scale(value: float, *, lower: float, upper: float) -> float:
        if np.isnan(value):
            return 50.0
        if lower == upper:
            return 50.0
        normalized = (value - lower) / (upper - lower)
        normalized = max(0.0, min(1.0, normalized))
        return normalized * 100

    @staticmethod
    def _classify_score(score: float) -> str:
        if score >= 70:
            return "elevated_swing_risk"
        if score >= 55:
            return "watchlist"
        return "calm"


__all__ = [
    "SwingSignalAnalyzer",
    "SwingSignal",
    "FactorScore",
]
