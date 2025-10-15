#!/usr/bin/env python3
"""
Daily Rejection Analysis Script

This script analyzes options that were rejected by our filters to validate
filter tuning decisions and identify missed opportunities.

Usage:
    # Analyze yesterday's rejections
    python scripts/analyze_rejections.py

    # Analyze rejections from 3 days ago
    python scripts/analyze_rejections.py --days-ago 3

    # Analyze last 14 days
    python scripts/analyze_rejections.py --lookback 14

    # Set minimum profit threshold
    python scripts/analyze_rejections.py --min-profit 15.0
"""

import argparse
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.analysis.rejection_tracker import RejectionTracker, print_analysis_report


def main():
    parser = argparse.ArgumentParser(
        description="Analyze rejected options to validate filter tuning"
    )
    parser.add_argument(
        "--days-ago",
        type=int,
        default=1,
        help="How many days back to update next-day performance (default: 1 for yesterday)"
    )
    parser.add_argument(
        "--lookback",
        type=int,
        default=7,
        help="How many days of history to analyze (default: 7)"
    )
    parser.add_argument(
        "--min-profit",
        type=float,
        default=10.0,
        help="Minimum profit %% to count as missed opportunity (default: 10.0)"
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default=None,
        help="Path to rejection tracker database (default: data/rejection_tracker.db)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON instead of formatted report"
    )

    args = parser.parse_args()

    # Initialize tracker
    tracker = RejectionTracker(db_path=args.db_path)

    print("=" * 80)
    print("REJECTION TRACKER - FILTER OPTIMIZATION ANALYSIS")
    print("=" * 80)
    print()

    # Update next-day performance
    print(f"📊 Updating next-day performance for rejections from {args.days_ago} day(s) ago...")
    updated = tracker.update_next_day_performance(days_ago=args.days_ago)
    print(f"✅ Updated {updated} rejection records with next-day pricing\n")

    # Analyze missed opportunities
    print(f"🔍 Analyzing missed opportunities from past {args.lookback} days...")
    print(f"   (Minimum profit threshold: {args.min_profit}%)\n")

    analysis = tracker.analyze_missed_opportunities(
        days_back=args.lookback,
        min_profit_percent=args.min_profit
    )

    # Output results
    if args.json:
        import json
        # Convert MissedOpportunity objects to dicts for JSON serialization
        json_analysis = analysis.copy()
        json_analysis['missed_opportunities'] = [
            {
                'symbol': opp.option.symbol,
                'strike': opp.option.strike,
                'expiration': opp.option.expiration,
                'option_type': opp.option.option_type,
                'rejection_reason': opp.option.rejection_reason,
                'filter_stage': opp.option.filter_stage,
                'profit_percent': opp.profit_percent,
                'what_we_missed': opp.what_we_missed,
                'pattern_tags': opp.pattern_tags,
                'volume': opp.option.volume,
                'open_interest': opp.option.open_interest,
                'original_price': opp.option.option_price,
                'next_day_price': opp.option.next_day_price
            }
            for opp in analysis['missed_opportunities']
        ]
        print(json.dumps(json_analysis, indent=2, default=str))
    else:
        print_analysis_report(analysis)

    # Exit code based on recommendations
    if analysis['recommendations']:
        print("\n💡 Action required: Filter tuning recommendations available!")
        return 1  # Non-zero exit code to trigger alerts
    else:
        print("\n✅ No immediate filter tuning needed")
        return 0


if __name__ == "__main__":
    sys.exit(main())
