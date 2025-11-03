"""Unusual Options Activity (UOA) detector.

Adds context about when the flow occurred so downstream brief generators can
decay confidence once catalysts have played out overnight.
"""
import yfinance as yf
from typing import Dict, List, Tuple
from datetime import datetime, timedelta, time

import pytz

from src.scanner.pricing import infer_option_pricing


ET_TZ = pytz.timezone("US/Eastern")


def _get_last_session_close(now_et: datetime) -> datetime:
    """Return the timestamp for the most recent regular-session close."""

    market_close_today = now_et.replace(hour=16, minute=0, second=0, microsecond=0)
    market_open_today = now_et.replace(hour=9, minute=30, second=0, microsecond=0)

    if now_et >= market_close_today:
        return market_close_today

    if now_et >= market_open_today:
        # During regular hours we treat the flow as "fresh" from today.
        return market_close_today

    # Pre-market: fall back to previous trading day's close (skip weekends).
    previous_day = now_et.date() - timedelta(days=1)
    while previous_day.weekday() >= 5:  # Saturday/Sunday
        previous_day -= timedelta(days=1)

    return ET_TZ.localize(datetime.combine(previous_day, time(16, 0)))


def _calculate_flow_age(now_et: datetime, session_close: datetime) -> float:
    """Return the age of the flow in hours (never negative)."""

    age_seconds = (now_et - session_close).total_seconds()
    return max(age_seconds / 3600, 0)


def _initial_confidence(age_hours: float) -> str:
    if age_hours <= 4:
        return "high"
    if age_hours <= 12:
        return "medium"
    return "low"


