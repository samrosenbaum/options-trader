"""
Morning Brief Generator (7:00 AM)
Delivers pre-market intelligence to catch opportunities before market open
"""
import yfinance as yf
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import pytz

from src.scanner.unusual_activity import detect_unusual_options_activity
from src.scanner.earnings_calendar import prioritize_by_earnings
from src.scanner.catalyst_detector import detect_intraday_breakouts


def get_premarket_movers(
    symbols: List[str],
    min_move_pct: float = 2.0
) -> Dict[str, dict]:
    """
    Detect pre-market movers (stocks gapping up/down before open).

    Args:
        symbols: List of symbols to check
        min_move_pct: Minimum % gap to flag (default 2%)

    Returns:
        Dict mapping symbol to gap data:
        {
            'symbol': str,
            'gap_pct': float,
            'gap_direction': 'up' | 'down',
            'premarket_price': float,
            'previous_close': float,
            'volume': int
        }
    """
    print(f"\n🌅 Scanning for pre-market movers ({min_move_pct}%+ gaps)...")

    movers = {}

    # Get ET timezone for market hours check
    et = pytz.timezone('US/Eastern')
    now_et = datetime.now(et)

    # Only run before market open (before 9:30 AM ET)
    if now_et.hour >= 9 and now_et.minute >= 30 and now_et.hour < 16:
        print("  ⏰ Market already open - skipping pre-market scan")
        return movers

    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)

            # Get previous close
            hist = ticker.history(period='5d')
            if hist.empty or len(hist) < 2:
                continue

            previous_close = hist['Close'].iloc[-1]

            # Get pre-market price (current price before market open)
            info = ticker.info
            premarket_price = info.get('regularMarketPrice') or info.get('currentPrice')

            if not premarket_price:
                continue

            # Calculate gap
            gap_pct = ((premarket_price - previous_close) / previous_close) * 100

            if abs(gap_pct) >= min_move_pct:
                gap_direction = 'up' if gap_pct > 0 else 'down'

                movers[symbol] = {
                    'symbol': symbol,
                    'gap_pct': gap_pct,
                    'gap_direction': gap_direction,
                    'premarket_price': premarket_price,
                    'previous_close': previous_close,
                    'volume': info.get('volume', 0)
                }

                print(f"  🔥 {symbol}: {gap_pct:+.1f}% gap {gap_direction} (${previous_close:.2f} → ${premarket_price:.2f})")

        except Exception as e:
            # Silently skip errors
            pass

    if movers:
        print(f"✅ Found {len(movers)} pre-market movers")
    else:
        print("  No significant pre-market gaps detected")

    return movers


