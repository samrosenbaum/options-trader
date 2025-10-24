"""
UOA Scanner Backtesting
Tests historical accuracy of unusual options activity signals
"""
import yfinance as yf
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import pandas as pd

from src.scanner.unusual_activity import detect_unusual_options_activity


def get_price_move_after_signal(
    symbol: str,
    signal_date: datetime,
    days_forward: int = 5
) -> Dict[str, float]:
    """
    Get price movement after UOA signal detected.

    Args:
        symbol: Stock symbol
        signal_date: Date UOA was detected
        days_forward: Days to track (default 5 for one week)

    Returns:
        Dict with max_gain, max_loss, days_to_max_gain, days_to_max_loss
    """
    try:
        ticker = yf.Ticker(symbol)

        # Get price data from signal date forward
        start_date = signal_date
        end_date = signal_date + timedelta(days=days_forward + 3)  # Extra buffer

        hist = ticker.history(start=start_date, end=end_date)

        if hist.empty or len(hist) < 2:
            return {
                'signal_price': 0,
                'max_gain_pct': 0,
                'max_loss_pct': 0,
                'days_to_max_gain': 0,
                'days_to_max_loss': 0,
                'close_5d_pct': 0
            }

        signal_price = hist['Close'].iloc[0]

        # Calculate max gain and loss
        max_price = hist['High'].max()
        min_price = hist['Low'].min()

        max_gain_pct = ((max_price - signal_price) / signal_price) * 100
        max_loss_pct = ((min_price - signal_price) / signal_price) * 100

        # Find days to max gain/loss
        max_gain_idx = hist['High'].idxmax()
        max_loss_idx = hist['Low'].idxmin()

        days_to_max_gain = (max_gain_idx - hist.index[0]).days
        days_to_max_loss = (max_loss_idx - hist.index[0]).days

        # Get 5-day close (if available)
        if len(hist) >= 6:
            close_5d = hist['Close'].iloc[5]
            close_5d_pct = ((close_5d - signal_price) / signal_price) * 100
        else:
            close_5d_pct = 0

        return {
            'signal_price': signal_price,
            'max_gain_pct': max_gain_pct,
            'max_loss_pct': max_loss_pct,
            'days_to_max_gain': days_to_max_gain,
            'days_to_max_loss': days_to_max_loss,
            'close_5d_pct': close_5d_pct
        }

    except Exception as e:
        print(f"⚠️  Error getting price move for {symbol}: {e}")
        return {
            'signal_price': 0,
            'max_gain_pct': 0,
            'max_loss_pct': 0,
            'days_to_max_gain': 0,
            'days_to_max_loss': 0,
            'close_5d_pct': 0
        }


