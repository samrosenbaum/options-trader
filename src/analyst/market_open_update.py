"""
Market Open Update (9:35 AM)
Confirms which morning watchlist stocks are actually moving + provides entry strategies
"""
import yfinance as yf
from datetime import datetime, timedelta, time as dt_time
from typing import Dict, List, Tuple, Optional
import pandas as pd
import pytz


def is_market_open() -> bool:
    """Check if market is currently open (9:30 AM - 4:00 PM ET)."""
    et = pytz.timezone('US/Eastern')
    now_et = datetime.now(et)

    # Check if weekday
    if now_et.weekday() >= 5:  # Saturday = 5, Sunday = 6
        return False

    # Check if market hours
    market_open = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
    market_close = now_et.replace(hour=16, minute=0, second=0, microsecond=0)

    return market_open <= now_et < market_close


def get_vwap(ticker_data: pd.DataFrame) -> float:
    """
    Calculate VWAP (Volume Weighted Average Price) from intraday data.

    Args:
        ticker_data: DataFrame with OHLCV data

    Returns:
        VWAP price
    """
    if ticker_data.empty:
        return 0.0

    typical_price = (ticker_data['High'] + ticker_data['Low'] + ticker_data['Close']) / 3
    vwap = (typical_price * ticker_data['Volume']).sum() / ticker_data['Volume'].sum()

    return float(vwap)


def analyze_gap_momentum(
    symbol: str,
    gap_pct: float,
    previous_close: float
) -> Tuple[bool, str, Dict]:
    """
    Analyze if a gap move is catchable or too risky.

    Criteria for CATCHABLE:
    - Volume ≥ 1.5x average (confirmation)
    - Gap holds (no fill below open)
    - Higher highs (trending up, not choppy)
    - Gap size < 8% (not too extended)

    Args:
        symbol: Stock symbol
        gap_pct: Gap percentage
        previous_close: Previous day's close price

    Returns:
        Tuple of (is_catchable, confidence, analysis_data)
    """
    try:
        ticker = yf.Ticker(symbol)

        # Get today's intraday data (1-minute intervals)
        today_data = ticker.history(period='1d', interval='1m')

        if today_data.empty or len(today_data) < 5:
            return False, 'LOW', {'reason': 'Insufficient data'}

        # Get key prices
        open_price = today_data['Open'].iloc[0]
        current_price = today_data['Close'].iloc[-1]
        high_price = today_data['High'].max()
        low_price = today_data['Low'].min()

        # Get volume data
        info = ticker.info
        current_volume = today_data['Volume'].sum()
        avg_volume = info.get('averageVolume', 0)
        volume_ratio = current_volume / avg_volume if avg_volume > 0 else 0

        # Calculate VWAP
        vwap = get_vwap(today_data)

        # Analyze momentum in 5-minute chunks
        # Resample to 5-min intervals
        data_5min = today_data.resample('5min').agg({
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last',
            'Volume': 'sum'
        }).dropna()

        # Check for higher highs (bullish trend)
        higher_highs = 0
        for i in range(1, min(len(data_5min), 6)):  # Check first 5 periods (25min)
            if data_5min['High'].iloc[i] > data_5min['High'].iloc[i-1]:
                higher_highs += 1

        higher_highs_pct = higher_highs / min(len(data_5min) - 1, 5) if len(data_5min) > 1 else 0

        # Check if gap held (price hasn't dipped below open)
        gap_held = low_price >= open_price * 0.995  # Allow 0.5% dip

        # Calculate volatility (average 5-min range as % of price)
        if not data_5min.empty:
            data_5min['range_pct'] = ((data_5min['High'] - data_5min['Low']) / data_5min['Close']) * 100
            avg_volatility = data_5min['range_pct'].mean()
        else:
            avg_volatility = 0

        # Scoring system
        score = 0
        reasons = []

        # Volume confirmation (30 points)
        if volume_ratio >= 2.0:
            score += 30
            reasons.append(f"Strong volume ({volume_ratio:.1f}x)")
        elif volume_ratio >= 1.5:
            score += 20
            reasons.append(f"Good volume ({volume_ratio:.1f}x)")
        elif volume_ratio >= 1.0:
            score += 10
            reasons.append(f"Normal volume ({volume_ratio:.1f}x)")
        else:
            reasons.append(f"Weak volume ({volume_ratio:.1f}x)")

        # Gap held (25 points)
        if gap_held:
            score += 25
            reasons.append("Gap holding")
        else:
            reasons.append("Gap filled")

        # Higher highs trend (25 points)
        if higher_highs_pct >= 0.8:  # 80%+ of periods making higher highs
            score += 25
            reasons.append("Strong uptrend")
        elif higher_highs_pct >= 0.6:
            score += 15
            reasons.append("Moderate uptrend")
        else:
            reasons.append("Choppy price action")

        # Gap size (20 points) - prefer moderate gaps
        if 2.0 <= abs(gap_pct) <= 5.0:
            score += 20
            reasons.append("Ideal gap size")
        elif abs(gap_pct) < 2.0:
            score += 10
            reasons.append("Small gap")
        elif abs(gap_pct) <= 8.0:
            score += 10
            reasons.append("Large gap")
        else:
            reasons.append("Gap too extended")

        # Volatility check (bonus/penalty)
        if avg_volatility < 1.0:  # Low volatility = smooth trend
            score += 10
            reasons.append("Low volatility (smooth)")
        elif avg_volatility > 3.0:  # High volatility = risky
            score -= 10
            reasons.append("High volatility (risky)")

        # Determine confidence
        if score >= 70:
            confidence = 'HIGH'
            is_catchable = True
        elif score >= 50:
            confidence = 'MEDIUM'
            is_catchable = True
        else:
            confidence = 'LOW'
            is_catchable = False

        # Generate entry strategy
        entry_strategy = []
        if is_catchable:
            # Suggest VWAP entry or breakout entry
            if current_price > vwap:
                dip_target = round(vwap * 0.998, 2)  # Slight below VWAP
                entry_strategy.append(f"Wait for dip to ${dip_target:.2f} (near VWAP)")

            breakout_level = round(high_price * 1.002, 2)  # Slight above HOD
            entry_strategy.append(f"OR buy breakout above ${breakout_level:.2f}")

            stop_loss = round(open_price * 0.97, 2)  # 3% below open (gap fill protection)
            entry_strategy.append(f"Stop Loss: ${stop_loss:.2f} (gap fill)")
        else:
            entry_strategy.append("WAIT - Too risky to chase")
            entry_strategy.append(f"Only enter if reclaims ${round(high_price, 2):.2f} with volume")

        analysis = {
            'score': score,
            'confidence': confidence,
            'reasons': reasons,
            'open_price': open_price,
            'current_price': current_price,
            'high_price': high_price,
            'low_price': low_price,
            'vwap': vwap,
            'volume_ratio': volume_ratio,
            'gap_held': gap_held,
            'higher_highs_pct': higher_highs_pct,
            'avg_volatility': avg_volatility,
            'entry_strategy': entry_strategy
        }

        return is_catchable, confidence, analysis

    except Exception as e:
        print(f"⚠️  Error analyzing {symbol}: {e}")
        return False, 'LOW', {'reason': f'Analysis error: {str(e)}'}