def generate_morning_brief(
    symbols: List[str],
    user_portfolio: Optional[Dict] = None
) -> Dict[str, any]:
    """
    Generate comprehensive morning brief for pre-market analysis.

    Args:
        symbols: List of symbols to analyze
        user_portfolio: Optional user portfolio data for personalized alerts

    Returns:
        Dict with:
        {
            'timestamp': datetime,
            'uoa_signals': Dict,
            'earnings_today': List,
            'premarket_movers': Dict,
            'watchlist': List[str],
            'portfolio_alerts': List,
            'market_conditions': Dict
        }
    """
    print("\n" + "="*60)
    print("🌅 GENERATING MORNING BRIEF")
    print("="*60)

    brief = {
        'timestamp': datetime.now(),
        'uoa_signals': {},
        'earnings_today': [],
        'premarket_movers': {},
        'watchlist': [],
        'portfolio_alerts': [],
        'market_conditions': {}
    }

    # 1. Unusual Options Activity (yesterday's smart money positioning)
    print("\n[1/4] Scanning for Unusual Options Activity...")
    brief['uoa_signals'] = detect_unusual_options_activity(symbols)

    # 2. Earnings Today
    print("\n[2/4] Checking earnings calendar...")
    _, earnings_priority = prioritize_by_earnings(symbols, earnings_window_days=0)
    brief['earnings_today'] = [
        symbol for symbol, priority in earnings_priority.items()
        if priority >= 75  # Earnings today or tomorrow
    ]

    # 3. Pre-market Movers
    print("\n[3/4] Scanning pre-market movers...")
    brief['premarket_movers'] = get_premarket_movers(symbols)

    # 4. Build Watchlist (combine all signals)
    print("\n[4/4] Building watchlist...")
    watchlist_set = set()

    # Add UOA symbols (smart money positioning)
    for symbol in brief['uoa_signals'].keys():
        watchlist_set.add(symbol)

    # Add earnings symbols
    for symbol in brief['earnings_today']:
        watchlist_set.add(symbol)

    # Add pre-market movers
    for symbol in brief['premarket_movers'].keys():
        watchlist_set.add(symbol)

    brief['watchlist'] = sorted(list(watchlist_set))

    # 5. Portfolio Alerts (if user has open positions)
    if user_portfolio and 'open_positions' in user_portfolio:
        for pos in user_portfolio['open_positions']:
            symbol = pos.get('symbol')
            expiration = pos.get('expiration')

            # Alert if position expires today or tomorrow
            if expiration:
                exp_date = datetime.fromisoformat(expiration.replace('Z', '+00:00'))
                days_until_exp = (exp_date - datetime.now()).days

                if days_until_exp <= 1:
                    brief['portfolio_alerts'].append({
                        'symbol': symbol,
                        'alert_type': 'expiration',
                        'message': f"{symbol} expires in {days_until_exp} day(s)",
                        'urgency': 'high' if days_until_exp == 0 else 'medium'
                    })

            # Alert if symbol has UOA (unusual activity on your holding)
            if symbol in brief['uoa_signals']:
                brief['portfolio_alerts'].append({
                    'symbol': symbol,
                    'alert_type': 'uoa_on_holding',
                    'message': f"Unusual options activity detected on your {symbol} position",
                    'urgency': 'high'
                })

    # 6. Market Conditions (SPY, QQQ levels)
    print("\n[5/5] Checking market conditions...")
    try:
        spy = yf.Ticker('SPY')
        spy_hist = spy.history(period='5d')
        if not spy_hist.empty:
            spy_close = spy_hist['Close'].iloc[-1]
            spy_ma20 = spy_hist['Close'].tail(20).mean() if len(spy_hist) >= 20 else spy_close

            brief['market_conditions']['SPY'] = {
                'price': spy_close,
                'ma20': spy_ma20,
                'trend': 'bullish' if spy_close > spy_ma20 else 'bearish'
            }

        qqq = yf.Ticker('QQQ')
        qqq_hist = qqq.history(period='5d')
        if not qqq_hist.empty:
            qqq_close = qqq_hist['Close'].iloc[-1]
            qqq_ma20 = qqq_hist['Close'].tail(20).mean() if len(qqq_hist) >= 20 else qqq_close

            brief['market_conditions']['QQQ'] = {
                'price': qqq_close,
                'ma20': qqq_ma20,
                'trend': 'bullish' if qqq_close > qqq_ma20 else 'bearish'
            }
    except Exception as e:
        print(f"⚠️  Could not fetch market conditions: {e}")

    print("\n" + "="*60)
    print("✅ MORNING BRIEF COMPLETE")
    print("="*60)

    return brief


