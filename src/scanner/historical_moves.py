"""Historical price movement analyzer for validating probability estimates.

This module analyzes actual historical price movements to provide empirical
probability data that complements the theoretical IV-based calculations.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd
import yfinance as yf
from scipy.stats import beta


@dataclass
class HistoricalMoveStats:
    """Statistics about historical price movements for a symbol."""

    symbol: str
    target_move_pct: float
    target_move_amount: Optional[float]
    timeframe_days: int
    occurrences: int
    close_occurrences: int
    total_periods: int
    empirical_probability: float
    close_probability: float
    touch_confidence_interval: Tuple[float, float]
    close_confidence_interval: Tuple[float, float]
    last_occurrence: Optional[datetime]
    last_close_occurrence: Optional[datetime]
    last_occurrence_days_to_target: Optional[int]
    last_close_occurrence_days_to_target: Optional[int]
    avg_days_to_target: Optional[float]
    data_start_date: datetime
    data_end_date: datetime
    quality_score: float
    quality_label: str
    recent_occurrence_samples: List[Tuple[datetime, int]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, any]:
        """Convert to dictionary for JSON serialization."""

        def _round_interval(interval: Tuple[float, float]) -> Dict[str, float]:
            return {
                "lower": round(interval[0], 2),
                "upper": round(interval[1], 2),
            }

        return {
            "symbol": self.symbol,
            "targetMovePct": self.target_move_pct,
            "targetMoveAmount": round(self.target_move_amount, 2) if self.target_move_amount is not None else None,
            "timeframeDays": self.timeframe_days,
            "occurrences": self.occurrences,
            "closeOccurrences": self.close_occurrences,
            "totalPeriods": self.total_periods,
            "empiricalProbability": round(self.empirical_probability, 2),
            "closeProbability": round(self.close_probability, 2),
            "touchConfidenceInterval": _round_interval(self.touch_confidence_interval),
            "closeConfidenceInterval": _round_interval(self.close_confidence_interval),
            "lastOccurrence": self.last_occurrence.isoformat() if self.last_occurrence else None,
            "lastCloseOccurrence": self.last_close_occurrence.isoformat() if self.last_close_occurrence else None,
            "lastOccurrenceDaysToTarget": self.last_occurrence_days_to_target,
            "lastCloseOccurrenceDaysToTarget": self.last_close_occurrence_days_to_target,
            "avgDaysToTarget": round(self.avg_days_to_target, 2) if self.avg_days_to_target else None,
            "dataStartDate": self.data_start_date.isoformat(),
            "dataEndDate": self.data_end_date.isoformat(),
            "qualityScore": round(self.quality_score, 1),
            "qualityLabel": self.quality_label,
            "recentOccurrences": [
                {
                    "date": occurrence.isoformat(),
                    "daysToTarget": days,
                }
                for occurrence, days in self.recent_occurrence_samples
            ],
        }


class HistoricalMoveAnalyzer:
    """Analyzes historical price movements to validate probability estimates."""

    def __init__(self, db_path: Optional[str] = None, lookback_days: int = 365):
        """Initialize the analyzer.

        Args:
            db_path: Path to SQLite database for caching historical data
            lookback_days: How many days of history to analyze (default 1 year)
        """
        self.lookback_days = lookback_days
        self.db_path = db_path
        self._cache: Dict[str, pd.DataFrame] = {}

        if db_path:
            self._init_db()

    def _init_db(self) -> None:
        """Initialize database schema for caching historical data."""
        if not self.db_path:
            return

        # Ensure parent directory exists
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)

        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS historical_prices (
                    symbol TEXT NOT NULL,
                    date TEXT NOT NULL,
                    open REAL NOT NULL,
                    high REAL NOT NULL,
                    low REAL NOT NULL,
                    close REAL NOT NULL,
                    volume INTEGER NOT NULL,
                    fetched_at TEXT NOT NULL,
                    PRIMARY KEY (symbol, date)
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_symbol_date
                ON historical_prices(symbol, date DESC)
            """)
            conn.commit()

    def _get_cached_data(self, symbol: str, start_date: datetime) -> Optional[pd.DataFrame]:
        """Retrieve cached price data from database."""
        if not self.db_path:
            return None

        try:
            with sqlite3.connect(self.db_path) as conn:
                query = """
                    SELECT date, open, high, low, close, volume
                    FROM historical_prices
                    WHERE symbol = ? AND date >= ?
                    ORDER BY date ASC
                """
                df = pd.read_sql_query(
                    query,
                    conn,
                    params=(symbol, start_date.strftime("%Y-%m-%d")),
                    parse_dates=["date"],
                )

                if df.empty:
                    return None

                # Check if cache is fresh (within last 24 hours for most recent date)
                most_recent = pd.to_datetime(df["date"].max())
                if datetime.now() - most_recent > timedelta(days=1):
                    return None  # Stale cache

                df.set_index("date", inplace=True)

                # Normalize column names to match yfinance format (capitalized)
                df.columns = [col.capitalize() for col in df.columns]

                return df

        except Exception as e:
            print(f"Warning: Error reading cache for {symbol}: {e}")
            return None

    def _cache_data(self, symbol: str, df: pd.DataFrame) -> None:
        """Store price data in database cache."""
        if not self.db_path or df.empty:
            return

        try:
            with sqlite3.connect(self.db_path) as conn:
                # Prepare data for insertion
                records = []
                fetched_at = datetime.now().isoformat()

                for date, row in df.iterrows():
                    records.append((
                        symbol,
                        date.strftime("%Y-%m-%d"),
                        float(row["Open"]),
                        float(row["High"]),
                        float(row["Low"]),
                        float(row["Close"]),
                        int(row["Volume"]),
                        fetched_at,
                    ))

                # Insert or replace
                conn.executemany("""
                    INSERT OR REPLACE INTO historical_prices
                    (symbol, date, open, high, low, close, volume, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, records)
                conn.commit()

        except Exception as e:
            print(f"Warning: Error caching data for {symbol}: {e}")

    def get_price_history(self, symbol: str) -> Optional[pd.DataFrame]:
        """Fetch historical price data for a symbol.

        Args:
            symbol: Stock ticker symbol

        Returns:
            DataFrame with OHLCV data indexed by date, or None if unavailable
        """
        # Check memory cache first
        if symbol in self._cache:
            return self._cache[symbol]

        start_date = datetime.now() - timedelta(days=self.lookback_days)

        # Check database cache
        cached_df = self._get_cached_data(symbol, start_date)
        if cached_df is not None:
            self._cache[symbol] = cached_df
            return cached_df

        # Fetch from yfinance
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=f"{self.lookback_days}d", auto_adjust=True)

            if df.empty:
                return None

            # Cache the data
            self._cache_data(symbol, df)
            self._cache[symbol] = df

            return df

        except Exception as e:
            print(f"Warning: Could not fetch price history for {symbol}: {e}")
            return None

    def analyze_move_probability(
        self,
        symbol: str,
        target_move_pct: float,
        timeframe_days: int,
        direction: str = "up",
        current_price: Optional[float] = None,
    ) -> Optional[HistoricalMoveStats]:
        """Analyze historical frequency of a specific price move.

        Args:
            symbol: Stock ticker symbol
            target_move_pct: Target move percentage (absolute value, e.g., 3.0 for 3%)
            timeframe_days: Number of days for the move to occur
            direction: "up" for bullish moves, "down" for bearish moves
            current_price: Optional current price to translate percentages to dollar moves

        Returns:
            HistoricalMoveStats with empirical probability data, or None if insufficient data
        """
        df = self.get_price_history(symbol)
        if df is None or len(df) < timeframe_days + 1:
            return None

        # Calculate rolling forward returns over the timeframe
        closes = df["Close"].values
        dates = df.index.to_pydatetime()

        occurrences = 0
        close_occurrences = 0
        occurrence_details: List[Tuple[datetime, int]] = []
        close_occurrence_details: List[Tuple[datetime, int]] = []
        days_to_target: List[float] = []

        # For each day, check if target move occurred within timeframe
        for i in range(len(closes) - timeframe_days):
            start_price = closes[i]
            future_prices = closes[i + 1 : i + 1 + timeframe_days]

            # Check each day in the window
            for days_ahead, future_price in enumerate(future_prices, start=1):
                move_pct = ((future_price - start_price) / start_price) * 100

                # Check if target move achieved in the correct direction
                target_achieved = False
                if direction == "up" and move_pct >= target_move_pct:
                    target_achieved = True
                elif direction == "down" and move_pct <= -target_move_pct:
                    target_achieved = True

                if target_achieved:
                    occurrences += 1
                    occurrence_details.append((dates[i + days_ahead], days_ahead))
                    days_to_target.append(days_ahead)
                    break  # Count once per rolling window

            closing_price = closes[i + timeframe_days]
            closing_move_pct = ((closing_price - start_price) / start_price) * 100
            finish_hit = False
            if direction == "up" and closing_move_pct >= target_move_pct:
                finish_hit = True
            elif direction == "down" and closing_move_pct <= -target_move_pct:
                finish_hit = True

            if finish_hit:
                close_occurrences += 1
                close_occurrence_details.append((dates[i + timeframe_days], timeframe_days))

        total_periods = len(closes) - timeframe_days
        if total_periods <= 0:
            return None

        prior_alpha = 0.5  # Jeffreys prior for binomial proportion
        prior_beta = 0.5

        touch_posterior_alpha = occurrences + prior_alpha
        touch_posterior_beta = (total_periods - occurrences) + prior_beta
        close_posterior_alpha = close_occurrences + prior_alpha
        close_posterior_beta = (total_periods - close_occurrences) + prior_beta

        empirical_probability = (touch_posterior_alpha / (touch_posterior_alpha + touch_posterior_beta)) * 100
        close_probability = (close_posterior_alpha / (close_posterior_alpha + close_posterior_beta)) * 100

        touch_ci = (
            beta.ppf(0.05, touch_posterior_alpha, touch_posterior_beta) * 100,
            beta.ppf(0.95, touch_posterior_alpha, touch_posterior_beta) * 100,
        )
        close_ci = (
            beta.ppf(0.05, close_posterior_alpha, close_posterior_beta) * 100,
            beta.ppf(0.95, close_posterior_alpha, close_posterior_beta) * 100,
        )

        last_occurrence_detail = (
            max(occurrence_details, key=lambda item: item[0]) if occurrence_details else None
        )
        last_occurrence = last_occurrence_detail[0] if last_occurrence_detail else None
        last_occurrence_days = last_occurrence_detail[1] if last_occurrence_detail else None

        last_close_detail = (
            max(close_occurrence_details, key=lambda item: item[0]) if close_occurrence_details else None
        )
        last_close_occurrence = last_close_detail[0] if last_close_detail else None
        last_close_days = last_close_detail[1] if last_close_detail else None

        recent_occurrence_samples = sorted(
            occurrence_details,
            key=lambda item: item[0],
            reverse=True,
        )[:3]
        avg_days = sum(days_to_target) / len(days_to_target) if days_to_target else None

        # Data quality weighting considers sample size and recency of data
        sample_factor = min(total_periods / 200, 1.0)
        recency_days = max((datetime.now() - dates[-1]).days, 0)
        recency_factor = max(0.0, 1 - (recency_days / 120))
        quality_score = (sample_factor * 0.6 + recency_factor * 0.4) * 100

        if total_periods < 40 or recency_days > 180:
            quality_label = "low"
        elif quality_score >= 70 and total_periods >= 120:
            quality_label = "high"
        else:
            quality_label = "medium"

        target_move_amount = None
        if current_price is not None:
            try:
                target_move_amount = abs(target_move_pct) / 100.0 * float(current_price)
            except Exception:
                target_move_amount = None

        return HistoricalMoveStats(
            symbol=symbol,
            target_move_pct=abs(target_move_pct),
            target_move_amount=target_move_amount,
            timeframe_days=timeframe_days,
            occurrences=occurrences,
            close_occurrences=close_occurrences,
            total_periods=total_periods,
            empirical_probability=empirical_probability,
            close_probability=close_probability,
            touch_confidence_interval=touch_ci,
            close_confidence_interval=close_ci,
            last_occurrence=last_occurrence,
            last_close_occurrence=last_close_occurrence,
            last_occurrence_days_to_target=last_occurrence_days,
            last_close_occurrence_days_to_target=last_close_days,
            avg_days_to_target=avg_days,
            data_start_date=dates[0],
            data_end_date=dates[-1],
            quality_score=quality_score,
            quality_label=quality_label,
            recent_occurrence_samples=recent_occurrence_samples,
        )

    def get_move_context(
        self,
        symbol: str,
        target_move_pct: float,
        timeframe_days: int,
        direction: str = "up",
        current_price: Optional[float] = None,
    ) -> Dict[str, any]:
        """Get human-readable context about a target move.

        Returns a dictionary with analysis text suitable for display in UI.
        """
        stats = self.analyze_move_probability(
            symbol,
            target_move_pct,
            timeframe_days,
            direction,
            current_price=current_price,
        )

        if stats is None:
            return {
                "available": False,
                "message": "Historical data unavailable for this symbol",
            }

        # Build human-readable analysis
        analysis_parts: List[str] = []

        move_direction_text = "gain" if direction == "up" else "drop"
        if stats.target_move_amount is not None:
            move_requirement_sentence = (
                f"Requires a ${abs(stats.target_move_amount):.2f} ({abs(target_move_pct):.1f}% {move_direction_text}) move "
                f"within {stats.timeframe_days} trading days to break even"
            )
        else:
            move_requirement_sentence = (
                f"Requires a {abs(target_move_pct):.1f}% {move_direction_text} within "
                f"{stats.timeframe_days} trading days to break even"
            )
        analysis_parts.append(move_requirement_sentence)

        touch_sentence = (
            f"Touched the {abs(target_move_pct):.1f}% breakeven move within {stats.timeframe_days}d in "
            f"{stats.empirical_probability:.1f}% of {stats.total_periods} similar periods "
            f"(95% CI {stats.touch_confidence_interval[0]:.1f}-{stats.touch_confidence_interval[1]:.1f}%)"
        )
        analysis_parts.append(touch_sentence)

        frequency_sentence = (
            f"Historical sample includes {stats.occurrences} touches and {stats.close_occurrences} full finishes "
            f"across {stats.total_periods} rolling windows"
        )
        analysis_parts.append(frequency_sentence)

        if stats.close_occurrences:
            finish_sentence = (
                f"Closed beyond breakeven by expiration in {stats.close_probability:.1f}% of periods "
                f"(95% CI {stats.close_confidence_interval[0]:.1f}-{stats.close_confidence_interval[1]:.1f}%)"
            )
        else:
            finish_sentence = (
                "No historical periods closed beyond breakeven by expiration; use touch probability for exit planning"
            )
        analysis_parts.append(finish_sentence)

        # Last occurrence details (touch)
        if stats.last_occurrence:
            now = datetime.now()
            last_occ = stats.last_occurrence.replace(tzinfo=None) if stats.last_occurrence.tzinfo else stats.last_occurrence
            days_ago = (now - last_occ).days
            if days_ago == 0:
                recency_text = "Last touch occurred today"
            elif days_ago == 1:
                recency_text = "Last touch occurred yesterday"
            elif days_ago < 7:
                recency_text = f"Last touch occurred {days_ago} days ago"
            elif days_ago < 30:
                weeks_ago = days_ago // 7
                recency_text = f"Last touch occurred {weeks_ago} week{'s' if weeks_ago > 1 else ''} ago"
            else:
                months_ago = days_ago // 30
                recency_text = f"Last touch occurred {months_ago} month{'s' if months_ago > 1 else ''} ago"
            if stats.last_occurrence_days_to_target is not None:
                recency_text += (
                    f" (took {stats.last_occurrence_days_to_target} trading day"
                    f"{'s' if stats.last_occurrence_days_to_target != 1 else ''} to reach breakeven)"
                )
            analysis_parts.append(recency_text)

        if stats.last_close_occurrence and stats.last_close_occurrence != stats.last_occurrence:
            now = datetime.now()
            last_close = (
                stats.last_close_occurrence.replace(tzinfo=None)
                if stats.last_close_occurrence.tzinfo
                else stats.last_close_occurrence
            )
            days_ago_close = (now - last_close).days
            if days_ago_close == 0:
                close_recency_text = "Last full expiration win occurred today"
            elif days_ago_close == 1:
                close_recency_text = "Last full expiration win occurred yesterday"
            elif days_ago_close < 7:
                close_recency_text = f"Last full expiration win occurred {days_ago_close} days ago"
            elif days_ago_close < 30:
                weeks_ago_close = days_ago_close // 7
                close_recency_text = (
                    f"Last full expiration win occurred {weeks_ago_close} week"
                    f"{'s' if weeks_ago_close > 1 else ''} ago"
                )
            else:
                months_ago_close = days_ago_close // 30
                close_recency_text = (
                    f"Last full expiration win occurred {months_ago_close} month"
                    f"{'s' if months_ago_close > 1 else ''} ago"
                )
            if stats.last_close_occurrence_days_to_target is not None:
                close_recency_text += (
                    f" (took {stats.last_close_occurrence_days_to_target} trading day"
                    f"{'s' if stats.last_close_occurrence_days_to_target != 1 else ''} to finish)"
                )
            analysis_parts.append(close_recency_text)

        # Average time to target (touch probability)
        if stats.avg_days_to_target:
            analysis_parts.append(f"Average {stats.avg_days_to_target:.1f} days to first touch")

        if stats.quality_label == "low":
            analysis_parts.append("Warning: limited or stale sample – treat estimates cautiously")

        return {
            "available": True,
            "empiricalProbability": stats.empirical_probability,
            "touchProbability": stats.empirical_probability,
            "finishProbability": stats.close_probability,
            "touchConfidence": {
                "lower": stats.touch_confidence_interval[0],
                "upper": stats.touch_confidence_interval[1],
            },
            "finishConfidence": {
                "lower": stats.close_confidence_interval[0],
                "upper": stats.close_confidence_interval[1],
            },
            "occurrences": stats.occurrences,
            "closeOccurrences": stats.close_occurrences,
            "totalPeriods": stats.total_periods,
            "lastOccurrence": stats.last_occurrence.isoformat() if stats.last_occurrence else None,
            "lastCloseOccurrence": stats.last_close_occurrence.isoformat() if stats.last_close_occurrence else None,
            "lastTouch": {
                "date": stats.last_occurrence.isoformat() if stats.last_occurrence else None,
                "daysToTarget": stats.last_occurrence_days_to_target,
            },
            "lastFinish": {
                "date": stats.last_close_occurrence.isoformat() if stats.last_close_occurrence else None,
                "daysToTarget": stats.last_close_occurrence_days_to_target,
            },
            "recentTouches": [
                {
                    "date": occurrence.isoformat(),
                    "daysToTarget": days,
                }
                for occurrence, days in stats.recent_occurrence_samples
            ],
            "avgDaysToTarget": stats.avg_days_to_target,
            "qualityScore": stats.quality_score,
            "qualityLabel": stats.quality_label,
            "moveRequirement": {
                "percent": stats.target_move_pct,
                "amount": stats.target_move_amount,
                "direction": direction,
                "timeframeDays": stats.timeframe_days,
            },
            "historicalFrequency": {
                "occurrences": stats.occurrences,
                "closeOccurrences": stats.close_occurrences,
                "totalPeriods": stats.total_periods,
                "touchProbability": stats.empirical_probability,
                "finishProbability": stats.close_probability,
            },
            "analysis": ". ".join(analysis_parts) + ".",
            "raw": stats.to_dict(),
        }
