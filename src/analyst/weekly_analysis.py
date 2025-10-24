"""
Weekly Pattern Analysis (Saturday Morning)
Learn from this week's trades and identify what's working
"""
import yfinance as yf
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import pandas as pd
from collections import defaultdict


def analyze_uoa_success_rate(
    uoa_history: List[Dict],
    lookback_days: int = 7
) -> Dict[str, any]:
    """
    Analyze how well UOA signals predicted actual moves.

    Args:
        uoa_history: List of UOA signals from the week with:
            {
                'symbol': str,
                'detected_date': datetime,
                'bias': 'bullish' | 'bearish',
                'vol_oi_ratio': float,
                'strike': float,
                'option_type': 'call' | 'put'
            }
        lookback_days: Days to look back (default 7)

    Returns:
        Dict with success metrics
    """
    results = {
        'total_signals': len(uoa_history),
        'successful': 0,
        'failed': 0,
        'success_rate': 0.0,
        'avg_move_pct': 0.0,
        'best_performers': [],
        'worst_performers': [],
        'patterns': {}
    }

    if not uoa_history:
        return results

    successful_trades = []
    failed_trades = []

    for signal in uoa_history:
        symbol = signal['symbol']
        detected_date = signal['detected_date']
        bias = signal['bias']

        try:
            # Get price data from detection day to 3 days after
            ticker = yf.Ticker(symbol)
            start_date = detected_date - timedelta(days=1)
            end_date = detected_date + timedelta(days=4)

            hist = ticker.history(start=start_date, end=end_date)

            if hist.empty or len(hist) < 2:
                continue

            # Find price on detection day and max price in next 3 days
            detection_price = hist['Close'].iloc[0]
            next_3d = hist.iloc[1:4] if len(hist) > 3 else hist.iloc[1:]

            if next_3d.empty:
                continue

            max_price = next_3d['High'].max()
            min_price = next_3d['Low'].min()

            # Calculate moves
            max_up_move = ((max_price - detection_price) / detection_price) * 100
            max_down_move = ((min_price - detection_price) / detection_price) * 100

            # Determine success
            if bias == 'bullish':
                success = max_up_move >= 2.0  # At least 2% up move
                move_pct = max_up_move
            else:  # bearish
                success = max_down_move <= -2.0  # At least 2% down move
                move_pct = abs(max_down_move)

            trade_result = {
                'symbol': symbol,
                'bias': bias,
                'vol_oi_ratio': signal['vol_oi_ratio'],
                'move_pct': move_pct,
                'success': success
            }

            if success:
                results['successful'] += 1
                successful_trades.append(trade_result)
            else:
                results['failed'] += 1
                failed_trades.append(trade_result)

        except Exception as e:
            continue

    # Calculate metrics
    if results['total_signals'] > 0:
        results['success_rate'] = (results['successful'] / results['total_signals']) * 100

    # Find best and worst performers
    if successful_trades:
        results['best_performers'] = sorted(
            successful_trades,
            key=lambda x: x['move_pct'],
            reverse=True
        )[:5]

        results['avg_move_pct'] = sum(t['move_pct'] for t in successful_trades) / len(successful_trades)

    if failed_trades:
        results['worst_performers'] = sorted(
            failed_trades,
            key=lambda x: x['move_pct'],
            reverse=False
        )[:5]

    # Identify patterns
    # Pattern 1: High vol/OI ratio (>3.0x) success rate
    high_ratio_signals = [s for s in uoa_history if s['vol_oi_ratio'] >= 3.0]
    if high_ratio_signals:
        high_ratio_success = sum(
            1 for t in successful_trades
            if t['vol_oi_ratio'] >= 3.0
        )
        results['patterns']['high_ratio'] = {
            'total': len(high_ratio_signals),
            'successful': high_ratio_success,
            'success_rate': (high_ratio_success / len(high_ratio_signals)) * 100 if high_ratio_signals else 0
        }

    # Pattern 2: Call vs Put success rates
    call_signals = [s for s in uoa_history if s.get('option_type') == 'call']
    put_signals = [s for s in uoa_history if s.get('option_type') == 'put']

    if call_signals:
        call_success = sum(1 for t in successful_trades if t['bias'] == 'bullish')
        results['patterns']['calls'] = {
            'total': len(call_signals),
            'successful': call_success,
            'success_rate': (call_success / len(call_signals)) * 100
        }

    if put_signals:
        put_success = sum(1 for t in successful_trades if t['bias'] == 'bearish')
        results['patterns']['puts'] = {
            'total': len(put_signals),
            'successful': put_success,
            'success_rate': (put_success / len(put_signals)) * 100
        }

    return results