def generate_market_open_update(
    watchlist: List[str],
    morning_brief_data: Optional[Dict] = None
) -> Dict[str, any]:
    """
    Generate market open update (9:35 AM) with entry signals.

    Args:
        watchlist: List of symbols from morning brief
        morning_brief_data: Optional data from morning brief for context

    Returns:
        Dict with:
        {
            'timestamp': datetime,
            'movers': Dict[symbol, momentum_analysis],
            'entry_signals': List[Dict],
            'avoid_list': List[str]
        }
    """
    if not is_market_open():
        return {
            'error': 'Market not open yet',
            'timestamp': datetime.now()
        }

    print("\n" + "="*60)
    print("🔔 MARKET OPEN UPDATE (9:35 AM)")
    print("="*60)

    update = {
        'timestamp': datetime.now(),
        'movers': {},
        'entry_signals': [],
        'avoid_list': []
    }

    print(f"\n📊 Analyzing {len(watchlist)} watchlist stocks...")

    for symbol in watchlist:
        try:
            ticker = yf.Ticker(symbol)

            # Get today's data
            today_data = ticker.history(period='1d', interval='1m')
            if today_data.empty:
                continue

            # Get yesterday's close
            hist = ticker.history(period='5d')
            if hist.empty or len(hist) < 2:
                continue

            previous_close = hist['Close'].iloc[-2]  # Yesterday's close
            open_price = today_data['Open'].iloc[0]
            current_price = today_data['Close'].iloc[-1]

            # Calculate gap
            gap_pct = ((open_price - previous_close) / previous_close) * 100

            # Only analyze if there's a significant move
            intraday_move_pct = ((current_price - open_price) / open_price) * 100
            total_move_pct = ((current_price - previous_close) / previous_close) * 100

            if abs(total_move_pct) < 1.5:  # Less than 1.5% total move - skip
                continue

            # Analyze momentum
            is_catchable, confidence, analysis = analyze_gap_momentum(
                symbol, gap_pct, previous_close
            )

            update['movers'][symbol] = {
                'gap_pct': gap_pct,
                'intraday_move_pct': intraday_move_pct,
                'total_move_pct': total_move_pct,
                'is_catchable': is_catchable,
                'confidence': confidence,
                'analysis': analysis
            }

            # Add to entry signals or avoid list
            if is_catchable:
                update['entry_signals'].append({
                    'symbol': symbol,
                    'confidence': confidence,
                    'current_price': analysis['current_price'],
                    'entry_strategy': analysis['entry_strategy'],
                    'reasons': analysis['reasons']
                })
                print(f"\n✅ {symbol} - {confidence} CONFIDENCE")
            else:
                update['avoid_list'].append(symbol)
                print(f"\n❌ {symbol} - AVOID (too risky)")

            # Print analysis summary
            print(f"   Gap: {gap_pct:+.1f}% | Intraday: {intraday_move_pct:+.1f}% | Total: {total_move_pct:+.1f}%")
            print(f"   Reasons: {', '.join(analysis['reasons'][:3])}")

        except Exception as e:
            print(f"⚠️  Error analyzing {symbol}: {e}")
            continue

    # Sort entry signals by confidence
    confidence_order = {'HIGH': 3, 'MEDIUM': 2, 'LOW': 1}
    update['entry_signals'].sort(
        key=lambda x: confidence_order.get(x['confidence'], 0),
        reverse=True
    )

    print("\n" + "="*60)
    print(f"✅ Found {len(update['entry_signals'])} entry opportunities")
    print(f"⚠️  {len(update['avoid_list'])} stocks to avoid")
    print("="*60)

    return update


