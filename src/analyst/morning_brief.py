"""
Morning Brief Generator (7:00 AM)
Delivers pre-market intelligence to catch opportunities before market open
"""
import yfinance as yf
from datetime import datetime, timedelta, time
from typing import Dict, List, Optional, Tuple
import pytz

ET_TZ = pytz.timezone('US/Eastern')

CONFIDENCE_ORDER = ['high', 'medium', 'low', 'none']


def _degrade_confidence(level: str) -> str:
    if level not in CONFIDENCE_ORDER:
        return level

    idx = CONFIDENCE_ORDER.index(level)
    if idx >= len(CONFIDENCE_ORDER) - 1:
        return CONFIDENCE_ORDER[-1]

    return CONFIDENCE_ORDER[idx + 1]


def _classify_earnings_context(earnings_date: Optional[datetime], now_et: datetime) -> Dict[str, Optional[str]]:
    if not earnings_date:
        return {'label': 'none', 'earnings_time': None, 'hours_diff': None}

    dt = earnings_date
    if dt.tzinfo is None:
        dt = pytz.utc.localize(dt)

    earnings_et = dt.astimezone(ET_TZ)
    diff_hours = (earnings_et - now_et).total_seconds() / 3600

    if -24 <= diff_hours < 0:
        label = 'post_day0'
    elif -48 <= diff_hours < -24:
        label = 'post_day1'
    elif 0 <= diff_hours <= 24:
        label = 'today'
    elif 24 < diff_hours <= 72:
        label = 'upcoming'
    elif diff_hours < -48:
        label = 'past'
    else:
        label = 'future'

    return {
        'label': label,
        'earnings_time': earnings_et.isoformat(),
        'hours_diff': diff_hours,
    }


def _should_flag_contradiction(flow_bias: str, gap_pct: Optional[float], threshold: float = 1.0) -> bool:
    if gap_pct is None:
        return False

    if flow_bias == 'bullish' and gap_pct <= -threshold:
        return True
    if flow_bias == 'bearish' and gap_pct >= threshold:
        return True
    return False


def _format_price_move(snapshot: Optional[Dict[str, float]]) -> Optional[str]:
    if not snapshot:
        return None

    premarket_price = snapshot.get('premarket_price')
    previous_close = snapshot.get('previous_close')
    if not premarket_price or not previous_close:
        return None

    change_pct = ((premarket_price - previous_close) / previous_close) * 100
    direction = 'higher' if change_pct > 0 else 'lower' if change_pct < 0 else 'flat'
    return (
        f"${previous_close:.2f} → ${premarket_price:.2f} "
        f"({change_pct:+.1f}% {direction})"
    )


def _summarize_market_regime(market_conditions: Dict[str, Dict[str, float]]) -> Dict[str, any]:
    summary_notes = []
    bias = 'neutral'

    declines = [data for data in market_conditions.values() if data.get('change_pct', 0) < 0]
    advances = [data for data in market_conditions.values() if data.get('change_pct', 0) > 0]

    if len(declines) >= 2:
        bias = 'risk_off'
        summary_notes.append('Major indexes are red pre-market - expect weakness at the open.')
    elif len(advances) >= 2:
        bias = 'risk_on'
        summary_notes.append('Risk-on tone with broad index strength before the bell.')
    else:
        summary_notes.append('Mixed index picture - focus on stock-specific catalysts.')

    return {
        'bias': bias,
        'notes': summary_notes,
    }


