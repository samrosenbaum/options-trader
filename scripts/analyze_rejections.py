#!/usr/bin/env python3
"""
Analyze rejected options to determine if they became profitable.

This script is called ON-DEMAND from the Rejection Learning page,
NOT during regular scans, so it won't cause timeouts.
"""

import argparse
import json
import os
import sys
from dataclasses import asdict, is_dataclass
from datetime import datetime, timedelta, timezone

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.analysis.rejection_tracker import RejectionTracker


def _to_serializable(value):
    """Recursively convert dataclasses and datetimes to JSON-friendly types."""

    if is_dataclass(value):
        return _to_serializable(asdict(value))

    if isinstance(value, dict):
        return {key: _to_serializable(val) for key, val in value.items()}

    if isinstance(value, list):
        return [_to_serializable(item) for item in value]

    if isinstance(value, datetime):
        return value.isoformat()

    return value


def analyze_rejections(days_back: int = 7, min_profit_percent: float = 10.0):
    """
    Analyze rejected options and their performance.

    Args:
        days_back: How many days of history to analyze
        min_profit_percent: Minimum profit to count as missed opportunity
    """
    print(f"📊 Analyzing rejections from last {days_back} days...", file=sys.stderr)

    tracker = RejectionTracker()

    # Step 1: Update next-day prices for recent rejections
    print("🔄 Fetching latest option prices...", file=sys.stderr)
    total_updated = 0
    # Refresh recent history so the analysis window has price updates
    for days_ago in range(1, min(days_back, 14) + 1):
        updated = tracker.update_next_day_performance(days_ago=days_ago)
        total_updated += updated
    print(f"✅ Updated {total_updated} rejection records", file=sys.stderr)

    # Step 2: Analyze missed opportunities
    print("🔍 Analyzing missed opportunities...", file=sys.stderr)
    analysis = tracker.analyze_missed_opportunities(
        days_back=days_back,
        min_profit_percent=min_profit_percent
    )

    # Output as JSON for API consumption
    print(json.dumps(_to_serializable(analysis), indent=2))


def main():
    parser = argparse.ArgumentParser(description="Analyze rejected options performance")
    parser.add_argument(
        "--days-back",
        type=int,
        default=7,
        help="Number of days of history to analyze"
    )
    parser.add_argument(
        "--min-profit",
        type=float,
        default=10.0,
        help="Minimum profit percentage to count as missed opportunity"
    )

    args = parser.parse_args()

    analyze_rejections(
        days_back=args.days_back,
        min_profit_percent=args.min_profit
    )


if __name__ == "__main__":
    main()
