"""
Nightly Brief (8:00 PM)
Tomorrow's battle plan - actionable watchlist for next trading day
"""
import yfinance as yf
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import pandas as pd

from src.scanner.unusual_activity import detect_unusual_options_activity
from src.scanner.earnings_calendar import get_earnings_dates


def analyze_key_levels(symbol: str) -> Dict[str, float]:
    """
    Calculate key support/resistance levels for a stock.

    Args:
        symbol: Stock symbol

    Returns:
        Dict with support, resistance, and moving averages
    """
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period='30d')

        if hist.empty:
            return {}

        current_price = hist['Close'].iloc[-1]

        # Calculate moving averages
        ma20 = hist['Close'].tail(20).mean() if len(hist) >= 20 else current_price
        ma50 = hist['Close'].tail(50).mean() if len(hist) >= 50 else current_price

        # Find recent high/low (last 20 days)
        recent_high = hist['High'].tail(20).max()
        recent_low = hist['Low'].tail(20).min()

        # Determine key levels
        resistance = recent_high
        support = max(ma20, recent_low)  # Use MA20 or recent low, whichever is higher

        return {
            'current_price': current_price,
            'support': support,
            'resistance': resistance,
            'ma20': ma20,
            'ma50': ma50,
            'trend': 'bullish' if current_price > ma20 else 'bearish'
        }

    except Exception as e:
        return {}


def get_portfolio_risk_summary(user_portfolio: Optional[Dict]) -> Dict:
    """
    Calculate portfolio risk exposure and upcoming expirations.

    Args:
        user_portfolio: User's portfolio data

    Returns:
        Dict with risk metrics
    """
    if not user_portfolio or 'open_positions' not in user_portfolio:
        return {
            'total_positions': 0,
            'total_capital_at_risk': 0,
            'expiring_soon': [],
            'risk_exposure_pct': 0
        }

    positions = user_portfolio['open_positions']
    total_capital = user_portfolio.get('total_capital', 10000)

    # Calculate risk
    total_at_risk = sum(
        pos.get('entry_price', 0) * pos.get('contracts', 1) * 100
        for pos in positions
    )

    risk_exposure_pct = (total_at_risk / total_capital) * 100 if total_capital > 0 else 0

    # Find positions expiring soon (within 3 days)
    expiring_soon = []
    for pos in positions:
        if 'expiration' in pos:
            exp_date = datetime.fromisoformat(pos['expiration'].replace('Z', '+00:00'))
            days_until = (exp_date - datetime.now()).days

            if days_until <= 3:
                expiring_soon.append({
                    'symbol': pos.get('symbol'),
                    'strike': pos.get('strike'),
                    'option_type': pos.get('option_type'),
                    'days_until_expiration': days_until,
                    'entry_price': pos.get('entry_price'),
                    'current_pl_pct': pos.get('unrealized_pl_percent', 0)
                })

    # Sort by days until expiration
    expiring_soon.sort(key=lambda x: x['days_until_expiration'])

    return {
        'total_positions': len(positions),
        'total_capital_at_risk': total_at_risk,
        'expiring_soon': expiring_soon,
        'risk_exposure_pct': risk_exposure_pct
    }