def format_brief_for_display(brief: Dict) -> str:
    """
    Format morning brief as human-readable text for email/notification.

    Args:
        brief: Output from generate_morning_brief()

    Returns:
        Formatted string ready for display
    """
    output = []

    # Header
    output.append("=" * 60)
    output.append("MORNING BRIEF")
    output.append(f"Generated: {brief['timestamp'].strftime('%Y-%m-%d %I:%M %p')}")
    output.append("=" * 60)
    output.append("")
    output.append("HOW TO READ THIS BRIEF:")
    output.append("  [BULL] = Smart money betting stock goes UP (buy calls or stock)")
    output.append("  [BEAR] = Smart money betting stock goes DOWN (buy puts or avoid)")
    output.append("  UOA = Unusual Options Activity (big bets being placed)")
    output.append("  Vol/OI Ratio = How unusual the activity is (higher = stronger signal)")
    output.append("")

    # Market Conditions
    if brief['market_conditions']:
        output.append("MARKET CONDITIONS")
        for index, data in brief['market_conditions'].items():
            trend_indicator = "▲" if data['trend'] == 'bullish' else "▼"
            output.append(f"  {trend_indicator} {index}: ${data['price']:.2f} ({data['trend']})")
        output.append("")

    # Watchlist Summary
    if brief['watchlist']:
        watchlist_display = brief['watchlist'][:10]  # Show top 10
        output.append(f"TODAY'S WATCHLIST ({len(watchlist_display)} stocks)")
        for symbol in watchlist_display:
            reasons = []
            if symbol in brief['uoa_signals']:
                reasons.append("UOA")
            if symbol in brief['earnings_today']:
                reasons.append("Earnings")
            if symbol in brief['premarket_movers']:
                gap = brief['premarket_movers'][symbol]['gap_pct']
                reasons.append(f"{gap:+.1f}% gap")

            output.append(f"  • {symbol}: {', '.join(reasons)}")
        output.append("")

    # UOA Signals
    if brief['uoa_signals']:
        output.append(f"UNUSUAL OPTIONS ACTIVITY ({len(brief['uoa_signals'])} stocks)")
        output.append("  → These are stocks where smart money is placing big bets")
        output.append("")
        for symbol, data in list(brief['uoa_signals'].items())[:5]:  # Top 5
            # Calculate actual bias from volume
            call_volume = sum(s['volume'] for s in data['call_signals'])
            put_volume = sum(s['volume'] for s in data['put_signals'])

            # Determine bias indicator
            if call_volume > put_volume * 1.5:  # Calls dominate
                bias_indicator = "[BULL]"
                explanation = "→ Expect stock to go UP (heavy CALL buying)"
            elif put_volume > call_volume * 1.5:  # Puts dominate
                bias_indicator = "[BEAR]"
                explanation = "→ Expect stock to go DOWN (heavy PUT buying)"
            else:  # Mixed
                bias_indicator = "[MIXED]"
                explanation = "→ Mixed signals (both CALLS and PUTS active)"

            output.append(f"  {bias_indicator} {symbol} - {explanation}")
            output.append(f"     Call Volume: {call_volume:,} | Put Volume: {put_volume:,}")

            # Show top call and put if both exist
            if data['call_signals']:
                top_call = max(data['call_signals'], key=lambda x: x['vol_oi_ratio'])
                atm = " ATM" if top_call['is_atm'] else ""
                output.append(f"     Top CALL: ${top_call['strike']} - {top_call['volume']:,} vol / {top_call['oi']:,} OI = {top_call['vol_oi_ratio']:.1f}x{atm}")

            if data['put_signals']:
                top_put = max(data['put_signals'], key=lambda x: x['vol_oi_ratio'])
                atm = " ATM" if top_put['is_atm'] else ""
                output.append(f"     Top PUT: ${top_put['strike']} - {top_put['volume']:,} vol / {top_put['oi']:,} OI = {top_put['vol_oi_ratio']:.1f}x{atm}")

            output.append("")

    # Pre-market Movers
    if brief['premarket_movers']:
        output.append(f"PRE-MARKET MOVERS ({len(brief['premarket_movers'])} stocks)")
        output.append("  → Stocks moving before market open (news, earnings, etc)")
        output.append("")
        for symbol, data in list(brief['premarket_movers'].items())[:3]:  # Top 3
            direction_indicator = "▲" if data['gap_direction'] == 'up' else "▼"
            move_type = "GAPPING UP" if data['gap_direction'] == 'up' else "GAPPING DOWN"
            output.append(f"  {direction_indicator} {symbol}: {move_type} {abs(data['gap_pct']):.1f}%")
            output.append(f"     ${data['previous_close']:.2f} → ${data['premarket_price']:.2f}")
        output.append("")

    # Earnings Today
    if brief['earnings_today']:
        output.append(f"EARNINGS TODAY ({len(brief['earnings_today'])} stocks)")
        for symbol in brief['earnings_today'][:5]:
            output.append(f"  • {symbol}")
        output.append("")

    # Portfolio Alerts
    if brief['portfolio_alerts']:
        output.append(f"PORTFOLIO ALERTS ({len(brief['portfolio_alerts'])} alerts)")
        for alert in brief['portfolio_alerts']:
            urgency_indicator = "[HIGH]" if alert['urgency'] == 'high' else "[MED]"
            output.append(f"  {urgency_indicator} {alert['message']}")
        output.append("")

    output.append("=" * 60)
    output.append("Next Update: Market Open (9:35 AM)")
    output.append("=" * 60)

    return "\n".join(output)


# Example usage
if __name__ == "__main__":
    # Test with major tickers
    test_symbols = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
        'NVDA', 'META', 'NFLX', 'COIN', 'AMD'
    ]

    brief = generate_morning_brief(test_symbols)
    formatted = format_brief_for_display(brief)
    print(formatted)
