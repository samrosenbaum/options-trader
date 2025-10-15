"""
Rejection Tracker: Analyzes options that were filtered out to validate filter tuning.

This module logs rejected options and their rejection reasons, then tracks their
next-day performance to identify patterns of "good opportunities we missed" vs
"correctly filtered garbage".

Usage:
    from src.analysis.rejection_tracker import RejectionTracker

    tracker = RejectionTracker()

    # During scanning - log rejections
    tracker.log_rejection(
        symbol="AAPL",
        option_data=option_dict,
        rejection_reason="volume_too_low",
        filter_stage="liquidity"
    )

    # Next day - analyze what happened
    analysis = tracker.analyze_missed_opportunities()
"""

import json
import sqlite3
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any
import yfinance as yf


@dataclass
class RejectedOption:
    """An option that was filtered out by our scanner."""

    # Identification
    symbol: str
    strike: float
    expiration: str
    option_type: str  # "call" or "put"

    # Rejection details
    rejection_reason: str
    filter_stage: str  # "liquidity", "quality", "scoring", etc.
    rejected_at: datetime

    # Metrics at rejection time
    stock_price: float
    option_price: float
    volume: int
    open_interest: int
    implied_volatility: Optional[float]
    delta: Optional[float]

    # Optional scoring that was computed
    probability_score: Optional[float] = None
    risk_adjusted_score: Optional[float] = None
    quality_score: Optional[float] = None

    # Next-day tracking (populated later)
    next_day_price: Optional[float] = None
    price_change_percent: Optional[float] = None
    was_profitable: Optional[bool] = None


@dataclass
class MissedOpportunity:
    """A rejected option that turned out to be profitable."""

    option: RejectedOption
    profit_percent: float
    what_we_missed: str  # Human-readable description
    pattern_tags: List[str]  # e.g., ["low_volume_but_profitable", "under_threshold"]


