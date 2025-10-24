"""
Earnings calendar fetcher for prioritizing stocks with upcoming earnings
"""
import yfinance as yf
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import pandas as pd


def get_earnings_dates(symbols: List[str]) -> Dict[str, Optional[datetime]]:
    """
    Fetch earnings dates for a list of symbols.

    Returns:
        Dict mapping symbol to next earnings datetime (or None if unavailable)
    """
    earnings_map = {}

    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            # Try earningsTimestamp first (most reliable)
            if 'earningsTimestamp' in info and info['earningsTimestamp']:
                earnings_ts = info['earningsTimestamp']
                earnings_map[symbol] = datetime.fromtimestamp(earnings_ts)
            # Fallback to calendar
            elif hasattr(ticker, 'calendar') and ticker.calendar:
                calendar = ticker.calendar
                if 'Earnings Date' in calendar and calendar['Earnings Date']:
                    dates = calendar['Earnings Date']
                    if isinstance(dates, list) and len(dates) > 0:
                        # Convert date to datetime
                        earnings_map[symbol] = datetime.combine(dates[0], datetime.min.time())
                    else:
                        earnings_map[symbol] = None
            else:
                earnings_map[symbol] = None

        except Exception as e:
            print(f"⚠️  Error fetching earnings for {symbol}: {e}")
            earnings_map[symbol] = None

    return earnings_map


def prioritize_by_earnings(
    symbols: List[str],
    earnings_window_days: int = 3,
    post_earnings_window_days: int = 2
) -> tuple[List[str], Dict[str, int]]:
    """
    Prioritize symbols by earnings proximity.

    Args:
        symbols: List of symbols to prioritize
        earnings_window_days: Days before earnings to prioritize (default 3)
        post_earnings_window_days: Days after earnings to check (default 2)

    Returns:
        Tuple of (prioritized_symbols, earnings_priority_map)
        earnings_priority_map maps symbol to priority score:
          - 100: Earnings in next 1 day
          - 75: Earnings in next 2 days
          - 50: Earnings in next 3 days
          - 25: Earnings in past 1-2 days (post-earnings play)
          - 0: No upcoming earnings
    """
    print(f"\n📅 Fetching earnings calendar for {len(symbols)} symbols...")

    earnings_dates = get_earnings_dates(symbols)
    now = datetime.now()

    priority_map = {}

    for symbol, earnings_date in earnings_dates.items():
        if earnings_date is None:
            priority_map[symbol] = 0
            continue

        days_until = (earnings_date - now).days

        # Upcoming earnings (priority by proximity)
        if 0 <= days_until <= 1:
            priority_map[symbol] = 100
            print(f"  🔥 {symbol}: Earnings TOMORROW ({earnings_date.strftime('%Y-%m-%d')})")
        elif days_until == 2:
            priority_map[symbol] = 75
            print(f"  🔥 {symbol}: Earnings in 2 days ({earnings_date.strftime('%Y-%m-%d')})")
        elif days_until <= earnings_window_days:
            priority_map[symbol] = 50
            print(f"  ⚡ {symbol}: Earnings in {days_until} days ({earnings_date.strftime('%Y-%m-%d')})")
        # Post-earnings (recent move potential)
        elif -post_earnings_window_days <= days_until < 0:
            priority_map[symbol] = 25
            print(f"  📊 {symbol}: Earnings {abs(days_until)} days ago (post-earnings)")
        else:
            priority_map[symbol] = 0

    # Sort symbols by priority (highest first)
    prioritized = sorted(symbols, key=lambda s: priority_map.get(s, 0), reverse=True)

    high_priority_count = sum(1 for p in priority_map.values() if p >= 50)
    print(f"✅ Found {high_priority_count} stocks with earnings in next {earnings_window_days} days")

    return prioritized, priority_map
