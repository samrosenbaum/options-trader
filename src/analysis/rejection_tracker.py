"""
Rejection Tracker: Analyzes options that were filtered out to validate filter tuning.

This module logs rejected options and their rejection reasons, then tracks their
next-day performance to identify patterns of "good opportunities we missed" vs
"correctly filtered garbage".

Now uses Supabase for permanent cloud storage instead of local SQLite.

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
import math
import os
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
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
    """Tracks rejected options and analyzes their performance using Supabase."""

    def __init__(self):
        """Initialize rejection tracker with Supabase connection."""
        try:
            from supabase import create_client, Client

            url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
            key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

            if not url or not key:
                raise ValueError(
                    "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and "
                    "SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) environment variables."
                )

            self.supabase: Client = create_client(url, key)
            self.table_name = "rejected_options"

        except ImportError:
            raise ImportError(
                "supabase package not installed. Run: pip install supabase"
            )

    @staticmethod
    def _safe_int(value, default=0):
        """Convert value to int, handling NaN and None."""
        if value is None:
            return default
        try:
            if math.isnan(float(value)):
                return default
            return int(float(value))
        except (ValueError, TypeError):
            return default

    @staticmethod
    def _safe_float(value, default=0.0):
        """Convert value to float, handling NaN and None."""
        if value is None:
            return default
        try:
            result = float(value)
            if math.isnan(result):
                return default
            return result
        except (ValueError, TypeError):
            return default

    def _build_rejection_record(
        self,
        symbol: str,
        option_data: Dict[str, Any],
        rejection_reason: str,
        filter_stage: str,
        scores: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """Build a rejection record dict (used for both single and batch logging)."""
        return {
            "symbol": symbol,
            "strike": self._safe_float(option_data.get("strike"), 0),
            "expiration": option_data.get("expiration", ""),
            "option_type": str(option_data.get("type", option_data.get("optionType", "call"))).lower(),
            "rejection_reason": rejection_reason,
            "filter_stage": filter_stage,
            "rejected_at": datetime.now(timezone.utc).isoformat(),
            "stock_price": self._safe_float(option_data.get("stock_price", option_data.get("stockPrice")), 0),
            "option_price": self._safe_float(option_data.get("lastPrice"), 0),
            "volume": self._safe_int(option_data.get("volume"), 0),
            "open_interest": self._safe_int(option_data.get("openInterest"), 0),
            "implied_volatility": self._safe_float(option_data.get("impliedVolatility")) if option_data.get("impliedVolatility") else None,
            "delta": self._safe_float(option_data.get("delta")) if option_data.get("delta") else None,
            "probability_score": scores.get("probability_score") if scores else None,
            "risk_adjusted_score": scores.get("risk_adjusted_score") if scores else None,
            "quality_score": scores.get("quality_score") if scores else None,
        }

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
        try:
            record = self._build_rejection_record(symbol, option_data, rejection_reason, filter_stage, scores)
            # Insert into Supabase
            self.supabase.table(self.table_name).insert(record).execute()

        except Exception as e:
            # Don't fail scanning if logging fails
            print(f"⚠️  Failed to log rejection to Supabase: {e}")

    def log_rejections_batch(self, rejections: List[Dict[str, Any]]) -> int:
        """
        Log multiple rejected options in a single batch operation (much faster).

        Args:
            rejections: List of dicts, each with:
                - symbol: str
                - option_data: Dict
                - rejection_reason: str
                - filter_stage: str
                - scores: Optional[Dict]

        Returns:
            Number of rejections successfully logged
        """
        if not rejections:
            return 0

        try:
            records = []
            for rej in rejections:
                try:
                    record = self._build_rejection_record(
                        rej["symbol"],
                        rej["option_data"],
                        rej["rejection_reason"],
                        rej["filter_stage"],
                        rej.get("scores")
                    )
                    records.append(record)
                except Exception as e:
                    print(f"⚠️  Failed to build rejection record for {rej.get('symbol', 'UNKNOWN')}: {e}")
                    continue

            if records:
                # Batch insert (much faster than individual inserts)
                self.supabase.table(self.table_name).insert(records).execute()
                return len(records)
            return 0

        except Exception as e:
            print(f"⚠️  Failed to batch log rejections to Supabase: {e}")
            return 0

    def update_next_day_performance(self, days_ago: int = 1) -> int:
        """
        Fetch next-day prices for rejected options and update database.

        Args:
            days_ago: How many days back to analyze (default 1 for yesterday's rejections)

        Returns:
            Number of records updated
        """
        try:
            target_date = datetime.now(timezone.utc) - timedelta(days=days_ago)
            target_date_start = target_date.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            target_date_end = target_date.replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()

            # Get rejections from target date that haven't been updated yet
            response = self.supabase.table(self.table_name).select("*").gte(
                "rejected_at", target_date_start
            ).lte(
                "rejected_at", target_date_end
            ).is_(
                "next_day_price", "null"
            ).execute()

            rows = response.data
            updated = 0

            for row in rows:
                record_id = row["id"]
                symbol = row["symbol"]
                strike = row["strike"]
                expiration = row["expiration"]
                option_type = row["option_type"]
                original_price = row["option_price"]

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

                        # Update record in Supabase
                        self.supabase.table(self.table_name).update({
                            "next_day_price": current_price,
                            "price_change_percent": price_change,
                            "was_profitable": is_profitable
                        }).eq("id", record_id).execute()

                        updated += 1

                except Exception as e:
                    # Skip if option data unavailable (expired, delisted, etc.)
                    print(f"Could not fetch next-day price for {symbol} {strike} {option_type}: {e}")
                    continue

            return updated

        except Exception as e:
            print(f"Error updating next-day performance: {e}")
            return 0

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
        try:
            start_date = datetime.now(timezone.utc) - timedelta(days=days_back)

            # Get profitable rejections
            profitable_response = self.supabase.table(self.table_name).select("*").gte(
                "rejected_at", start_date.isoformat()
            ).eq(
                "was_profitable", True
            ).gte(
                "price_change_percent", min_profit_percent
            ).order(
                "price_change_percent", desc=True
            ).execute()

            profitable_rejections = profitable_response.data

            # Get all rejections for comparison
            stats_response = self.supabase.rpc(
                "get_rejection_stats",
                {"start_date": start_date.isoformat()}
            ).execute()

            # Fallback if RPC doesn't exist - calculate manually
            all_response = self.supabase.table(self.table_name).select("*").gte(
                "rejected_at", start_date.isoformat()
            ).not_.is_(
                "next_day_price", "null"
            ).execute()

            all_rejections = all_response.data
            total = len(all_rejections)
            profitable_count = len([r for r in all_rejections if r.get("was_profitable")])
            profitable_rate = profitable_count / total if total > 0 else 0
            avg_change = sum(r.get("price_change_percent", 0) for r in all_rejections) / total if total > 0 else 0

            # Analyze rejection reasons
            reason_stats = {}
            for row in all_rejections:
                reason = row["rejection_reason"]
                if reason not in reason_stats:
                    reason_stats[reason] = {
                        "count": 0,
                        "profitable_count": 0,
                        "total_change": 0
                    }
                reason_stats[reason]["count"] += 1
                if row.get("was_profitable"):
                    reason_stats[reason]["profitable_count"] += 1
                reason_stats[reason]["total_change"] += row.get("price_change_percent", 0)

            reason_analysis = []
            for reason, stats in reason_stats.items():
                count = stats["count"]
                profitable_rate_reason = stats["profitable_count"] / count if count > 0 else 0
                avg_change_reason = stats["total_change"] / count if count > 0 else 0
                reason_analysis.append((reason, count, profitable_rate_reason, avg_change_reason))

            reason_analysis.sort(key=lambda x: x[2], reverse=True)

            # Build missed opportunities list
            missed_opps = []
            for row in profitable_rejections:
                option = RejectedOption(
                    symbol=row["symbol"],
                    strike=row["strike"],
                    expiration=row["expiration"],
                    option_type=row["option_type"],
                    rejection_reason=row["rejection_reason"],
                    filter_stage=row["filter_stage"],
                    rejected_at=datetime.fromisoformat(row["rejected_at"]),
                    stock_price=row["stock_price"],
                    option_price=row["option_price"],
                    volume=row["volume"],
                    open_interest=row["open_interest"],
                    implied_volatility=row.get("implied_volatility"),
                    delta=row.get("delta"),
                    probability_score=row.get("probability_score"),
                    risk_adjusted_score=row.get("risk_adjusted_score"),
                    quality_score=row.get("quality_score"),
                    next_day_price=row.get("next_day_price"),
                    price_change_percent=row.get("price_change_percent"),
                    was_profitable=row.get("was_profitable")
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
                "total_rejections": total,
                "profitable_rejection_rate": profitable_rate,
                "avg_price_change": avg_change,
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

        except Exception as e:
            print(f"Error analyzing missed opportunities: {e}")
            return {
                "total_rejections": 0,
                "profitable_rejection_rate": 0,
                "avg_price_change": 0,
                "missed_opportunities": [],
                "rejection_reason_analysis": [],
                "recommendations": []
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
        print(f"     Tags: {', '.join(opp.pattern_tags) if opp.pattern_tags else 'none'}")

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