def analyze_portfolio_performance(
    closed_positions: List[Dict],
    lookback_days: int = 7
) -> Dict[str, any]:
    """
    Analyze user's trading performance for the week.

    Args:
        closed_positions: List of positions closed this week
        lookback_days: Days to look back

    Returns:
        Dict with performance metrics
    """
    cutoff_date = datetime.now() - timedelta(days=lookback_days)

    # Filter to this week's trades
    week_trades = [
        pos for pos in closed_positions
        if datetime.fromisoformat(pos.get('exit_date', '').replace('Z', '+00:00')) >= cutoff_date
    ]

    if not week_trades:
        return {
            'total_trades': 0,
            'win_rate': 0,
            'avg_return': 0,
            'total_pl': 0
        }

    # Calculate metrics
    winners = [pos for pos in week_trades if pos.get('realized_pl', 0) > 0]
    losers = [pos for pos in week_trades if pos.get('realized_pl', 0) <= 0]

    total_pl = sum(pos.get('realized_pl', 0) for pos in week_trades)
    avg_return = sum(pos.get('realized_pl_percent', 0) for pos in week_trades) / len(week_trades)

    # Analyze by holding period
    holding_periods = defaultdict(list)
    for pos in week_trades:
        entry = datetime.fromisoformat(pos.get('entry_date', '').replace('Z', '+00:00'))
        exit = datetime.fromisoformat(pos.get('exit_date', '').replace('Z', '+00:00'))
        days_held = (exit - entry).days

        if days_held == 0:
            period = 'same_day'
        elif days_held <= 2:
            period = '1-2_days'
        elif days_held <= 5:
            period = '3-5_days'
        else:
            period = '5+_days'

        holding_periods[period].append(pos)

    # Calculate win rate by holding period
    holding_analysis = {}
    for period, positions in holding_periods.items():
        period_winners = [p for p in positions if p.get('realized_pl', 0) > 0]
        holding_analysis[period] = {
            'total': len(positions),
            'winners': len(period_winners),
            'win_rate': (len(period_winners) / len(positions)) * 100,
            'avg_return': sum(p.get('realized_pl_percent', 0) for p in positions) / len(positions)
        }

    # Analyze by option type
    calls = [pos for pos in week_trades if pos.get('option_type') == 'call']
    puts = [pos for pos in week_trades if pos.get('option_type') == 'put']

    call_winners = [p for p in calls if p.get('realized_pl', 0) > 0]
    put_winners = [p for p in puts if p.get('realized_pl', 0) > 0]

    return {
        'total_trades': len(week_trades),
        'winners': len(winners),
        'losers': len(losers),
        'win_rate': (len(winners) / len(week_trades)) * 100,
        'avg_return': avg_return,
        'total_pl': total_pl,
        'best_trade': max(week_trades, key=lambda x: x.get('realized_pl', 0)),
        'worst_trade': min(week_trades, key=lambda x: x.get('realized_pl', 0)),
        'holding_period_analysis': holding_analysis,
        'option_type_analysis': {
            'calls': {
                'total': len(calls),
                'winners': len(call_winners),
                'win_rate': (len(call_winners) / len(calls)) * 100 if calls else 0
            },
            'puts': {
                'total': len(puts),
                'winners': len(put_winners),
                'win_rate': (len(put_winners) / len(puts)) * 100 if puts else 0
            }
        }
    }