def backtest_current_signals(
    symbols: List[str],
    lookback_days: int = 30,
    min_vol_oi_ratio: float = 2.5
) -> Dict[str, List[Dict]]:
    """
    Backtest by detecting current UOA signals and checking recent price action.

    This simulates: "If we detected this signal X days ago, what happened?"

    Args:
        symbols: Symbols to test
        lookback_days: How far back to check moves (default 30 days)
        min_vol_oi_ratio: Minimum vol/OI to flag (default 2.5)

    Returns:
        Dict of test results by symbol
    """
    print(f"\n{'='*70}")
    print(f"🔬 BACKTESTING UOA SCANNER")
    print(f"{'='*70}")
    print(f"Symbols: {len(symbols)}")
    print(f"Min Vol/OI: {min_vol_oi_ratio}x")
    print(f"Lookback: {lookback_days} days")
    print(f"{'='*70}\n")

    # Detect current UOA signals
    print("Step 1: Detecting current unusual options activity...\n")
    uoa_signals = detect_unusual_options_activity(
        symbols,
        min_vol_oi_ratio=min_vol_oi_ratio
    )

    print(f"\n✅ Found {len(uoa_signals)} symbols with UOA\n")
    print(f"{'='*70}\n")

    # For each signal, check recent price action
    print("Step 2: Analyzing price movements over past 30 days...\n")

    results = {}

    for symbol, signal_data in uoa_signals.items():
        print(f"\n📊 {symbol} - {signal_data['bias'].upper()} bias")
        print(f"   Current Price: ${signal_data['current_price']:.2f}")
        print(f"   Unusual Volume: {signal_data['total_unusual_volume']:,}")

        # Get top signal
        all_signals = signal_data['call_signals'] + signal_data['put_signals']
        if not all_signals:
            continue

        top_signal = max(all_signals, key=lambda x: x['vol_oi_ratio'])
        print(f"   Top Signal: ${top_signal['strike']:.2f} {top_signal['type'].upper()} - {top_signal['vol_oi_ratio']:.2f}x vol/OI")

        # Get historical price movements
        ticker = yf.Ticker(symbol)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=lookback_days + 5)

        try:
            hist = ticker.history(start=start_date, end=end_date)

            if hist.empty or len(hist) < 5:
                print(f"   ⚠️  Insufficient price data")
                continue

            # Analyze price action
            current_price = hist['Close'].iloc[-1]

            # Last 5 days
            price_5d_ago = hist['Close'].iloc[-6] if len(hist) >= 6 else hist['Close'].iloc[0]
            move_5d = ((current_price - price_5d_ago) / price_5d_ago) * 100

            # Last 10 days
            price_10d_ago = hist['Close'].iloc[-11] if len(hist) >= 11 else hist['Close'].iloc[0]
            move_10d = ((current_price - price_10d_ago) / price_10d_ago) * 100

            # Last 20 days
            price_20d_ago = hist['Close'].iloc[-21] if len(hist) >= 21 else hist['Close'].iloc[0]
            move_20d = ((current_price - price_20d_ago) / price_20d_ago) * 100

            # Max move in lookback period
            max_price = hist['High'].max()
            min_price = hist['Low'].min()
            max_gain = ((max_price - price_20d_ago) / price_20d_ago) * 100
            max_loss = ((min_price - price_20d_ago) / price_20d_ago) * 100

            print(f"\n   📈 Recent Price Action:")
            print(f"      Last 5 days:  {move_5d:+.2f}%")
            print(f"      Last 10 days: {move_10d:+.2f}%")
            print(f"      Last 20 days: {move_20d:+.2f}%")
            print(f"      Max gain (30d): {max_gain:+.2f}%")
            print(f"      Max loss (30d): {max_loss:+.2f}%")

            # Validate signal
            # Bullish bias should correlate with upward moves
            # Bearish bias should correlate with downward moves

            bias = signal_data['bias']
            validation = "❌ WRONG"

            if bias == 'bullish':
                if move_5d > 2 or move_10d > 3:
                    validation = "✅ CORRECT - Stock moved up"
                elif move_5d < -2 or move_10d < -3:
                    validation = "❌ WRONG - Stock moved down"
                else:
                    validation = "⚪ NEUTRAL - No significant move yet"

            elif bias == 'bearish':
                if move_5d < -2 or move_10d < -3:
                    validation = "✅ CORRECT - Stock moved down"
                elif move_5d > 2 or move_10d > 3:
                    validation = "❌ WRONG - Stock moved up"
                else:
                    validation = "⚪ NEUTRAL - No significant move yet"

            print(f"\n   {validation}")

            results[symbol] = {
                'signal_data': signal_data,
                'top_signal': top_signal,
                'price_moves': {
                    'move_5d': move_5d,
                    'move_10d': move_10d,
                    'move_20d': move_20d,
                    'max_gain_30d': max_gain,
                    'max_loss_30d': max_loss
                },
                'validation': validation
            }

        except Exception as e:
            print(f"   ⚠️  Error: {e}")
            continue

    return results


def calculate_accuracy_metrics(results: Dict[str, List[Dict]]) -> Dict:
    """
    Calculate accuracy metrics from backtest results.

    Returns:
        Dict with accuracy stats
    """
    if not results:
        return {
            'total_signals': 0,
            'correct': 0,
            'wrong': 0,
            'neutral': 0,
            'accuracy': 0
        }

    correct = sum(1 for r in results.values() if '✅ CORRECT' in r['validation'])
    wrong = sum(1 for r in results.values() if '❌ WRONG' in r['validation'])
    neutral = sum(1 for r in results.values() if '⚪ NEUTRAL' in r['validation'])

    total = len(results)

    # Accuracy = correct / (correct + wrong), excluding neutral
    accuracy = (correct / (correct + wrong)) * 100 if (correct + wrong) > 0 else 0

    return {
        'total_signals': total,
        'correct': correct,
        'wrong': wrong,
        'neutral': neutral,
        'accuracy': accuracy,
        'correct_pct': (correct / total) * 100 if total > 0 else 0,
        'wrong_pct': (wrong / total) * 100 if total > 0 else 0,
        'neutral_pct': (neutral / total) * 100 if total > 0 else 0
    }