def _build_portfolio_alerts(
    user_portfolio: Optional[Dict],
    symbol_summaries: Dict[str, Dict]
) -> List[Dict[str, any]]:
    if not user_portfolio or 'open_positions' not in user_portfolio:
        return []

    alerts: List[Dict[str, any]] = []

    for position in user_portfolio['open_positions']:
        symbol = position.get('symbol')
        if not symbol:
            continue

        summary = symbol_summaries.get(symbol)
        if not summary:
            continue

        snapshot = summary.get('market_snapshot')
        price_move = _format_price_move(snapshot)
        change_pct = snapshot.get('gap_pct') if snapshot else None

        actions: List[str] = []
        context_notes: List[str] = []

        if summary.get('earnings_context', {}).get('label', '') in {'post_day0', 'post_day1'}:
            context_notes.append('Earnings just hit - expect IV crush on options.')
            actions.append('Plan exits around the opening range if premium collapses.')

        flow_confidence = summary.get('flow_confidence', 'none')
        flow_bias = summary.get('flow_bias')

        if summary.get('contradiction'):
            context_notes.append('Price action is fighting the prior flow signal - trust price until a new read arrives.')
            actions.append('Avoid adding size until the trend resolves. Prepare exit triggers before the bell.')

        if change_pct is not None:
            if change_pct <= -1:
                actions.append('If the open stays weak, trim or exit to protect capital.')
            elif change_pct >= 1:
                actions.append('If strength holds, trail stops quickly and harvest gains into spikes.')

        option_type = position.get('option_type')
        strike = position.get('strike')
        expiration = position.get('expiration')

        details = []
        if option_type:
            details.append(f"{option_type.upper()} {strike}" if strike else option_type.upper())
        if expiration:
            details.append(f"exp {expiration}")

        headline_parts = []
        if flow_bias in {'bullish', 'bearish'}:
            headline_parts.append(flow_bias.upper())
        if flow_confidence:
            headline_parts.append(f"conf {flow_confidence.upper()}")

        headline = ' / '.join(headline_parts) if headline_parts else 'Position Update'

        urgency = 'medium'
        if summary.get('contradiction') or (change_pct is not None and abs(change_pct) >= 2):
            urgency = 'high'

        alert = {
            'symbol': symbol,
            'urgency': urgency,
            'headline': headline,
            'context': ' '.join(context_notes) if context_notes else None,
            'actions': actions,
            'price_move': price_move,
            'flow_confidence': flow_confidence,
            'flow_bias': flow_bias,
            'details': ', '.join(details) if details else None,
            'contradiction': summary.get('contradiction', False),
            'earnings_context': summary.get('earnings_context', {}).get('label'),
        }

        alerts.append(alert)

    return alerts

from src.scanner.unusual_activity import detect_unusual_options_activity
from src.scanner.earnings_calendar import prioritize_by_earnings
from src.scanner.catalyst_detector import detect_intraday_breakouts


def get_premarket_movers(
    symbols: List[str],
    min_move_pct: float = 2.0,
    include_all_snapshots: bool = False
) -> Dict[str, dict] | Tuple[Dict[str, dict], Dict[str, dict]]:
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

    movers: Dict[str, dict] = {}
    snapshots: Dict[str, dict] = {}

    # Get ET timezone for market hours check
    et = pytz.timezone('US/Eastern')
    now_et = datetime.now(et)

    market_open = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
    market_close = now_et.replace(hour=16, minute=0, second=0, microsecond=0)

    # Only run before market close (pre-market focus but still allow context if after open)
    if now_et >= market_close:
        print("  ⏰ Market already closed - skipping pre-market scan")
        return movers if not include_all_snapshots else (movers, snapshots)

    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)

            info = getattr(ticker, 'info', {}) or {}
            fast_info = getattr(ticker, 'fast_info', {}) or {}

            previous_close = fast_info.get('previousClose') or info.get('previousClose')
            if not previous_close:
                hist = ticker.history(period='5d')
                if hist.empty:
                    continue
                previous_close = float(hist['Close'].iloc[-1])

            premarket_price = info.get('preMarketPrice') or fast_info.get('lastPrice') or info.get('regularMarketPrice')
            regular_price = info.get('regularMarketPrice') or fast_info.get('lastPrice')
            postmarket_price = info.get('postMarketPrice')

            if not premarket_price and regular_price:
                premarket_price = regular_price

            if not premarket_price:
                continue

            gap = premarket_price - previous_close
            gap_pct = (gap / previous_close) * 100 if previous_close else 0
            gap_direction = 'up' if gap_pct > 0 else 'down' if gap_pct < 0 else 'flat'

            snapshot = {
                'symbol': symbol,
                'gap_pct': gap_pct,
                'gap_direction': gap_direction,
                'premarket_price': premarket_price,
                'previous_close': previous_close,
                'postmarket_price': postmarket_price,
                'regular_price': regular_price,
                'volume': info.get('volume') or info.get('preMarketVolume') or 0,
                'is_significant': abs(gap_pct) >= min_move_pct,
            }

            snapshots[symbol] = snapshot

            if snapshot['is_significant']:
                movers[symbol] = snapshot

                print(
                    f"  🔥 {symbol}: {gap_pct:+.1f}% gap {gap_direction} "
                    f"(${previous_close:.2f} → ${premarket_price:.2f})"
                )

        except Exception as e:
            # Silently skip errors
            pass

    if movers:
        print(f"✅ Found {len(movers)} pre-market movers")
    else:
        print("  No significant pre-market gaps detected")

    if include_all_snapshots:
        return movers, snapshots

    return movers