def identify_learning_opportunities(
    portfolio_performance: Dict,
    uoa_analysis: Dict
) -> List[Dict[str, str]]:
    """
    Identify key learnings and action items for next week.

    Args:
        portfolio_performance: Output from analyze_portfolio_performance()
        uoa_analysis: Output from analyze_uoa_success_rate()

    Returns:
        List of learning insights
    """
    learnings = []

    # Win rate insights
    if portfolio_performance.get('win_rate', 0) < 50:
        learnings.append({
            'type': 'warning',
            'category': 'Win Rate',
            'insight': f"Win rate ({portfolio_performance['win_rate']:.1f}%) is below 50%",
            'action': "Focus on high-conviction setups only. Consider tighter stop losses."
        })
    elif portfolio_performance.get('win_rate', 0) >= 60:
        learnings.append({
            'type': 'success',
            'category': 'Win Rate',
            'insight': f"Strong win rate ({portfolio_performance['win_rate']:.1f}%)",
            'action': "Keep doing what you're doing. Consider scaling position sizes."
        })

    # Holding period insights
    if 'holding_period_analysis' in portfolio_performance:
        best_period = max(
            portfolio_performance['holding_period_analysis'].items(),
            key=lambda x: x[1]['win_rate']
        )
        learnings.append({
            'type': 'insight',
            'category': 'Holding Period',
            'insight': f"Best performance with {best_period[0].replace('_', ' ')} holds ({best_period[1]['win_rate']:.1f}% win rate)",
            'action': f"Favor {best_period[0].replace('_', ' ')} holding periods in your strategy."
        })

    # Option type insights
    if 'option_type_analysis' in portfolio_performance:
        call_wr = portfolio_performance['option_type_analysis']['calls']['win_rate']
        put_wr = portfolio_performance['option_type_analysis']['puts']['win_rate']

        if call_wr > put_wr + 15:
            learnings.append({
                'type': 'insight',
                'category': 'Option Type',
                'insight': f"Calls performing much better than puts ({call_wr:.1f}% vs {put_wr:.1f}%)",
                'action': "Consider focusing more on bullish plays in current market."
            })
        elif put_wr > call_wr + 15:
            learnings.append({
                'type': 'insight',
                'category': 'Option Type',
                'insight': f"Puts performing much better than calls ({put_wr:.1f}% vs {call_wr:.1f}%)",
                'action': "Market favoring bearish plays. Continue with protective strategies."
            })

    # UOA insights
    if uoa_analysis.get('success_rate', 0) >= 60:
        learnings.append({
            'type': 'success',
            'category': 'UOA Scanner',
            'insight': f"UOA signals showing {uoa_analysis['success_rate']:.1f}% success rate",
            'action': "Trust the UOA scanner - it's working. Act quickly on signals."
        })
    elif uoa_analysis.get('success_rate', 0) > 0:
        learnings.append({
            'type': 'warning',
            'category': 'UOA Scanner',
            'insight': f"UOA signals only {uoa_analysis['success_rate']:.1f}% successful this week",
            'action': "Wait for confirmation before entering UOA plays."
        })

    # High ratio pattern
    if 'patterns' in uoa_analysis and 'high_ratio' in uoa_analysis['patterns']:
        high_ratio = uoa_analysis['patterns']['high_ratio']
        if high_ratio['success_rate'] >= 70:
            learnings.append({
                'type': 'success',
                'category': 'Pattern',
                'insight': f"High vol/OI ratio (>3.0x) signals are {high_ratio['success_rate']:.1f}% successful",
                'action': "Prioritize signals with vol/OI > 3.0x - these are the best."
            })

    return learnings


def generate_weekly_analysis(
    closed_positions: List[Dict],
    uoa_history: List[Dict],
    lookback_days: int = 7
) -> Dict[str, any]:
    """
    Generate comprehensive weekly performance analysis.

    Args:
        closed_positions: User's closed positions
        uoa_history: Week's UOA signals
        lookback_days: Days to analyze

    Returns:
        Dict with full analysis
    """
    print("\n" + "="*60)
    print("📊 GENERATING WEEKLY ANALYSIS")
    print("="*60)

    analysis = {
        'timestamp': datetime.now(),
        'week_ending': datetime.now().strftime('%Y-%m-%d'),
        'portfolio_performance': {},
        'uoa_performance': {},
        'learnings': [],
        'next_week_plan': []
    }

    # 1. Portfolio Performance
    print("\n[1/3] Analyzing portfolio performance...")
    analysis['portfolio_performance'] = analyze_portfolio_performance(
        closed_positions,
        lookback_days
    )

    # 2. UOA Performance
    print("\n[2/3] Analyzing UOA scanner effectiveness...")
    analysis['uoa_performance'] = analyze_uoa_success_rate(
        uoa_history,
        lookback_days
    )

    # 3. Learning Opportunities
    print("\n[3/3] Identifying learning opportunities...")
    analysis['learnings'] = identify_learning_opportunities(
        analysis['portfolio_performance'],
        analysis['uoa_performance']
    )

    # 4. Next Week Plan
    # Based on what worked this week
    if analysis['portfolio_performance'].get('win_rate', 0) >= 60:
        analysis['next_week_plan'].append("Continue current strategy - it's working")
    else:
        analysis['next_week_plan'].append("Refine entry strategy - focus on higher conviction setups")

    if analysis['uoa_performance'].get('success_rate', 0) >= 60:
        analysis['next_week_plan'].append("Act faster on UOA signals - they're reliable")

    print("\n" + "="*60)
    print("✅ WEEKLY ANALYSIS COMPLETE")
    print("="*60)

    return analysis