def generate_nightly_brief(
    symbols: List[str],
    user_portfolio: Optional[Dict] = None
) -> Dict[str, any]:
    """
    Generate nightly brief for tomorrow's trading session.

    Args:
        symbols: Universe of symbols to scan
        user_portfolio: Optional user portfolio for personalized alerts

    Returns:
        Dict with:
        {
            'timestamp': datetime,
            'tomorrows_watchlist': List[Dict],
            'earnings_tomorrow': List[Dict],
            'market_levels': Dict,
            'portfolio_summary': Dict,
            'key_setups': List[Dict]
        }
    """
    print("\n" + "="*60)
    print("🌙 GENERATING NIGHTLY BRIEF")
    print("="*60)

    brief = {
        'timestamp': datetime.now(),
        'tomorrows_watchlist': [],
        'earnings_tomorrow': [],
        'market_levels': {},
        'portfolio_summary': {},
        'key_setups': []
    }

    # 1. Detect UOA from today (could move tomorrow)
    print("\n[1/5] Scanning for unusual options activity...")
    uoa_signals = detect_unusual_options_activity(symbols, min_vol_oi_ratio=2.5)

    # Build watchlist from UOA
    for symbol, data in uoa_signals.items():
        # Get key levels for tomorrow
        levels = analyze_key_levels(symbol)

        if levels:
            all_signals = data['call_signals'] + data['put_signals']
            top_signal = max(all_signals, key=lambda x: x['vol_oi_ratio']) if all_signals else None

            setup_description = f"Keep an eye out for this to {'keep going up' if data['bias'] == 'bullish' else 'start dropping'}"
            if levels['current_price'] > levels['resistance'] * 0.98:
                setup_description = "Near top price - could push even higher if it breaks through"
            elif levels['current_price'] < levels['support'] * 1.02:
                setup_description = "Near important price - watch for it to either bounce back up or fall through"

            brief['tomorrows_watchlist'].append({
                'symbol': symbol,
                'reason': 'UOA',
                'bias': data['bias'],
                'current_price': levels['current_price'],
                'key_level': levels['resistance'] if data['bias'] == 'bullish' else levels['support'],
                'setup': setup_description,
                'uoa_details': {
                    'top_strike': top_signal['strike'] if top_signal else None,
                    'vol_oi_ratio': top_signal['vol_oi_ratio'] if top_signal else 0,
                    'type': top_signal['type'] if top_signal else None
                }
            })

    # 2. Check earnings tomorrow
    print("\n[2/5] Checking tomorrow's earnings...")
    earnings_dates = get_earnings_dates(symbols)
    tomorrow = datetime.now() + timedelta(days=1)

    for symbol, earnings_date in earnings_dates.items():
        if earnings_date:
            days_until = (earnings_date - datetime.now()).days

            if days_until == 1:  # Earnings tomorrow
                levels = analyze_key_levels(symbol)

                brief['earnings_tomorrow'].append({
                    'symbol': symbol,
                    'current_price': levels.get('current_price', 0),
                    'ma20': levels.get('ma20', 0),
                    'trend': levels.get('trend', 'unknown')
                })

                # Add to watchlist if not already there
                if symbol not in [w['symbol'] for w in brief['tomorrows_watchlist']]:
                    brief['tomorrows_watchlist'].append({
                        'symbol': symbol,
                        'reason': 'Earnings Tomorrow',
                        'bias': 'neutral',
                        'current_price': levels.get('current_price', 0),
                        'key_level': levels.get('ma20', 0),
                        'setup': 'Earnings play - high IV',
                        'uoa_details': None
                    })

    # 3. Market levels (SPY, QQQ)
    print("\n[3/5] Analyzing market conditions...")
    for index in ['SPY', 'QQQ']:
        levels = analyze_key_levels(index)
        if levels:
            brief['market_levels'][index] = levels

    # 4. Portfolio summary
    print("\n[4/5] Analyzing portfolio...")
    brief['portfolio_summary'] = get_portfolio_risk_summary(user_portfolio)

    # 5. Identify key setups (highest conviction plays)
    print("\n[5/5] Identifying key setups...")

    # High conviction = UOA + near key level + bullish trend
    for watchlist_item in brief['tomorrows_watchlist']:
        if watchlist_item['reason'] == 'UOA' and watchlist_item['uoa_details']:
            uoa = watchlist_item['uoa_details']

            # High conviction if:
            # - Vol/OI ratio > 3.0x (very unusual)
            # - At key level
            # - Bullish bias
            if uoa['vol_oi_ratio'] >= 3.0:
                brief['key_setups'].append({
                    'symbol': watchlist_item['symbol'],
                    'conviction': 'HIGH',
                    'setup': watchlist_item['setup'],
                    'bias': watchlist_item['bias'],
                    'reason': f"Strong UOA ({uoa['vol_oi_ratio']:.1f}x vol/OI)",
                    'key_level': watchlist_item['key_level']
                })

    # Sort watchlist by priority (UOA > Earnings > Other)
    priority_order = {'UOA': 3, 'Earnings Tomorrow': 2}
    brief['tomorrows_watchlist'].sort(
        key=lambda x: priority_order.get(x['reason'], 1),
        reverse=True
    )

    print("\n" + "="*60)
    print("✅ NIGHTLY BRIEF COMPLETE")
    print("="*60)

    return brief


