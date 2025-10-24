"""
Catalyst detection for catching big market movers early
Detects: analyst upgrades, unusual volume, intraday breakouts
"""
import yfinance as yf
from datetime import datetime, time as dt_time
from typing import Dict, List, Tuple
import pandas as pd


def detect_intraday_breakouts(
    symbols: List[str],
    min_move_pct: float = 3.0,
    min_volume_ratio: float = 1.5
) -> Dict[str, dict]:
    """
    Detect stocks breaking out intraday (catching analyst upgrades, news catalysts early).

    Args:
        symbols: List of symbols to check
        min_move_pct: Minimum % move from open to trigger (default 3%)
        min_volume_ratio: Minimum volume vs avg volume (default 1.5x)

    Returns:
        Dict mapping symbol to catalyst info:
        {
            'symbol': str,
            'move_pct': float,
            'volume_ratio': float,
            'catalyst_type': str ('intraday_breakout', 'high_volume', etc)
        }
    """
    print(f"\n🔍 Scanning for intraday breakouts ({min_move_pct}%+ moves)...")

    catalysts = {}
    now = datetime.now()
    market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)

    # Only run during market hours or shortly after open
    if now.hour < 9 or (now.hour == 9 and now.minute < 30):
        print("  ⏰ Market not open yet - skipping intraday scan")
        return catalysts

    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)

            # Get today's intraday data
            today_data = ticker.history(period='1d', interval='1m')
            if today_data.empty:
                continue

            # Get current price and open
            current_price = today_data['Close'].iloc[-1]
            open_price = today_data['Open'].iloc[0]

            # Calculate intraday move
            move_pct = ((current_price - open_price) / open_price) * 100

            # Check volume
            info = ticker.info
            current_volume = today_data['Volume'].sum()
            avg_volume = info.get('averageVolume', 0)

            volume_ratio = current_volume / avg_volume if avg_volume > 0 else 0

            # Detect breakout
            if abs(move_pct) >= min_move_pct:
                catalyst_type = 'intraday_breakout'

                # Enhanced detection - check if volume is unusually high
                if volume_ratio >= min_volume_ratio:
                    catalyst_type = 'high_volume_breakout'

                catalysts[symbol] = {
                    'symbol': symbol,
                    'move_pct': move_pct,
                    'volume_ratio': volume_ratio,
                    'catalyst_type': catalyst_type,
                    'current_price': current_price,
                    'open_price': open_price
                }

                print(f"  🔥 {symbol}: {move_pct:+.1f}% (Vol: {volume_ratio:.1f}x avg) - {catalyst_type}")

        except Exception as e:
            # Silently skip errors (don't spam console)
            pass

    if catalysts:
        print(f"✅ Found {len(catalysts)} intraday breakouts")
    else:
        print("  No significant intraday breakouts detected")

    return catalysts


def prioritize_by_catalysts(
    symbols: List[str],
    check_intraday: bool = True
) -> Tuple[List[str], Dict[str, int]]:
    """
    Prioritize symbols by detected catalysts (analyst upgrades, breakouts, etc).

    Returns:
        Tuple of (prioritized_symbols, catalyst_priority_map)
        Priority scores:
          - 100: High-volume intraday breakout (likely analyst upgrade/news)
          - 75: Intraday breakout
          - 50: High relative volume
          - 0: No catalyst detected
    """
    priority_map = {symbol: 0 for symbol in symbols}

    if check_intraday:
        catalysts = detect_intraday_breakouts(symbols)

        for symbol, data in catalysts.items():
            if data['catalyst_type'] == 'high_volume_breakout':
                priority_map[symbol] = 100
            elif data['catalyst_type'] == 'intraday_breakout':
                priority_map[symbol] = 75
            elif data['volume_ratio'] >= 2.0:
                priority_map[symbol] = 50

    # Sort by priority
    prioritized = sorted(symbols, key=lambda s: priority_map[s], reverse=True)

    return prioritized, priority_map