def detect_unusual_options_activity(
    symbols: List[str],
    min_vol_oi_ratio: float = 2.0,
    min_volume: int = 500
) -> Dict[str, dict]:
    """
    Detect unusual options activity that precedes big moves.

    Signals detected:
    - High volume/OI ratio (smart money buying before news)
    - Call sweeps near ATM
    - Unusual put buying (hedge unwinding or bearish positioning)

    Args:
        symbols: List of symbols to check
        min_vol_oi_ratio: Minimum volume/OI ratio to flag (default 2.0x)
        min_volume: Minimum volume to consider (default 500)

    Returns:
        Dict mapping symbol to unusual activity data
    """
    print(f"\n🎯 Scanning for unusual options activity (Vol/OI ≥ {min_vol_oi_ratio}x)...")

    unusual_activity = {}

    now_et = datetime.now(ET_TZ)
    session_close = _get_last_session_close(now_et)
    flow_age_hours = _calculate_flow_age(now_et, session_close)
    base_confidence = _initial_confidence(flow_age_hours)

    session_label = session_close.strftime("%a %b %d @ %I:%M %p ET")

    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)

            # Get stock price for ATM detection
            current_price = ticker.info.get('currentPrice', 0)
            if not current_price:
                continue

            # Get nearest expiration (most liquid)
            expirations = ticker.options
            if not expirations or len(expirations) == 0:
                continue

            nearest_exp = expirations[0]  # Closest expiration

            # Get option chain
            chain = ticker.option_chain(nearest_exp)
            calls = chain.calls
            puts = chain.puts

            # Detect unusual call activity
            call_signals = []
            if not calls.empty:
                # Filter: volume > min and vol/OI ratio > threshold
                calls['vol_oi_ratio'] = calls['volume'] / (calls['openInterest'] + 1)

                unusual_calls = calls[
                    (calls['volume'] >= min_volume) &
                    (calls['vol_oi_ratio'] >= min_vol_oi_ratio)
                ]

                for _, row in unusual_calls.iterrows():
                    pricing = infer_option_pricing(row)
                    if not pricing.is_actionable:
                        continue
                    # Check if near ATM (within 5%)
                    strike = row['strike']
                    is_atm = abs((strike - current_price) / current_price) <= 0.05

                    call_signals.append({
                        'type': 'call',
                        'strike': strike,
                        'volume': int(row['volume']),
                        'oi': int(row['openInterest']),
                        'vol_oi_ratio': float(row['vol_oi_ratio']),
                        'is_atm': is_atm,
                        'premium': pricing.price,
                        'premium_source': pricing.source,
                        'bid': pricing.bid,
                        'ask': pricing.ask,
                        'raw_last_price': pricing.last_trade,
                    })

            # Detect unusual put activity
            put_signals = []
            if not puts.empty:
                puts['vol_oi_ratio'] = puts['volume'] / (puts['openInterest'] + 1)

                unusual_puts = puts[
                    (puts['volume'] >= min_volume) &
                    (puts['vol_oi_ratio'] >= min_vol_oi_ratio)
                ]

                for _, row in unusual_puts.iterrows():
                    pricing = infer_option_pricing(row)
                    if not pricing.is_actionable:
                        continue
                    strike = row['strike']
                    is_atm = abs((strike - current_price) / current_price) <= 0.05

                    put_signals.append({
                        'type': 'put',
                        'strike': strike,
                        'volume': int(row['volume']),
                        'oi': int(row['openInterest']),
                        'vol_oi_ratio': float(row['vol_oi_ratio']),
                        'is_atm': is_atm,
                        'premium': pricing.price,
                        'premium_source': pricing.source,
                        'bid': pricing.bid,
                        'ask': pricing.ask,
                        'raw_last_price': pricing.last_trade,
                    })

            # If we found unusual activity, record it
            if call_signals or put_signals:
                # Determine bullish vs bearish bias
                call_volume = sum(s['volume'] for s in call_signals)
                put_volume = sum(s['volume'] for s in put_signals)

                bias = 'bullish' if call_volume > put_volume else 'bearish' if put_volume > call_volume else 'neutral'

                unusual_activity[symbol] = {
                    'symbol': symbol,
                    'current_price': current_price,
                    'expiration': nearest_exp,
                    'call_signals': call_signals,
                    'put_signals': put_signals,
                    'bias': bias,
                    'total_unusual_volume': call_volume + put_volume,
                    'data_timestamp': session_close.isoformat(),
                    'flow_session': session_label,
                    'age_hours': flow_age_hours,
                    'confidence': base_confidence,
                    'warnings': []
                }

                # Print top signal
                top_signals = sorted(
                    call_signals + put_signals,
                    key=lambda x: x['vol_oi_ratio'],
                    reverse=True
                )[:2]

                for sig in top_signals:
                    atm_marker = "ATM" if sig['is_atm'] else ""
                    print(f"  🔥 {symbol} ${sig['strike']} {sig['type'].upper()}: {sig['volume']:,} vol / {sig['oi']:,} OI = {sig['vol_oi_ratio']:.1f}x {atm_marker}")

        except Exception as e:
            # Silently skip errors
            pass

    if unusual_activity:
        print(f"✅ Found unusual activity in {len(unusual_activity)} symbols")
    else:
        print("  No unusual options activity detected")

    return unusual_activity


def prioritize_by_unusual_activity(
    symbols: List[str]
) -> Tuple[List[str], Dict[str, int]]:
    """
    Prioritize symbols by unusual options activity.

    Returns:
        Tuple of (prioritized_symbols, activity_priority_map)
        Priority scores:
          - 100: ATM call sweeps (bullish smart money)
          - 75: OTM call sweeps (very bullish)
          - 50: High vol/OI ratio
          - 25: Unusual put activity
          - 0: No unusual activity
    """
    unusual = detect_unusual_options_activity(symbols)

    priority_map = {symbol: 0 for symbol in symbols}

    for symbol, data in unusual.items():
        # Check for ATM call sweeps (strongest bullish signal)
        atm_calls = [s for s in data['call_signals'] if s['is_atm']]
        if atm_calls:
            priority_map[symbol] = 100
        # High ratio call sweeps
        elif data['call_signals'] and max(s['vol_oi_ratio'] for s in data['call_signals']) >= 3.0:
            priority_map[symbol] = 75
        # General unusual activity
        elif data['total_unusual_volume'] >= 1000:
            priority_map[symbol] = 50
        # Unusual puts (potential squeeze or hedge unwinding)
        elif data['put_signals']:
            priority_map[symbol] = 25

    prioritized = sorted(symbols, key=lambda s: priority_map[s], reverse=True)

    return prioritized, priority_map
