"""Historical price movement analyzer for validating probability estimates.

This module analyzes actual historical price movements to provide empirical
probability data that complements the theoretical IV-based calculations.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd
import yfinance as yf


@dataclass(slots=True)
class HistoricalMoveStats:
    """Statistics about historical price movements for a symbol."""

    symbol: str
    target_move_pct: float
    timeframe_days: int
    occurrences: int
    total_periods: int
    empirical_probability: float
    last_occurrence: Optional[datetime]
    avg_days_to_target: Optional[float]
    data_start_date: datetime
    data_end_date: datetime

    def to_dict(self) -> Dict[str, any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "symbol": self.symbol,
            "targetMovePct": self.target_move_pct,
            "timeframeDays": self.timeframe_days,
            "occurrences": self.occurrences,
            "totalPeriods": self.total_periods,
            "empiricalProbability": round(self.empirical_probability, 2),
            "lastOccurrence": self.last_occurrence.isoformat() if self.last_occurrence else None,
            "avgDaysToTarget": round(self.avg_days_to_target, 2) if self.avg_days_to_target else None,
            "dataStartDate": self.data_start_date.isoformat(),
            "dataEndDate": self.data_end_date.isoformat(),
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
    ) -> Optional[HistoricalMoveStats]:
        """Analyze historical frequency of a specific price move.

        Args:
            symbol: Stock ticker symbol
            target_move_pct: Target move percentage (absolute value, e.g., 3.0 for 3%)
            timeframe_days: Number of days for the move to occur
            direction: "up" for bullish moves, "down" for bearish moves

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
        occurrence_dates: List[datetime] = []
        days_to_target: List[float] = []

        # For each day, check if target move occurred within timeframe
        for i in range(len(closes) - timeframe_days):
            start_price = closes[i]
            future_prices = closes[i+1:i+1+timeframe_days]

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
                    occurrence_dates.append(dates[i])
                    days_to_target.append(days_ahead)
                    break  # Count once per rolling window

        total_periods = len(closes) - timeframe_days
        empirical_probability = (occurrences / total_periods * 100) if total_periods > 0 else 0.0

        last_occurrence = max(occurrence_dates) if occurrence_dates else None
        avg_days = sum(days_to_target) / len(days_to_target) if days_to_target else None

        return HistoricalMoveStats(
            symbol=symbol,
            target_move_pct=abs(target_move_pct),
            timeframe_days=timeframe_days,
            occurrences=occurrences,
            total_periods=total_periods,
            empirical_probability=empirical_probability,
            last_occurrence=last_occurrence,
            avg_days_to_target=avg_days,
            data_start_date=dates[0],
            data_end_date=dates[-1],
        )

    def get_move_context(
        self,
        symbol: str,
        target_move_pct: float,
        timeframe_days: int,
        direction: str = "up",
    ) -> Dict[str, any]:
        """Get human-readable context about a target move.

        Returns a dictionary with analysis text suitable for display in UI.
        """
        stats = self.analyze_move_probability(symbol, target_move_pct, timeframe_days, direction)

        if stats is None:
            return {
                "available": False,
                "message": "Historical data unavailable for this symbol",
            }

        # Build human-readable analysis
        analysis_parts = []

        # Frequency
        if stats.occurrences == 0:
            freq_text = f"No {abs(target_move_pct):.1f}% moves in past {self.lookback_days} days"
        elif stats.occurrences == 1:
            freq_text = f"Only happened once in past {self.lookback_days} days"
        else:
            # Convert to monthly frequency
            months = self.lookback_days / 30
            per_month = stats.occurrences / months
            freq_text = f"Happens ~{per_month:.1f}x per month ({stats.occurrences} times in {self.lookback_days} days)"

        analysis_parts.append(freq_text)

        # Last occurrence
        if stats.last_occurrence:
            # Make both timezone-naive for comparison
            now = datetime.now()
            last_occ = stats.last_occurrence.replace(tzinfo=None) if stats.last_occurrence.tzinfo else stats.last_occurrence
            days_ago = (now - last_occ).days
            if days_ago == 0:
                recency_text = "Last occurred today"
            elif days_ago == 1:
                recency_text = "Last occurred yesterday"
            elif days_ago < 7:
                recency_text = f"Last occurred {days_ago} days ago"
            elif days_ago < 30:
                weeks_ago = days_ago // 7
                recency_text = f"Last occurred {weeks_ago} week{'s' if weeks_ago > 1 else ''} ago"
            else:
                months_ago = days_ago // 30
                recency_text = f"Last occurred {months_ago} month{'s' if months_ago > 1 else ''} ago"

            analysis_parts.append(recency_text)

        # Average time to target
        if stats.avg_days_to_target:
            avg_text = f"Average {stats.avg_days_to_target:.1f} days to reach target"
            analysis_parts.append(avg_text)

        return {
            "available": True,
            "empiricalProbability": stats.empirical_probability,
            "occurrences": stats.occurrences,
            "totalPeriods": stats.total_periods,
            "lastOccurrence": stats.last_occurrence.isoformat() if stats.last_occurrence else None,
            "avgDaysToTarget": stats.avg_days_to_target,
            "analysis": ". ".join(analysis_parts) + ".",
            "raw": stats.to_dict(),
        }