def analyze_by_vol_oi_threshold(results: Dict[str, List[Dict]]) -> Dict:
    """
    Analyze accuracy by vol/OI ratio threshold.

    Shows: Do higher vol/OI ratios have better accuracy?
    """
    thresholds = [2.0, 3.0, 5.0, 10.0]

    threshold_results = {}

    for threshold in thresholds:
        filtered = {
            symbol: data for symbol, data in results.items()
            if data['top_signal']['vol_oi_ratio'] >= threshold
        }

        metrics = calculate_accuracy_metrics(filtered)
        threshold_results[f"{threshold}x"] = metrics

    return threshold_results


# Example usage
if __name__ == "__main__":
    # Test universe: High-volume, liquid stocks
    TEST_SYMBOLS = [
        # Mega caps
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META',

        # Large caps with high options volume
        'AMD', 'NFLX', 'COIN', 'PLTR', 'HOOD', 'SOFI',

        # Recent movers
        'SMCI', 'MSTR', 'RIOT', 'MARA',

        # Indices
        'SPY', 'QQQ', 'IWM'
    ]

    # Run backtest
    results = backtest_current_signals(
        symbols=TEST_SYMBOLS,
        lookback_days=30,
        min_vol_oi_ratio=2.5
    )

    # Calculate metrics
    print(f"\n{'='*70}")
    print("📊 BACKTEST RESULTS SUMMARY")
    print(f"{'='*70}\n")

    metrics = calculate_accuracy_metrics(results)

    print(f"Total Signals Detected: {metrics['total_signals']}")
    print(f"✅ Correct: {metrics['correct']} ({metrics['correct_pct']:.1f}%)")
    print(f"❌ Wrong: {metrics['wrong']} ({metrics['wrong_pct']:.1f}%)")
    print(f"⚪ Neutral: {metrics['neutral']} ({metrics['neutral_pct']:.1f}%)")
    print(f"\n🎯 Accuracy (excluding neutral): {metrics['accuracy']:.1f}%")

    # Analyze by threshold
    print(f"\n{'='*70}")
    print("📈 ACCURACY BY VOL/OI THRESHOLD")
    print(f"{'='*70}\n")

    threshold_analysis = analyze_by_vol_oi_threshold(results)

    for threshold, metrics in threshold_analysis.items():
        if metrics['total_signals'] > 0:
            print(f"\nVol/OI ≥ {threshold}:")
            print(f"  Signals: {metrics['total_signals']}")
            print(f"  Accuracy: {metrics['accuracy']:.1f}%")
            print(f"  Correct: {metrics['correct']}, Wrong: {metrics['wrong']}, Neutral: {metrics['neutral']}")

    print(f"\n{'='*70}")
    print("💡 KEY INSIGHTS")
    print(f"{'='*70}\n")

    # Find best performers
    correct_signals = [
        (symbol, data) for symbol, data in results.items()
        if '✅ CORRECT' in data['validation']
    ]

    if correct_signals:
        print("🏆 TOP CORRECT PREDICTIONS:")
        sorted_correct = sorted(
            correct_signals,
            key=lambda x: abs(x[1]['price_moves']['move_5d']),
            reverse=True
        )

        for symbol, data in sorted_correct[:5]:
            print(f"\n  {symbol} ({data['signal_data']['bias'].upper()})")
            print(f"    Vol/OI: {data['top_signal']['vol_oi_ratio']:.2f}x")
            print(f"    5-day move: {data['price_moves']['move_5d']:+.2f}%")
            print(f"    Max gain: {data['price_moves']['max_gain_30d']:+.2f}%")

    print(f"\n{'='*70}\n")