def generate_morning_brief(
    symbols: List[str],
    user_portfolio: Optional[Dict] = None
) -> Dict[str, any]:
    """Generate comprehensive morning brief with catalyst-aware context."""

    print("\n" + "=" * 60)
    print("🌅 GENERATING MORNING BRIEF")
    print("=" * 60)

    generated_at = datetime.now()
    now_et = datetime.now(ET_TZ)

    brief: Dict[str, any] = {
        'timestamp': generated_at,
        'uoa_signals': {},
        'earnings_today': [],
        'premarket_movers': {},
        'watchlist': [],
        'portfolio_alerts': [],
        'market_conditions': {},
        'market_snapshots': {},
        'symbol_summaries': {},
        'market_regime': {},
        'meta': {
            'generated_at_et': now_et.isoformat(),
            'conflicts': [],
        },
    }

    print("\n[1/5] Scanning for Unusual Options Activity...")
    flow_signals = detect_unusual_options_activity(symbols)
    brief['uoa_signals'] = flow_signals

    print("\n[2/5] Checking earnings calendar...")
    _, earnings_priority, earnings_dates = prioritize_by_earnings(symbols)

    print("\n[3/5] Scanning pre-market movers...")
    premarket_movers, market_snapshots = get_premarket_movers(
        symbols,
        include_all_snapshots=True
    )
    brief['premarket_movers'] = premarket_movers
    brief['market_snapshots'] = market_snapshots

    print("\n[4/5] Building signal summaries...")
    watchlist_set = set()
    symbol_summaries: Dict[str, Dict] = {}

    for symbol in symbols:
        flow_data = flow_signals.get(symbol)
        snapshot = market_snapshots.get(symbol)
        earnings_context = _classify_earnings_context(earnings_dates.get(symbol), now_et)

        summary = {
            'symbol': symbol,
            'flow_bias': flow_data.get('bias') if flow_data else 'none',
            'flow_confidence': flow_data.get('confidence') if flow_data else 'none',
            'flow_age_hours': flow_data.get('age_hours') if flow_data else None,
            'flow_as_of': flow_data.get('data_timestamp') if flow_data else None,
            'flow_session': flow_data.get('flow_session') if flow_data else None,
            'flow_status': 'active' if flow_data else 'no_signal',
            'warnings': list(flow_data.get('warnings', [])) if flow_data else [],
            'action_items': [],
            'market_snapshot': snapshot,
            'price_move': _format_price_move(snapshot),
            'earnings_context': earnings_context,
            'contradiction': False,
            'flow_confidence_rank': 0,
        }

        gap_pct = snapshot.get('gap_pct') if snapshot else None

        if flow_data:
            confidence = summary['flow_confidence'] or 'medium'

            if flow_data.get('age_hours', 0) >= 12:
                summary['warnings'].append('Flow is over 12 hours old - treat as stale unless confirmed at the open.')
                confidence = _degrade_confidence(confidence)
            if flow_data.get('age_hours', 0) >= 18:
                confidence = _degrade_confidence(confidence)

            if earnings_context['label'] in {'post_day0', 'post_day1'}:
                summary['warnings'].append('Earnings already released - thesis needs re-validation.')
                confidence = _degrade_confidence(confidence)
                summary['flow_status'] = 'under_review'

            contradiction = _should_flag_contradiction(summary['flow_bias'], gap_pct)
            summary['contradiction'] = contradiction

            if contradiction:
                summary['warnings'].append('Price action contradicts the prior flow - prioritize risk management.')
                confidence = _degrade_confidence(confidence)
                summary['flow_status'] = 'contradiction'
                brief['meta']['conflicts'].append(symbol)

            summary['flow_confidence'] = confidence

            if confidence == 'low':
                summary['action_items'].append('Flow confidence degraded - wait for new orders before adding risk.')

            if summary['flow_status'] in {'under_review', 'contradiction'}:
                summary['action_items'].append('Treat signal as neutral until the open proves the thesis.')

            if flow_data.get('age_hours', 0) >= 12:
                summary['action_items'].append("Do not chase yesterday's contracts without fresh confirmation.")

        if earnings_context['label'] in {'today', 'post_day0', 'post_day1'}:
            watchlist_set.add(symbol)
        if snapshot and snapshot.get('is_significant'):
            watchlist_set.add(symbol)
        if flow_data:
            watchlist_set.add(symbol)

        if earnings_context['label'] == 'today':
            brief['earnings_today'].append(symbol)

        if summary['flow_confidence'] in CONFIDENCE_ORDER:
            summary['flow_confidence_rank'] = len(CONFIDENCE_ORDER) - 1 - CONFIDENCE_ORDER.index(summary['flow_confidence'])

        symbol_summaries[symbol] = summary

    brief['symbol_summaries'] = symbol_summaries
    brief['watchlist'] = sorted(watchlist_set)
    brief['earnings_today'] = sorted(set(brief['earnings_today']))

    print("\n[5/5] Checking market conditions...")
    try:
        for index_symbol in ['SPY', 'QQQ']:
            ticker = yf.Ticker(index_symbol)
            hist = ticker.history(period='21d')
            if hist.empty:
                continue

            last_close = float(hist['Close'].iloc[-1])
            ma20 = float(hist['Close'].tail(20).mean()) if len(hist) >= 20 else last_close

            fast_info = getattr(ticker, 'fast_info', {}) or {}
            previous_close = fast_info.get('previousClose') or last_close
            last_price = fast_info.get('lastPrice') or fast_info.get('regularMarketPrice') or last_close

            change_pct = None
            if previous_close:
                change_pct = ((last_price - previous_close) / previous_close) * 100

            brief['market_conditions'][index_symbol] = {
                'price': last_price,
                'ma20': ma20,
                'trend': 'bullish' if last_price >= ma20 else 'bearish',
                'previous_close': previous_close,
                'change_pct': change_pct,
            }
    except Exception as e:
        print(f"⚠️  Could not fetch market conditions: {e}")

    brief['market_regime'] = _summarize_market_regime(brief['market_conditions'])

    brief['portfolio_alerts'] = _build_portfolio_alerts(user_portfolio, symbol_summaries)

    print("\n" + "=" * 60)
    print("✅ MORNING BRIEF COMPLETE")
    print("=" * 60)

    return brief