def format_weekly_analysis(analysis: Dict) -> str:
    """
    Format weekly analysis as human-readable report.

    Args:
        analysis: Output from generate_weekly_analysis()

    Returns:
        Formatted string
    """
    output = []

    # Header
    output.append("=" * 60)
    output.append("📊 WEEKLY PERFORMANCE ANALYSIS")
    output.append(f"Week Ending: {analysis['week_ending']}")
    output.append("=" * 60)
    output.append("")

    # Portfolio Summary
    perf = analysis['portfolio_performance']
    if perf.get('total_trades', 0) > 0:
        output.append("💼 PORTFOLIO PERFORMANCE")
        output.append(f"  • Total Trades: {perf['total_trades']}")
        output.append(f"  • Win Rate: {perf['win_rate']:.1f}% ({perf['winners']} wins, {perf['losers']} losses)")
        output.append(f"  • Total P&L: ${perf['total_pl']:.2f}")
        output.append(f"  • Avg Return: {perf['avg_return']:+.1f}%")
        output.append("")

        # Best/Worst Trades
        if perf.get('best_trade'):
            best = perf['best_trade']
            output.append(f"  🏆 Best Trade: {best['symbol']} ${best['strike']} {best['option_type'].upper()} (${best.get('realized_pl', 0):.2f})")

        if perf.get('worst_trade'):
            worst = perf['worst_trade']
            output.append(f"  💔 Worst Trade: {worst['symbol']} ${worst['strike']} {worst['option_type'].upper()} (${worst.get('realized_pl', 0):.2f})")
        output.append("")

        # Holding Period Analysis
        if perf.get('holding_period_analysis'):
            output.append("  📅 HOLDING PERIOD BREAKDOWN")
            for period, data in perf['holding_period_analysis'].items():
                output.append(f"     {period.replace('_', ' ').title()}: {data['win_rate']:.1f}% win rate ({data['total']} trades)")
            output.append("")

        # Option Type Analysis
        if perf.get('option_type_analysis'):
            opt_analysis = perf['option_type_analysis']
            output.append("  📈 OPTION TYPE PERFORMANCE")
            output.append(f"     Calls: {opt_analysis['calls']['win_rate']:.1f}% win rate ({opt_analysis['calls']['total']} trades)")
            output.append(f"     Puts: {opt_analysis['puts']['win_rate']:.1f}% win rate ({opt_analysis['puts']['total']} trades)")
            output.append("")

    # UOA Scanner Performance
    uoa = analysis['uoa_performance']
    if uoa.get('total_signals', 0) > 0:
        output.append("🔥 UOA SCANNER EFFECTIVENESS")
        output.append(f"  • Total Signals: {uoa['total_signals']}")
        output.append(f"  • Success Rate: {uoa['success_rate']:.1f}%")
        output.append(f"  • Avg Move: {uoa['avg_move_pct']:.1f}%")
        output.append("")

        if uoa.get('best_performers'):
            output.append("  🎯 Best UOA Signals:")
            for performer in uoa['best_performers'][:3]:
                bias_emoji = "🟢" if performer['bias'] == 'bullish' else "🔴"
                output.append(f"     {bias_emoji} {performer['symbol']}: {performer['move_pct']:+.1f}% ({performer['vol_oi_ratio']:.1f}x vol/OI)")
            output.append("")

        # Patterns
        if uoa.get('patterns'):
            output.append("  📊 PATTERN INSIGHTS")
            if 'high_ratio' in uoa['patterns']:
                hr = uoa['patterns']['high_ratio']
                output.append(f"     High Vol/OI (>3.0x): {hr['success_rate']:.1f}% success ({hr['successful']}/{hr['total']})")
            output.append("")

    # Key Learnings
    if analysis['learnings']:
        output.append("💡 KEY LEARNINGS")
        for learning in analysis['learnings']:
            emoji = "✅" if learning['type'] == 'success' else "⚠️" if learning['type'] == 'warning' else "📌"
            output.append(f"  {emoji} {learning['category']}: {learning['insight']}")
            output.append(f"     → {learning['action']}")
            output.append("")

    # Next Week Plan
    if analysis['next_week_plan']:
        output.append("🎯 NEXT WEEK PLAN")
        for item in analysis['next_week_plan']:
            output.append(f"  • {item}")
        output.append("")

    output.append("=" * 60)
    output.append("Keep learning and improving! 📈")
    output.append("=" * 60)

    return "\n".join(output)


# Example usage
if __name__ == "__main__":
    # Test data
    test_closed_positions = [
        {
            'symbol': 'AAPL',
            'strike': 230,
            'option_type': 'call',
            'entry_date': (datetime.now() - timedelta(days=3)).isoformat(),
            'exit_date': (datetime.now() - timedelta(days=1)).isoformat(),
            'realized_pl': 450,
            'realized_pl_percent': 28.5
        },
        {
            'symbol': 'TSLA',
            'strike': 350,
            'option_type': 'put',
            'entry_date': (datetime.now() - timedelta(days=5)).isoformat(),
            'exit_date': (datetime.now() - timedelta(days=2)).isoformat(),
            'realized_pl': -200,
            'realized_pl_percent': -15.2
        }
    ]

    test_uoa_history = [
        {
            'symbol': 'COIN',
            'detected_date': datetime.now() - timedelta(days=2),
            'bias': 'bullish',
            'vol_oi_ratio': 3.3,
            'strike': 345,
            'option_type': 'call'
        }
    ]

    analysis = generate_weekly_analysis(test_closed_positions, test_uoa_history)
    formatted = format_weekly_analysis(analysis)
    print(formatted)