def format_market_open_update(update: Dict) -> str:
    """
    Format market open update as human-readable text.

    Args:
        update: Output from generate_market_open_update()

    Returns:
        Formatted string
    """
    if 'error' in update:
        return f"⚠️  {update['error']}"

    output = []

    # Header
    output.append("=" * 60)
    output.append("🔔 MARKET OPEN UPDATE (9:35 AM)")
    output.append(f"Generated: {update['timestamp'].strftime('%Y-%m-%d %I:%M %p')}")
    output.append("=" * 60)
    output.append("")

    # Entry Signals
    if update['entry_signals']:
        output.append(f"🎯 ENTRY OPPORTUNITIES ({len(update['entry_signals'])} stocks)")
        output.append("")

        for signal in update['entry_signals'][:5]:  # Top 5
            confidence_emoji = "🟢" if signal['confidence'] == 'HIGH' else "🟡" if signal['confidence'] == 'MEDIUM' else "⚪"

            output.append(f"{confidence_emoji} {signal['symbol']} - {signal['confidence']} CONFIDENCE")
            output.append(f"   Current: ${signal['current_price']:.2f}")
            output.append(f"   Reasons: {', '.join(signal['reasons'][:2])}")
            output.append("")
            output.append("   💡 ENTRY STRATEGY:")
            for strategy in signal['entry_strategy']:
                output.append(f"      {strategy}")
            output.append("")

    else:
        output.append("⚠️  No clear entry opportunities at this time")
        output.append("")

    # Avoid List
    if update['avoid_list']:
        output.append(f"❌ AVOID ({len(update['avoid_list'])} stocks)")
        for symbol in update['avoid_list'][:3]:
            output.append(f"   • {symbol}: Too risky to chase")
        output.append("")

    output.append("=" * 60)
    output.append("⏰ Next Update: First Hour Check (10:00 AM)")
    output.append("=" * 60)

    return "\n".join(output)


# Example usage
if __name__ == "__main__":
    # Test with watchlist
    test_watchlist = ['COIN', 'TSLA', 'NVDA', 'AMD', 'AAPL']

    update = generate_market_open_update(test_watchlist)
    formatted = format_market_open_update(update)
    print(formatted)