def format_nightly_brief(brief: Dict) -> str:
    """
    Format nightly brief as human-readable text.

    Args:
        brief: Output from generate_nightly_brief()

    Returns:
        Formatted string
    """
    output = []

    # Header
    output.append("=" * 60)
    output.append("NIGHTLY BRIEF - TOMORROW'S BATTLE PLAN")
    output.append(f"Generated: {brief['timestamp'].strftime('%Y-%m-%d %I:%M %p')}")
    output.append("=" * 60)
    output.append("")
    output.append("WHAT TO EXPECT TOMORROW:")
    output.append("  [BULL] = Stock likely to go UP (consider buying)")
    output.append("  [BEAR] = Stock likely to go DOWN (avoid or short)")
    output.append("  Important Price = Price to watch - if it goes above or below this, big move likely")
    output.append("  HIGH CONVICTION = Our strongest predictions (we're 80%+ confident based on past patterns)")
    output.append("")

    # Key Setups (highest conviction)
    if brief['key_setups']:
        output.append(f"KEY SETUPS ({len(brief['key_setups'])} high-conviction plays)")
        output.append("  → These are our BEST predictions for tomorrow")
        output.append("")
        for setup in brief['key_setups'][:3]:
            bias_indicator = "[BULL]" if setup['bias'] == 'bullish' else "[BEAR]" if setup['bias'] == 'bearish' else "[NEUT]"

            # Add plain English action
            if setup['bias'] == 'bullish':
                action = "→ ACTION: Watch for entry to BUY"
            elif setup['bias'] == 'bearish':
                action = "→ ACTION: AVOID or consider shorting"
            else:
                action = "→ ACTION: Wait for clearer signal"

            output.append(f"  {bias_indicator} {setup['symbol']} - {setup['conviction']} CONVICTION")
            output.append(f"     {action}")
            output.append(f"     {setup['setup']}")
            output.append(f"     Important Price: ${setup['key_level']:.2f}")
            output.append(f"     Why: {setup['reason']}")
            output.append("")

    # Tomorrow's Watchlist
    if brief['tomorrows_watchlist']:
        output.append(f"TOMORROW'S WATCHLIST ({len(brief['tomorrows_watchlist'])} stocks)")
        for item in brief['tomorrows_watchlist'][:5]:
            bias_indicator = "[BULL]" if item['bias'] == 'bullish' else "[BEAR]" if item['bias'] == 'bearish' else "[NEUT]"
            output.append(f"  {bias_indicator} {item['symbol']} - {item['reason']}")
            output.append(f"     ${item['current_price']:.2f} -> {item['setup']}")

            if item['uoa_details']:
                uoa = item['uoa_details']
                output.append(f"     UOA: ${uoa['top_strike']} {uoa['type'].upper()} ({uoa['vol_oi_ratio']:.1f}x)")
            output.append("")

    # Earnings Tomorrow
    if brief['earnings_tomorrow']:
        output.append(f"EARNINGS TOMORROW ({len(brief['earnings_tomorrow'])} stocks)")
        for item in brief['earnings_tomorrow']:
            trend_indicator = "▲" if item['trend'] == 'bullish' else "▼"
            output.append(f"  {trend_indicator} {item['symbol']}: ${item['current_price']:.2f} ({item['trend']})")
        output.append("")

    # Market Levels
    if brief['market_levels']:
        output.append("MARKET SETUP")
        for index, levels in brief['market_levels'].items():
            trend_indicator = "▲" if levels['trend'] == 'bullish' else "▼"
            output.append(f"  {trend_indicator} {index}: ${levels['current_price']:.2f}")
            output.append(f"     Price floor: ${levels['support']:.2f} | Price ceiling: ${levels['resistance']:.2f}")
        output.append("")

    # Portfolio Summary
    if brief['portfolio_summary'] and brief['portfolio_summary']['total_positions'] > 0:
        summary = brief['portfolio_summary']
        output.append("PORTFOLIO CHECK")
        output.append(f"  • {summary['total_positions']} open positions")
        output.append(f"  • ${summary['total_capital_at_risk']:.0f} at risk ({summary['risk_exposure_pct']:.1f}% of capital)")

        if summary['expiring_soon']:
            output.append(f"\n  [ALERT] {len(summary['expiring_soon'])} positions expiring soon:")
            for pos in summary['expiring_soon'][:3]:
                pl_indicator = "▲" if pos['current_pl_pct'] > 0 else "▼"
                output.append(f"     {pl_indicator} {pos['symbol']} ${pos['strike']} {pos['option_type'].upper()} - {pos['days_until_expiration']}d left ({pos['current_pl_pct']:+.1f}%)")
        output.append("")

    output.append("=" * 60)
    output.append("Tomorrow: Morning Brief at 7:00 AM")
    output.append("Change your brief preferences anytime in Settings")
    output.append("=" * 60)

    return "\n".join(output)


# Example usage
if __name__ == "__main__":
    # Test with major tickers
    test_symbols = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
        'NVDA', 'META', 'NFLX', 'COIN', 'AMD'
    ]

    # Test portfolio
    test_portfolio = {
        'total_capital': 10000,
        'open_positions': [
            {
                'symbol': 'AAPL',
                'strike': 230,
                'option_type': 'call',
                'expiration': (datetime.now() + timedelta(days=2)).isoformat(),
                'entry_price': 3.50,
                'contracts': 2,
                'unrealized_pl_percent': 15.2
            },
            {
                'symbol': 'TSLA',
                'strike': 350,
                'option_type': 'put',
                'expiration': (datetime.now() + timedelta(days=1)).isoformat(),
                'entry_price': 8.20,
                'contracts': 1,
                'unrealized_pl_percent': -12.5
            }
        ]
    }

    brief = generate_nightly_brief(test_symbols, test_portfolio)
    formatted = format_nightly_brief(brief)
    print(formatted)