class RejectionTracker:
    """Tracks rejected options and analyzes their performance."""

    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize rejection tracker.

        Args:
            db_path: Path to SQLite database. Defaults to data/rejection_tracker.db
        """
        if db_path is None:
            db_path = str(Path(__file__).parent.parent.parent / "data" / "rejection_tracker.db")

        self.db_path = db_path
        self._init_database()

    def _init_database(self) -> None:
        """Create database tables if they don't exist."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rejected_options (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                strike REAL NOT NULL,
                expiration TEXT NOT NULL,
                option_type TEXT NOT NULL,
                rejection_reason TEXT NOT NULL,
                filter_stage TEXT NOT NULL,
                rejected_at TEXT NOT NULL,
                stock_price REAL NOT NULL,
                option_price REAL NOT NULL,
                volume INTEGER NOT NULL,
                open_interest INTEGER NOT NULL,
                implied_volatility REAL,
                delta REAL,
                probability_score REAL,
                risk_adjusted_score REAL,
                quality_score REAL,
                next_day_price REAL,
                price_change_percent REAL,
                was_profitable INTEGER
            )
        """)

        # Index for fast lookups
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_rejected_at
            ON rejected_options(rejected_at)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_symbol_expiration
            ON rejected_options(symbol, expiration)
        """)

        conn.commit()
        conn.close()

    def log_rejection(
        self,
        symbol: str,
        option_data: Dict[str, Any],
        rejection_reason: str,
        filter_stage: str,
        scores: Optional[Dict[str, float]] = None
    ) -> None:
        """
        Log an option that was filtered out.

        Args:
            symbol: Stock symbol
            option_data: Dictionary with option details (strike, expiration, prices, greeks, etc.)
            rejection_reason: Why it was rejected (e.g., "volume_too_low", "quality_score_below_threshold")
            filter_stage: Which filter rejected it (e.g., "liquidity", "quality", "scoring")
            scores: Optional dict with probability_score, risk_adjusted_score, quality_score
        """
        rejected = RejectedOption(
            symbol=symbol,
            strike=option_data.get("strike", 0),
            expiration=option_data.get("expiration", ""),
            option_type=option_data.get("type", "call"),
            rejection_reason=rejection_reason,
            filter_stage=filter_stage,
            rejected_at=datetime.now(timezone.utc),
            stock_price=option_data.get("stock_price", 0),
            option_price=option_data.get("lastPrice", 0),
            volume=option_data.get("volume", 0),
            open_interest=option_data.get("openInterest", 0),
            implied_volatility=option_data.get("impliedVolatility"),
            delta=option_data.get("delta"),
            probability_score=scores.get("probability_score") if scores else None,
            risk_adjusted_score=scores.get("risk_adjusted_score") if scores else None,
            quality_score=scores.get("quality_score") if scores else None,
        )

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO rejected_options (
                symbol, strike, expiration, option_type,
                rejection_reason, filter_stage, rejected_at,
                stock_price, option_price, volume, open_interest,
                implied_volatility, delta,
                probability_score, risk_adjusted_score, quality_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            rejected.symbol, rejected.strike, rejected.expiration, rejected.option_type,
            rejected.rejection_reason, rejected.filter_stage, rejected.rejected_at.isoformat(),
            rejected.stock_price, rejected.option_price, rejected.volume, rejected.open_interest,
            rejected.implied_volatility, rejected.delta,
            rejected.probability_score, rejected.risk_adjusted_score, rejected.quality_score
        ))

        conn.commit()
        conn.close()

    def update_next_day_performance(self, days_ago: int = 1) -> int:
        """
        Fetch next-day prices for rejected options and update database.

        Args:
            days_ago: How many days back to analyze (default 1 for yesterday's rejections)

        Returns:
            Number of records updated
        """
        target_date = datetime.now(timezone.utc) - timedelta(days=days_ago)
        target_date_str = target_date.strftime("%Y-%m-%d")

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Get rejections from target date that haven't been updated yet
        cursor.execute("""
            SELECT id, symbol, strike, expiration, option_type, option_price
            FROM rejected_options
            WHERE DATE(rejected_at) = ?
            AND next_day_price IS NULL
        """, (target_date_str,))

        rows = cursor.fetchall()
        updated = 0

        for row in rows:
            option_id, symbol, strike, expiration, option_type, original_price = row

            try:
                # Fetch current option price
                ticker = yf.Ticker(symbol)
                exp_date = datetime.strptime(expiration, "%Y-%m-%d").strftime("%Y-%m-%d")

                if option_type.lower() == "call":
                    chain = ticker.option_chain(exp_date).calls
                else:
                    chain = ticker.option_chain(exp_date).puts

                # Find matching strike
                option_row = chain[chain["strike"] == strike]

                if not option_row.empty:
                    current_price = float(option_row.iloc[0]["lastPrice"])
                    price_change = ((current_price - original_price) / original_price) * 100
                    is_profitable = price_change > 0

                    cursor.execute("""
                        UPDATE rejected_options
                        SET next_day_price = ?,
                            price_change_percent = ?,
                            was_profitable = ?
                        WHERE id = ?
                    """, (current_price, price_change, 1 if is_profitable else 0, option_id))

                    updated += 1

            except Exception as e:
                # Skip if option data unavailable (expired, delisted, etc.)
                print(f"Could not fetch next-day price for {symbol} {strike} {option_type}: {e}")
                continue

        conn.commit()
        conn.close()

        return updated

    def analyze_missed_opportunities(
        self,
        days_back: int = 7,
        min_profit_percent: float = 10.0
    ) -> Dict[str, Any]:
        """
        Analyze rejected options that turned out to be profitable.

        Args:
            days_back: How many days of history to analyze
            min_profit_percent: Minimum profit % to count as "missed opportunity"

        Returns:
            Dictionary with analysis results
        """
        start_date = datetime.now(timezone.utc) - timedelta(days=days_back)

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Get profitable rejections
        cursor.execute("""
            SELECT *
            FROM rejected_options
            WHERE rejected_at >= ?
            AND was_profitable = 1
            AND price_change_percent >= ?
            ORDER BY price_change_percent DESC
        """, (start_date.isoformat(), min_profit_percent))

        profitable_rejections = cursor.fetchall()

        # Get all rejections for comparison
        cursor.execute("""
            SELECT COUNT(*) as total,
                   AVG(CASE WHEN was_profitable = 1 THEN 1 ELSE 0 END) as profitable_rate,
                   AVG(price_change_percent) as avg_change
            FROM rejected_options
            WHERE rejected_at >= ?
            AND next_day_price IS NOT NULL
        """, (start_date.isoformat(),))

        stats = cursor.fetchone()

        # Analyze rejection reasons
        cursor.execute("""
            SELECT rejection_reason,
                   COUNT(*) as count,
                   AVG(CASE WHEN was_profitable = 1 THEN 1 ELSE 0 END) as profitable_rate,
                   AVG(price_change_percent) as avg_change
            FROM rejected_options
            WHERE rejected_at >= ?
            AND next_day_price IS NOT NULL
            GROUP BY rejection_reason
            ORDER BY profitable_rate DESC
        """, (start_date.isoformat(),))

        reason_analysis = cursor.fetchall()

        conn.close()

        # Build missed opportunities list
        missed_opps = []
        for row in profitable_rejections:
            option = RejectedOption(
                symbol=row[1],
                strike=row[2],
                expiration=row[3],
                option_type=row[4],
                rejection_reason=row[5],
                filter_stage=row[6],
                rejected_at=datetime.fromisoformat(row[7]),
                stock_price=row[8],
                option_price=row[9],
                volume=row[10],
                open_interest=row[11],
                implied_volatility=row[12],
                delta=row[13],
                probability_score=row[14],
                risk_adjusted_score=row[15],
                quality_score=row[16],
                next_day_price=row[17],
                price_change_percent=row[18],
                was_profitable=bool(row[19])
            )

            # Generate pattern tags
            tags = []
            if option.volume < 20:
                tags.append("low_volume_but_profitable")
            if option.open_interest < 50:
                tags.append("low_oi_but_profitable")
            if option.quality_score and option.quality_score < 50:
                tags.append("low_quality_score_but_profitable")

            missed_opps.append(MissedOpportunity(
                option=option,
                profit_percent=option.price_change_percent,
                what_we_missed=f"{option.symbol} {option.option_type} ${option.strike} gained {option.price_change_percent:.1f}% but was rejected for: {option.rejection_reason}",
                pattern_tags=tags
            ))

        return {
            "total_rejections": stats[0] if stats else 0,
            "profitable_rejection_rate": stats[1] if stats else 0,
            "avg_price_change": stats[2] if stats else 0,
            "missed_opportunities": missed_opps,
            "rejection_reason_analysis": [
                {
                    "reason": r[0],
                    "count": r[1],
                    "profitable_rate": r[2],
                    "avg_change": r[3]
                }
                for r in reason_analysis
            ],
            "recommendations": self._generate_recommendations(reason_analysis)
        }

    def _generate_recommendations(self, reason_analysis: List[tuple]) -> List[str]:
        """Generate filter tuning recommendations based on rejection patterns."""
        recommendations = []

        for reason, count, profitable_rate, avg_change in reason_analysis:
            if profitable_rate > 0.6 and count > 5:  # >60% of rejections were profitable
                recommendations.append(
                    f"Consider relaxing '{reason}' filter - {profitable_rate*100:.0f}% of rejections "
                    f"were profitable with avg {avg_change:.1f}% gain ({count} samples)"
                )
            elif profitable_rate < 0.3 and count > 10:  # <30% profitable - good filter
                recommendations.append(
                    f"Filter '{reason}' is working well - only {profitable_rate*100:.0f}% of rejections "
                    f"were profitable ({count} samples)"
                )

        return recommendations