def format_brief_for_display(brief: Dict) -> str:
    """Format morning brief into a narrative summary."""
    output: List[str] = []

    def _format_flow_timestamp(ts: Optional[str]) -> Optional[str]:
        if not ts:
            return None
        try:
            parsed = datetime.fromisoformat(ts.replace('Z', '+00:00'))
            return parsed.astimezone(ET_TZ).strftime('%a %b %d %I:%M %p ET')
        except Exception:
            return None

    output.append('=' * 70)
    output.append('🌅 MORNING BRIEF')
    generated = brief.get('timestamp')
    if isinstance(generated, datetime):
        output.append(generated.strftime('Generated: %Y-%m-%d %I:%M %p ET'))
    else:
        output.append('Generated: unknown')
    output.append('=' * 70)
    output.append('')

    market_regime = brief.get('market_regime') or {}
    if market_regime:
        bias = market_regime.get('bias', 'neutral')
        bias_map = {'risk_off': '⚠️ Risk-Off', 'risk_on': '✅ Risk-On', 'neutral': '➖ Neutral'}
        output.append(f"MARKET REGIME: {bias_map.get(bias, '➖ Neutral')}")
        for note in market_regime.get('notes', []):
            output.append(f'  • {note}')
        output.append('')

    market_conditions = brief.get('market_conditions') or {}
    if market_conditions:
        output.append('INDEX CHECK')
        for index, data in market_conditions.items():
            price = data.get('price')
            change_pct = data.get('change_pct')
            change_text = f"{change_pct:+.2f}%" if change_pct is not None else 'n/a'
            if price is not None:
                output.append(f"  {index}: ${price:.2f} ({change_text} vs prev close)")
            else:
                output.append(f"  {index}: change {change_text}")
        output.append('')

    alerts = brief.get('portfolio_alerts') or []
    if alerts:
        output.append('🚨 POSITIONS TO MANAGE')
        for alert in alerts:
            urgency = alert.get('urgency', 'medium').upper()
            header = f"  {alert.get('symbol', '?')} — {alert.get('headline', 'Update')} [{urgency}]"
            output.append(header)
            if alert.get('price_move'):
                output.append(f"     Price: {alert['price_move']}")
            if alert.get('context'):
                output.append(f"     Context: {alert['context']}")
            if alert.get('details'):
                output.append(f"     Position: {alert['details']}")
            for action in alert.get('actions', []):
                output.append(f"     → {action}")
            output.append('')
    else:
        output.append('🚨 POSITIONS TO MANAGE')
        output.append('  None flagged this morning.')
        output.append('')

    conflicts = (brief.get('meta') or {}).get('conflicts') or []
    if conflicts:
        conflict_list = ', '.join(conflicts)
        output.append(f'⚠️ PRICE VS FLOW CONFLICT: {conflict_list}')
        output.append("  Price action is diverging from yesterday's positioning — trust the tape until new flow arrives.")
        output.append('')
    symbol_summaries = brief.get('symbol_summaries') or {}
    if symbol_summaries:
        output.append('SMART FLOW STATUS')
        earnings_note_map = {
            'post_day0': 'Post-earnings: thesis must prove itself today.',
            'post_day1': 'One day post-earnings — flow decays quickly.',
            'today': 'Reports today — expect volatility.',
        }
        summaries_sorted = sorted(
            symbol_summaries.values(),
            key=lambda s: (not s.get('contradiction', False), -s.get('flow_confidence_rank', 0), s.get('symbol', ''))
        )
        for summary in summaries_sorted[:6]:
            bias = summary.get('flow_bias', 'none')
            flow_status = summary.get('flow_status', 'no_signal')
            if bias == 'none' and flow_status == 'no_signal':
                continue
            label_map = {'bullish': '[BULL]', 'bearish': '[BEAR]', 'neutral': '[NEUTRAL]', 'none': '[WATCH]'}
            label = label_map.get(bias, '[WATCH]')
            confidence = summary.get('flow_confidence', 'none').upper()
            status_text = flow_status.replace('_', ' ').title()
            header = f"  {label} {summary.get('symbol', '?')} — {status_text} | CONF {confidence}"
            if summary.get('contradiction'):
                header = '  ⚠️ ' + header.strip()
            output.append(header)
            flow_time = _format_flow_timestamp(summary.get('flow_as_of'))
            if flow_time:
                age_hours = summary.get('flow_age_hours')
                age_text = f"{age_hours:.1f}h old" if isinstance(age_hours, (int, float)) else 'age unknown'
                output.append(f"     Flow from {flow_time} ({age_text})")
            if summary.get('price_move'):
                output.append(f"     Price check: {summary['price_move']}")
            earnings_label = (summary.get('earnings_context') or {}).get('label')
            if earnings_label in earnings_note_map:
                output.append(f"     📅 {earnings_note_map[earnings_label]}")
            for warn in summary.get('warnings', []):
                output.append(f"     ⚠️ {warn}")
            for action in summary.get('action_items', []):
                output.append(f"     → {action}")
            output.append('')

    movers = brief.get('premarket_movers') or {}
    if movers:
        output.append('PRE-MARKET MOVERS')
        movers_sorted = sorted(movers.values(), key=lambda m: abs(m.get('gap_pct', 0)), reverse=True)[:5]
        for mover in movers_sorted:
            symbol = mover.get('symbol')
            gap_pct = mover.get('gap_pct', 0)
            direction = '▲' if gap_pct > 0 else '▼'
            output.append(f"  {direction} {symbol}: {gap_pct:+.2f}% pre-market")
            prev_close = mover.get('previous_close')
            pre_price = mover.get('premarket_price')
            if prev_close and pre_price:
                output.append(f"     {prev_close:.2f} → {pre_price:.2f}")
        output.append('')

    earnings_today = brief.get('earnings_today') or []
    if earnings_today:
        output.append('EARNINGS TODAY')
        for symbol in earnings_today[:6]:
            output.append(f'  • {symbol}')
        output.append('')

    watchlist = brief.get('watchlist') or []
    if watchlist:
        display = ', '.join(watchlist[:10])
        output.append(f"Watchlist focus: {display}")
        output.append('')

    return '\n'.join(output)

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