def print_analysis_report(analysis: Dict[str, Any]) -> None:
    """Print a human-readable analysis report."""

    print("\n" + "="*80)
    print("REJECTION TRACKER ANALYSIS")
    print("="*80)

    print(f"\n📊 Overall Statistics:")
    print(f"  Total Rejections Tracked: {analysis['total_rejections']}")
    print(f"  Profitable Rejection Rate: {analysis['profitable_rejection_rate']*100:.1f}%")
    print(f"  Avg Price Change (All): {analysis['avg_price_change']:.1f}%")

    print(f"\n💰 Missed Opportunities ({len(analysis['missed_opportunities'])} found):")
    for i, opp in enumerate(analysis['missed_opportunities'][:10], 1):  # Top 10
        print(f"\n  {i}. {opp.what_we_missed}")
        print(f"     Volume: {opp.option.volume}, OI: {opp.option.open_interest}")
        print(f"     Tags: {', '.join(opp.pattern_tags)}")

    print(f"\n🔍 Rejection Reason Analysis:")
    for reason_data in analysis['rejection_reason_analysis']:
        print(f"\n  {reason_data['reason']}:")
        print(f"    Count: {reason_data['count']}")
        print(f"    Profitable Rate: {reason_data['profitable_rate']*100:.1f}%")
        print(f"    Avg Change: {reason_data['avg_change']:.1f}%")

    if analysis['recommendations']:
        print(f"\n💡 Recommendations:")
        for rec in analysis['recommendations']:
            print(f"  • {rec}")

    print("\n" + "="*80)


if __name__ == "__main__":
    # Example usage
    tracker = RejectionTracker()

    # Update yesterday's rejections with next-day performance
    print("Updating next-day performance for yesterday's rejections...")
    updated = tracker.update_next_day_performance(days_ago=1)
    print(f"Updated {updated} records")

    # Analyze missed opportunities
    print("\nAnalyzing missed opportunities from past 7 days...")
    analysis = tracker.analyze_missed_opportunities(days_back=7, min_profit_percent=10.0)

    # Print report
    print_analysis_report(analysis)
