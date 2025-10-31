#!/usr/bin/env python3
"""
Update current prices and Greeks for open options positions.
"""

import sys
import json
import os
import random
import time
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd
import yfinance as yf

from src.cache import CacheResult, PositionPriceCache
from src.math.greeks import GreeksCalculator


CONTRACT_MULTIPLIER = 100

CACHE = PositionPriceCache.from_environment()
_TICKER_CACHE: Dict[str, yf.Ticker] = {}
_OPTION_CHAIN_CACHE: Dict[Tuple[str, str], Any] = {}
_PRICE_HISTORY_CACHE: Dict[Tuple[str, str, str, bool], pd.DataFrame] = {}
_EARNINGS_CONTEXT_CACHE: Dict[str, Optional[Dict[str, Any]]] = {}
_UPCOMING_EARNINGS_CACHE: Dict[str, Optional[Dict[str, Any]]] = {}

REQUEST_THROTTLE_SECONDS = max(float(os.getenv("POSITION_UPDATE_THROTTLE", "0.10")), 0.0)
REQUEST_THROTTLE_JITTER = max(float(os.getenv("POSITION_UPDATE_JITTER", "0.05")), 0.0)
MAX_RETRY_SLEEP_SECONDS = 4.0


def safe_float(value: Any) -> Optional[float]:
    """Safely convert value to float, handling None and NaN."""
    try:
        if value is None:
            return None
        if pd.isna(value):
            return None
        result = float(value)
        if result != result:  # NaN check
            return None
        return result
    except (TypeError, ValueError):
        return None


def safe_int(value: Any) -> int:
    """Safely convert value to int, returning 0 for invalid values."""
    try:
        if value in (None, "", False):
            return 0
        if pd.isna(value):
            return 0
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _normalize_strike(strike: Any) -> str:
    """Normalize strike prices for cache keys."""

    try:
        return f"{float(strike):.4f}"
    except (TypeError, ValueError):
        return str(strike)


def _rate_limit_wait(attempt: int) -> None:
    """Sleep with exponential backoff and jitter when rate limited."""

    base_delay = min((2 ** attempt) * 0.5, MAX_RETRY_SLEEP_SECONDS)
    jitter = random.uniform(0, REQUEST_THROTTLE_JITTER or 0.05)
    time.sleep(base_delay + jitter)


def _is_rate_limit_error(error: Exception) -> bool:
    """Determine whether an exception likely represents a rate limit."""

    message = str(error).lower()
    return "429" in message or "too many requests" in message or "rate limit" in message


def _get_cached_ticker(symbol: str) -> yf.Ticker:
    """Return a shared yfinance ticker instance for the symbol."""

    ticker = _TICKER_CACHE.get(symbol)
    if ticker is None:
        ticker = yf.Ticker(symbol)
        _TICKER_CACHE[symbol] = ticker
    return ticker


def _log_cache_use(prefix: str, cache: CacheResult, *, symbol: str, strike: float, option_type: str) -> None:
    """Emit a consistent log message when falling back to cached data."""

    age_minutes = cache.age_seconds / 60.0
    print(
        f"{prefix} {symbol} ${strike} {option_type.lower()} ({age_minutes:.1f} min old)",
        file=sys.stderr,
    )


def _format_currency(value: Optional[float]) -> str:
    """Format a dollar value with sign for user-facing messages."""

    if value is None:
        return "$0"
    sign = "-" if value < 0 else ""
    return f"{sign}${abs(value):,.0f}"


def _get_stock_price(symbol: str, ticker: yf.Ticker) -> float:
    """Fetch or reuse the underlying stock price for a symbol."""

    cache_entry = CACHE.get_stock(symbol, allow_stale=True)
    stale_entry: CacheResult | None = None

    if cache_entry:
        cached_price = safe_float(cache_entry.value)
        if cached_price is not None:
            if cache_entry.is_stale:
                stale_entry = cache_entry
            else:
                return cached_price

    try:
        stock_info = ticker.history(period='1d')
        if stock_info.empty:
            info = ticker.info
            stock_price = safe_float(
                info.get('currentPrice')
                or info.get('regularMarketPrice')
                or info.get('previousClose')
            )
            if stock_price is None:
                raise RuntimeError(f"No stock data for {symbol}")
        else:
            stock_price = safe_float(stock_info['Close'].iloc[-1])

        if stock_price is None:
            raise RuntimeError(f"No stock data for {symbol}")

        CACHE.set_stock(symbol, stock_price)
        return float(stock_price)
    except Exception as error:
        if stale_entry is not None and safe_float(stale_entry.value) is not None:
            age_minutes = stale_entry.age_seconds / 60.0
            print(
                f"⚠️  Using cached stock price for {symbol} ({age_minutes:.1f} min old) due to error: {error}",
                file=sys.stderr,
            )
            return float(safe_float(stale_entry.value))
        raise


def _load_option_chain(symbol: str, expiration_key: str, ticker: yf.Ticker):
    """Load the option chain for a symbol/expiration with in-process caching."""

    cache_key = (symbol.upper(), expiration_key)
    if cache_key in _OPTION_CHAIN_CACHE:
        return _OPTION_CHAIN_CACHE[cache_key]

    options = ticker.option_chain(expiration_key)
    _OPTION_CHAIN_CACHE[cache_key] = options
    return options


def _get_price_history(symbol: str, *, period: str, interval: str, prepost: bool = False) -> pd.DataFrame:
    """Return cached historical price data for the requested window."""

    cache_key = (symbol.upper(), period, interval, prepost)
    cached = _PRICE_HISTORY_CACHE.get(cache_key)
    if cached is not None:
        return cached

    ticker = _get_cached_ticker(symbol)
    try:
        history = ticker.history(period=period, interval=interval, prepost=prepost)
    except Exception as error:
        print(
            f"Warning: failed to load history for {symbol} ({period}/{interval}, prepost={prepost}): {error}",
            file=sys.stderr,
        )
        history = pd.DataFrame()

    if not history.empty:
        try:
            history = history.tz_convert(None)
        except Exception:
            try:
                history = history.tz_localize(None)
            except Exception:
                pass

    _PRICE_HISTORY_CACHE[cache_key] = history
    return history


def _analyze_recent_earnings(
    symbol: str,
    *,
    current_stock_price: Optional[float],
    entry_iv: Optional[float],
    current_iv: Optional[float],
) -> Optional[Dict[str, Any]]:
    """Return earnings reaction context when an event occurred within 24 hours."""

    cached = _EARNINGS_CONTEXT_CACHE.get(symbol.upper())
    if cached is not None:
        return cached

    ticker = _get_cached_ticker(symbol)
    try:
        earnings_df = ticker.get_earnings_dates(limit=4)
    except Exception as error:
        print(f"Warning: failed to fetch earnings dates for {symbol}: {error}", file=sys.stderr)
        _EARNINGS_CONTEXT_CACHE[symbol.upper()] = None
        return None

    if earnings_df is None or earnings_df.empty:
        _EARNINGS_CONTEXT_CACHE[symbol.upper()] = None
        return None

    now_utc = datetime.utcnow()
    recent_event: Optional[datetime] = None

    for index_value in earnings_df.index.sort_values(ascending=False):
        event_ts = pd.to_datetime(index_value)
        if pd.isna(event_ts):
            continue
        if event_ts.tzinfo is not None:
            event_ts = event_ts.tz_convert(None)
        event_ts = event_ts.to_pydatetime()
        if event_ts > now_utc:
            continue
        if now_utc - event_ts <= timedelta(hours=24):
            recent_event = event_ts
            break

    if recent_event is None:
        _EARNINGS_CONTEXT_CACHE[symbol.upper()] = None
        return None

    history = _get_price_history(symbol, period='5d', interval='30m', prepost=True)
    pre_event_close: Optional[float] = None
    after_hours_high: Optional[float] = None
    if not history.empty:
        pre_window = history[history.index <= recent_event]
        if not pre_window.empty:
            pre_event_close = safe_float(pre_window['Close'].iloc[-1])

        post_window = history[(history.index >= recent_event) & (history.index <= recent_event + timedelta(days=1))]
        if not post_window.empty:
            after_hours_high = safe_float(post_window['High'].max())

        if current_stock_price is None and not history.empty:
            current_stock_price = safe_float(history['Close'].iloc[-1])

    giveback_ratio: Optional[float] = None
    if (
        pre_event_close is not None
        and after_hours_high is not None
        and current_stock_price is not None
        and after_hours_high > pre_event_close
    ):
        range_move = after_hours_high - pre_event_close
        if range_move > 0:
            giveback_ratio = max(0.0, min(1.0, (after_hours_high - current_stock_price) / range_move))

    iv_crush_pct: Optional[float] = None
    if entry_iv is not None and entry_iv > 0 and current_iv is not None:
        iv_crush_pct = ((entry_iv - current_iv) / entry_iv) * 100

    context = {
        'event_time': recent_event.isoformat(),
        'pre_event_close': pre_event_close,
        'after_hours_high': after_hours_high,
        'giveback_ratio': giveback_ratio,
        'iv_crush_pct': iv_crush_pct,
        'current_stock_price': current_stock_price,
    }

    _EARNINGS_CONTEXT_CACHE[symbol.upper()] = context
    return context


def _get_upcoming_earnings(symbol: str) -> Optional[Dict[str, Any]]:
    """Return the next earnings event for the symbol if it is upcoming."""

    cached = _UPCOMING_EARNINGS_CACHE.get(symbol.upper())
    if cached is not None:
        return cached

    ticker = _get_cached_ticker(symbol)
    try:
        earnings_df = ticker.get_earnings_dates(limit=6)
    except Exception as error:
        print(f"Warning: failed to fetch upcoming earnings for {symbol}: {error}", file=sys.stderr)
        _UPCOMING_EARNINGS_CACHE[symbol.upper()] = None
        return None

    if earnings_df is None or earnings_df.empty:
        _UPCOMING_EARNINGS_CACHE[symbol.upper()] = None
        return None

    now_utc = datetime.utcnow()
    next_event: Optional[datetime] = None

    for index_value in earnings_df.index.sort_values():
        event_ts = pd.to_datetime(index_value)
        if pd.isna(event_ts):
            continue
        if event_ts.tzinfo is not None:
            event_ts = event_ts.tz_convert(None)
        candidate = event_ts.to_pydatetime()
        if candidate <= now_utc:
            continue
        next_event = candidate
        break

    if next_event is None:
        _UPCOMING_EARNINGS_CACHE[symbol.upper()] = None
        return None

    hours_until = (next_event - now_utc).total_seconds() / 3600.0
    context = {
        'event_time': next_event.isoformat(),
        'event_datetime': next_event,
        'hours_until': hours_until,
        'type': 'earnings',
    }

    _UPCOMING_EARNINGS_CACHE[symbol.upper()] = context
    return context


def _approximate_option_value(
    current_price: Optional[float],
    *,
    delta: Optional[float],
    stock_price: Optional[float],
    stock_move_pct: float,
    implied_volatility_change_pct: Optional[float] = None,
) -> Optional[float]:
    """Roughly approximate an option's value after a stock/IV change."""

    if current_price is None or delta is None or stock_price is None:
        return None

    estimate = current_price + (delta * stock_price * stock_move_pct)
    if implied_volatility_change_pct is not None:
        estimate *= max(0.0, 1 + implied_volatility_change_pct)

    return max(0.0, round(estimate, 2))


def _build_earnings_scenarios(
    *,
    current_price: Optional[float],
    delta: Optional[float],
    stock_price: Optional[float],
    contracts: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Return simplified option valuation scenarios for an earnings event."""

    scenarios: List[Dict[str, Any]] = []
    if current_price is None or delta is None or stock_price is None:
        return scenarios

    templates = [
        {
            'id': 'pop_hold',
            'label': 'Beat & +5% gap',
            'stock_move_pct': 0.05,
            'iv_change_pct': -0.15,
            'summary': 'Gap up holds into open',
        },
        {
            'id': 'pop_fade',
            'label': 'Beat but fade',
            'stock_move_pct': 0.0,
            'iv_change_pct': -0.35,
            'summary': 'Gap fades, IV crushed',
        },
        {
            'id': 'miss',
            'label': 'Miss & -5% drop',
            'stock_move_pct': -0.05,
            'iv_change_pct': -0.25,
            'summary': 'Gap down with IV reset',
        },
    ]

    contract_count = contracts if contracts and contracts > 0 else 1

    for template in templates:
        estimate = _approximate_option_value(
            current_price,
            delta=delta,
            stock_price=stock_price,
            stock_move_pct=template['stock_move_pct'],
            implied_volatility_change_pct=template['iv_change_pct'],
        )
        if estimate is None:
            continue
        pl_change = round((estimate - current_price) * CONTRACT_MULTIPLIER * contract_count, 2)
        scenarios.append(
            {
                'id': template['id'],
                'label': template['label'],
                'summary': template['summary'],
                'estimated_option_value': estimate,
                'estimated_pl': pl_change,
            }
        )

    return scenarios


def _generate_volatility_timeline(event_time: datetime, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """Build checkpoint messages heading into and out of a binary event."""

    if now is None:
        now = datetime.utcnow()

    timeline: List[Dict[str, Any]] = []
    delta_hours = (event_time - now).total_seconds() / 3600.0

    checkpoints = [
        (24, 'T-24h: Last regular session before catalyst'),
        (8, 'T-8h: Confirm exit or hedge plan'),
        (1, 'T-1h: Decide before market close'),
        (-1, 'T+1h: Re-evaluate thesis with new data'),
        (-24, 'T+1d: Prep for open gap follow-through'),
    ]

    for hours, message in checkpoints:
        if hours > 0 and delta_hours <= hours:
            timeline.append({'label': f'T-{hours}h', 'message': message})
        elif hours <= 0 and delta_hours <= 0:
            timeline.append({'label': f'T+{abs(hours)}h', 'message': message})

    return timeline


def _estimate_break_even_stock_price(
    position: Dict[str, Any], current_data: Dict[str, Any], days_forward: int
) -> Optional[float]:
    """Estimate stock price needed to return option to breakeven within a horizon."""

    entry_price = safe_float(position.get('entry_price'))
    current_option_price = safe_float(current_data.get('current_price'))
    theta = safe_float(current_data.get('theta')) or 0.0
    delta = safe_float(current_data.get('delta'))
    stock_price = (
        safe_float(current_data.get('stock_price'))
        or safe_float(position.get('current_stock_price'))
        or safe_float(position.get('entry_stock_price'))
    )

    if (
        entry_price is None
        or current_option_price is None
        or stock_price is None
        or delta is None
        or abs(delta) < 1e-3
    ):
        return None

    projected_price = current_option_price + theta * days_forward
    required_option_gain = entry_price - projected_price
    if required_option_gain <= 0:
        return None

    stock_move = required_option_gain / abs(delta)
    if position.get('option_type', '').lower() == 'call':
        return stock_price + stock_move
    else:
        return stock_price - stock_move


def _extract_tags(position: Dict[str, Any]) -> List[str]:
    """Return normalized tags array from the position payload."""

    tags = position.get('tags')
    if isinstance(tags, list):
        return [str(tag).lower() for tag in tags if tag]
    if isinstance(tags, str):
        return [part.strip().lower() for part in tags.split(',') if part.strip()]
    return []


def _has_flow_thesis(position: Dict[str, Any]) -> bool:
    """Determine if the position was driven by an unusual flow thesis."""

    tags = _extract_tags(position)
    return any(
        keyword in tag
        for tag in tags
        for keyword in ('flow', 'unusual-volume', 'smart-money', 'uoa')
    )


def _detect_flow_thesis_failure(symbol: str, entry_stock_price: Optional[float]) -> Optional[Dict[str, Any]]:
    """Detect failed breakout patterns after unusual flow bets."""

    if entry_stock_price is None:
        return None

    history = _get_price_history(symbol, period='5d', interval='30m', prepost=False)
    if history.empty or 'High' not in history or 'Close' not in history or 'Open' not in history:
        return None

    recent_high_idx = history['High'].idxmax()
    recent_high_ts = pd.to_datetime(recent_high_idx)
    try:
        high_time = recent_high_ts.to_pydatetime()
    except Exception:
        return None
    if high_time.tzinfo is not None:
        high_time = high_time.replace(tzinfo=None)

    recent_high = safe_float(history.loc[recent_high_idx, 'High'])
    if recent_high is None or recent_high <= entry_stock_price:
        return None

    now = datetime.utcnow()
    if now - high_time > timedelta(hours=48):
        return None

    current_price = safe_float(history['Close'].iloc[-1])
    if current_price is None or current_price >= entry_stock_price:
        return None

    post_high = history.loc[recent_high_idx:]
    down_bars = post_high[post_high['Close'] < post_high['Open']]
    if down_bars.empty or 'Volume' not in down_bars:
        return None

    prior_window = history.loc[:recent_high_idx]
    prior_window = prior_window[prior_window.index >= (recent_high_ts - pd.Timedelta(hours=6))]

    down_volume = safe_float(down_bars['Volume'].mean())
    prior_volume = safe_float(prior_window['Volume'].mean()) if 'Volume' in prior_window else None

    if down_volume is None or prior_volume is None or down_volume >= prior_volume:
        return None

    return {
        'recent_high': recent_high,
        'high_time': high_time.isoformat(),
        'current_price': current_price,
        'down_volume': down_volume,
        'prior_volume': prior_volume,
    }

def parse_expiration_date(expiration: Any) -> date:
    """Parse various expiration formats stored in the database."""
    if isinstance(expiration, date) and not isinstance(expiration, datetime):
        return expiration

    if isinstance(expiration, datetime):
        return expiration.date()

    if not isinstance(expiration, str):
        raise ValueError(f"Unsupported expiration type: {type(expiration)!r}")

    text = expiration.strip()
    if not text:
        raise ValueError("Empty expiration string")

    normalized = text.replace('Z', '+00:00')

    try:
        return datetime.fromisoformat(normalized).date()
    except ValueError:
        pass

    for candidate in (text.split('T')[0], text.split(' ')[0]):
        if candidate != text:
            try:
                return datetime.strptime(candidate, '%Y-%m-%d').date()
            except ValueError:
                continue

    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y'):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    raise ValueError(f"Could not parse expiration date: {expiration}")


def fetch_option_data(
    symbol: str,
    strike: float,
    expiration: Any,
    option_type: str,
    retry_count: int = 3,
) -> Optional[Dict[str, Any]]:
    """Fetch option pricing data with caching and graceful fallbacks."""

    try:
        exp_date = parse_expiration_date(expiration)
    except ValueError as error:
        print(f"Warning: invalid expiration for {symbol}: {error}", file=sys.stderr)
        return None

    try:
        strike_value = float(strike)
    except (TypeError, ValueError):
        print(f"Warning: invalid strike for {symbol}: {strike}", file=sys.stderr)
        return None

    expiration_key = exp_date.strftime('%Y-%m-%d')
    option_type_normalized = option_type.lower()
    cache_key = PositionPriceCache.contract_key(
        symbol,
        expiration_key,
        _normalize_strike(strike_value),
        option_type_normalized,
    )

    cached_contract = CACHE.get_contract(cache_key, allow_stale=True)
    if cached_contract and not cached_contract.is_stale:
        return dict(cached_contract.value)

    stale_contract = cached_contract if cached_contract else None
    ticker = _get_cached_ticker(symbol)

    for attempt in range(retry_count):
        try:
            stock_price = _get_stock_price(symbol, ticker)

            options = _load_option_chain(symbol, expiration_key, ticker)
            chain = options.calls if option_type_normalized == 'call' else options.puts

            if chain.empty:
                raise RuntimeError(f"Empty {option_type_normalized} chain for {symbol} {expiration_key}")

            contract = chain[chain['strike'] == strike_value]
            if contract.empty:
                strikes = chain['strike'].values
                if len(strikes) == 0:
                    raise RuntimeError(f"No strikes for {symbol} {expiration_key}")

                closest_strike = min(strikes, key=lambda x: abs(x - strike_value))
                tolerance = max(0.05, abs(strike_value) * 0.001)
                if abs(closest_strike - strike_value) <= tolerance:
                    contract = chain[chain['strike'] == closest_strike]
                    print(
                        f"Info: Using closest strike {closest_strike} for {symbol} (requested {strike_value})",
                        file=sys.stderr,
                    )
                else:
                    raise RuntimeError(
                        f"Contract not found for {symbol} ${strike_value} {option_type_normalized} {expiration_key}"
                    )

            row = contract.iloc[0]

            last_price = safe_float(row['lastPrice'])
            mark_price = safe_float(row.get('mark'))
            bid = safe_float(row.get('bid'))
            ask = safe_float(row.get('ask'))

            # Determine best price to use - prefer mark/midpoint over lastPrice
            # lastPrice can be stale (hours old), mark is current bid/ask midpoint
            current_price = None

            # 1. Try mark price (if yfinance provides it)
            if mark_price and mark_price > 0:
                current_price = mark_price
            # 2. Calculate mark from bid/ask
            elif bid and ask and bid > 0 and ask > 0:
                current_price = (bid + ask) / 2
            # 3. Fall back to last traded price
            elif last_price and last_price > 0:
                current_price = last_price
            # 4. Use bid or ask alone if nothing else
            elif bid and bid > 0:
                current_price = bid
            elif ask and ask > 0:
                current_price = ask
            else:
                raise RuntimeError(
                    f"No usable price for {symbol} ${strike_value} {option_type_normalized} {expiration_key}"
                )

            # Fill in missing bid/ask
            if not bid or bid <= 0:
                bid = current_price * 0.95
            if not ask or ask <= 0:
                ask = current_price * 1.05

            volume = safe_int(row.get('volume'))
            open_interest = safe_int(row.get('openInterest'))
            implied_volatility = safe_float(row.get('impliedVolatility'))
            if implied_volatility is None:
                implied_volatility = 0.5

            calculator = GreeksCalculator(risk_free_rate=0.045)

            days_to_expiry = (exp_date - date.today()).days
            time_to_expiry = max(days_to_expiry / 365.0, 0.001)

            greeks = calculator.calculate_all_greeks(
                option_type=option_type_normalized,
                stock_price=stock_price,
                strike_price=strike_value,
                time_to_expiration=time_to_expiry,
                volatility=implied_volatility,
            )

            result = {
                'current_price': float(current_price),
                'bid': float(bid),
                'ask': float(ask),
                'volume': volume,
                'open_interest': open_interest,
                'implied_volatility': float(implied_volatility),
                'stock_price': float(stock_price),
                'delta': greeks.delta,
                'theta': greeks.theta,
                'gamma': greeks.gamma,
                'vega': greeks.vega,
            }

            CACHE.set_contract(cache_key, result)
            return dict(result)

        except Exception as error:
            is_rate_limited = _is_rate_limit_error(error)
            if stale_contract and (is_rate_limited or attempt == retry_count - 1):
                _log_cache_use(
                    "⚠️  Using cached option snapshot for",
                    stale_contract,
                    symbol=symbol,
                    strike=strike_value,
                    option_type=option_type_normalized,
                )
                return dict(stale_contract.value)

            if attempt < retry_count - 1:
                if is_rate_limited:
                    _rate_limit_wait(attempt)
                else:
                    time.sleep(0.5 + attempt * 0.5)
                continue

            print(f"Error fetching option data for {symbol}: {error}", file=sys.stderr)
            return None

    return None


def calculate_pl(entry_price: float, current_price: float, contracts: int) -> Dict[str, float]:
    """
    Calculate profit/loss for a position.

    Args:
        entry_price: Entry price per contract
        current_price: Current price per contract
        contracts: Number of contracts

    Returns:
        Dictionary with unrealized P&L amount and percentage
    """
    contract_value = max(contracts, 0) * CONTRACT_MULTIPLIER
    if contract_value == 0:
        return {
            'unrealized_pl': 0.0,
            'unrealized_pl_percent': 0.0,
        }

    cost_basis = entry_price * contract_value
    current_value = current_price * contract_value
    pl_amount = current_value - cost_basis
    pl_percent = (pl_amount / cost_basis) * 100 if cost_basis > 0 else 0

    return {
        'unrealized_pl': pl_amount,
        'unrealized_pl_percent': pl_percent
    }


def calculate_exit_signal(
    position: Dict[str, Any],
    current_data: Dict[str, Any],
    pl_data: Dict[str, float],
    peak_metrics: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Calculate exit signal based on multiple risk factors.

    Args:
        position: Position data with entry details
        current_data: Current market data with Greeks
        pl_data: P&L data with unrealized gains/losses

    Returns:
        Dictionary with exit_signal, exit_urgency_score, and exit_reasons
    """
    reasons: List[str] = []
    urgency_score = 0
    forced_signal: Optional[str] = None
    insights: List[Dict[str, Any]] = []

    raw_pending_alerts = position.get('pending_alerts')
    pending_alerts: List[Dict[str, Any]] = []
    existing_alert_ids: Set[str] = set()
    if isinstance(raw_pending_alerts, list):
        for alert in raw_pending_alerts:
            if isinstance(alert, dict) and alert.get('id'):
                pending_alerts.append(dict(alert))
                existing_alert_ids.add(str(alert['id']))

    last_alert_threshold = safe_float(position.get('last_profit_alert_threshold')) or 0.0
    last_profit_alert_at_raw = position.get('last_profit_alert_at')
    if isinstance(last_profit_alert_at_raw, datetime):
        last_profit_alert_at: Optional[str] = last_profit_alert_at_raw.isoformat()
    elif last_profit_alert_at_raw:
        last_profit_alert_at = str(last_profit_alert_at_raw)
    else:
        last_profit_alert_at = None

    last_catalyst_review_raw = position.get('last_catalyst_review')
    if isinstance(last_catalyst_review_raw, datetime):
        last_catalyst_review: Optional[str] = last_catalyst_review_raw.isoformat()
    elif last_catalyst_review_raw is not None:
        last_catalyst_review = str(last_catalyst_review_raw)
    else:
        last_catalyst_review = None

    pl_percent = float(pl_data.get('unrealized_pl_percent') or 0.0)
    pl_amount = float(pl_data.get('unrealized_pl') or 0.0)
    delta = safe_float(current_data.get('delta')) or 0.0
    theta = safe_float(current_data.get('theta')) or 0.0
    current_option_price = safe_float(current_data.get('current_price'))
    current_stock_price = (
        safe_float(current_data.get('stock_price'))
        or safe_float(position.get('current_stock_price'))
        or safe_float(position.get('entry_stock_price'))
    )

    expiration_date = parse_expiration_date(position['expiration'])
    dte = (expiration_date - date.today()).days

    # Real-time profit alerts for key thresholds
    alert_thresholds = [10, 15, 25, 50]
    thresholds_crossed: List[float] = []
    for threshold in alert_thresholds:
        if pl_percent >= threshold and threshold > last_alert_threshold + 1e-6:
            thresholds_crossed.append(threshold)
            alert_id = f'profit-threshold-{int(threshold)}'
            if alert_id not in existing_alert_ids:
                pending_alerts.append(
                    {
                        'id': alert_id,
                        'type': 'profit_alert',
                        'severity': 'critical' if dte < 21 else 'high',
                        'summary': f"Position up {pl_percent:.1f}% ({_format_currency(pl_amount)})",
                        'detail': 'Review exit plan now to keep gains. Consider a trailing stop or scaling out.',
                        'threshold': threshold,
                        'triggered_at': datetime.utcnow().isoformat(),
                    }
                )
                existing_alert_ids.add(alert_id)

    if thresholds_crossed:
        last_alert_threshold = max(thresholds_crossed)
        last_profit_alert_at = datetime.utcnow().isoformat()

    if pl_percent > 0:
        insights.append(
            {
                'id': 'profit-monitor',
                'type': 'status',
                'severity': 'info',
                'summary': f"Unrealized gain {_format_currency(pl_amount)} (+{pl_percent:.1f}%)",
                'detail': 'Lock in profits intentionally. Tap for suggested exit tactics.',
            }
        )

    # Baseline risk management rules
    if pl_percent >= 50:
        reasons.append('profit_target_hit')
        urgency_score += 35

    if pl_percent <= -50:
        reasons.append('stop_loss_triggered')
        urgency_score += 50
    elif pl_percent <= -30:
        reasons.append('moderate_loss')
        urgency_score += 25

    if dte < 7 and abs(delta) < 0.15:
        reasons.append('theta_decay_warning')
        urgency_score += 30

    if dte < 3:
        reasons.append('expiration_imminent')
        urgency_score += 40

    if abs(delta) < 0.05 and pl_percent < 0:
        reasons.append('deep_otm')
        urgency_score += 20

    if theta < -0.10 and dte < 14:
        reasons.append('high_theta_decay')
        urgency_score += 15

    # Post-earnings rejection detection
    earnings_context = _analyze_recent_earnings(
        position['symbol'],
        current_stock_price=current_stock_price,
        entry_iv=safe_float(position.get('entry_iv')),
        current_iv=safe_float(current_data.get('implied_volatility')),
    )
    if earnings_context:
        last_catalyst_review = datetime.utcnow().isoformat()
        giveback_ratio = earnings_context.get('giveback_ratio')
        iv_crush_pct = earnings_context.get('iv_crush_pct')

        if giveback_ratio is not None:
            giveback_pct = giveback_ratio * 100
            reasons.append(
                f"Earnings pop rejected - thesis broken ({giveback_pct:.0f}% giveback)"
            )
            if giveback_ratio >= 0.5:
                urgency_score = max(urgency_score, 85)
                forced_signal = 'exit_now'
            else:
                urgency_score = max(urgency_score, 65)
                if forced_signal != 'exit_now':
                    forced_signal = 'consider'
        else:
            reasons.append('Earnings catalyst faded - reassess momentum')
            urgency_score = max(urgency_score, 55)
            if forced_signal != 'exit_now':
                forced_signal = 'consider'

        if iv_crush_pct is not None:
            if iv_crush_pct > 0:
                reasons.append(f"IV crush after earnings: {iv_crush_pct:.1f}% vs entry")
            else:
                reasons.append(f"IV change after earnings: {iv_crush_pct:.1f}% vs entry")

        after_hours_high = safe_float(earnings_context.get('after_hours_high'))
        pre_event_close = safe_float(earnings_context.get('pre_event_close'))
        if after_hours_high and pre_event_close and after_hours_high > pre_event_close:
            ah_gain = after_hours_high - pre_event_close
            giveback_dollars = after_hours_high - (current_stock_price or after_hours_high)
            iv_crush = safe_float(earnings_context.get('iv_crush_pct')) or 0.0
            expected_option_floor = None
            if current_option_price is not None and iv_crush > 0:
                expected_option_floor = max(0.0, current_option_price * (1 - min(iv_crush / 100.0, 0.9)))
            insights.append(
                {
                    'id': 'after-hours-reality-check',
                    'type': 'education',
                    'severity': 'high' if giveback_ratio and giveback_ratio >= 0.5 else 'medium',
                    'summary': 'After-hours pop is not locked in',
                    'detail': (
                        "Options settle at the open. If price fades below the after-hours high,"
                        " plan an exit."
                    ),
                    'context': {
                        'after_hours_gain': ah_gain,
                        'giveback_from_high': giveback_dollars,
                        'expected_option_floor': expected_option_floor,
                    },
                }
            )

    upcoming_event = _get_upcoming_earnings(position['symbol'])
    upcoming_event_hours: Optional[float] = None
    upcoming_event_iso: Optional[str] = None
    if upcoming_event:
        upcoming_event_hours = safe_float(upcoming_event.get('hours_until'))
        event_dt = upcoming_event.get('event_datetime')
        if isinstance(event_dt, datetime):
            upcoming_event_iso = event_dt.isoformat()
        elif isinstance(upcoming_event.get('event_time'), str):
            upcoming_event_iso = str(upcoming_event['event_time'])

    # Theta acceleration for short-dated losers
    if (
        dte <= 14
        and pl_percent <= -10
        and current_option_price is not None
        and current_option_price > 0
    ):
        theta_burn_pct = abs(theta) / current_option_price * 100
        if theta_burn_pct > 2:
            urgency_score += 15
            reasons.append(
                f"Theta burning {theta_burn_pct:.1f}% per day - recovery window closing"
            )
            breakeven_targets: List[str] = []
            for horizon in (3, 7):
                if dte >= horizon:
                    estimate = _estimate_break_even_stock_price(position, current_data, horizon)
                    if estimate is not None:
                        breakeven_targets.append(f"T+{horizon} ${estimate:.2f}")
            if breakeven_targets:
                reasons.append('Breakeven targets: ' + ', '.join(breakeven_targets))

    # Failed flow thesis override
    if _has_flow_thesis(position):
        flow_context = _detect_flow_thesis_failure(
            position['symbol'], safe_float(position.get('entry_stock_price'))
        )
        if flow_context:
            reasons.append('Flow thesis invalidated - smart money exited')
            urgency_score = max(urgency_score, 60)
            if forced_signal != 'exit_now':
                forced_signal = 'consider'

    # Profit protection when gains evaporate
    if peak_metrics is None:
        peak_metrics = {}
    peak_pl_percent = safe_float(peak_metrics.get('peak_unrealized_pl_percent')) or 0.0

    if peak_pl_percent >= 15 and pl_percent < 0:
        reasons.append(f"Gave back +{peak_pl_percent:.1f}% to {pl_percent:.1f}% - second chance exit")
        urgency_score += 20
        if dte < 21:
            reasons.append('Near expiration - treat as second chance exit')
            urgency_score = max(urgency_score, 80)
            if forced_signal != 'exit_now':
                forced_signal = 'consider'

    # Pre-earnings risk calculator & nudges
    if upcoming_event_hours is not None:
        scenarios = _build_earnings_scenarios(
            current_price=current_option_price,
            delta=delta,
            stock_price=current_stock_price,
            contracts=safe_int(position.get('contracts')),
        )
        hours = upcoming_event_hours
        if hours <= 48:
            severity = 'critical' if hours <= 24 else 'high'
            insights.append(
                {
                    'id': 'pre-earnings-risk',
                    'type': 'planner',
                    'severity': severity,
                    'summary': f"Earnings in {hours:.0f}h - define your gap plan",
                    'detail': (
                        "If you hold through earnings, know what outcomes you are betting on."
                    ),
                    'context': {
                        'current_pl': pl_amount,
                        'current_pl_percent': pl_percent,
                        'scenarios': scenarios,
                        'event_time': upcoming_event_iso,
                    },
                }
            )

            if hours <= 24:
                urgency_score = max(urgency_score, 65)
                if forced_signal != 'exit_now':
                    forced_signal = 'consider'

            if scenarios:
                insights.append(
                    {
                        'id': 'regret-minimizer',
                        'type': 'mindset',
                        'severity': 'high',
                        'summary': 'Which regret stings more?',
                        'detail': (
                            "Exit now to bank the gain, or hold and risk giving it back."
                            " Use the scenario table to decide."
                        ),
                        'context': {
                            'exit_now_gain': pl_amount,
                            'hold_outcomes': scenarios,
                        },
                    }
                )

            if pl_percent >= 15:
                insights.append(
                    {
                        'id': 'blunt-truth',
                        'type': 'warning',
                        'severity': 'critical' if hours <= 24 else 'high',
                        'summary': '⚠️ Earnings hold = new bet with existing profits',
                        'detail': (
                            "You are gambling with your unrealized gains. Professionals trim 50-75%"
                            " before binary events."
                        ),
                    }
                )
                if hours <= 24:
                    urgency_score = max(urgency_score, 75)
                    if forced_signal != 'exit_now':
                        forced_signal = 'consider'

        if pl_percent >= 15 and dte < 30 and hours <= 120:
            lock_in = pl_amount * 0.5
            insights.append(
                {
                    'id': 'scale-out-nudge',
                    'type': 'action',
                    'severity': 'high',
                    'summary': 'Take some off before the catalyst',
                    'detail': (
                        f"Consider selling half to lock in {_format_currency(lock_in)} while keeping upside."
                    ),
                }
            )

        if pl_percent > 0 and hours <= 72:
            trailing_lock = max(0.0, pl_amount * 0.5)
            insights.append(
                {
                    'id': 'trailing-stop-suggestion',
                    'type': 'action',
                    'severity': 'medium',
                    'summary': 'Protect gains with a trailing stop',
                    'detail': (
                        f"Trail at ~50% of profit to keep at least {_format_currency(trailing_lock)} if volatility hits."
                    ),
                }
            )

        if upcoming_event_iso:
            timeline_dt: Optional[datetime] = None
            try:
                timestamp = pd.to_datetime(upcoming_event_iso)
                if hasattr(timestamp, 'to_pydatetime'):
                    timeline_dt = timestamp.to_pydatetime()
                elif isinstance(timestamp, datetime):
                    timeline_dt = timestamp
            except Exception:
                timeline_dt = None

            if timeline_dt:
                timeline = _generate_volatility_timeline(timeline_dt)
                if timeline:
                    insights.append(
                        {
                            'id': 'volatility-timeline',
                            'type': 'timeline',
                            'severity': 'info',
                            'summary': 'Volatility event checklist',
                            'detail': 'Key decision checkpoints around the catalyst.',
                            'context': {'timeline': timeline, 'event_time': upcoming_event_iso},
                        }
                    )

    # Determine exit signal based on urgency score and overrides
    if urgency_score >= 70:
        exit_signal = 'exit_now'
    elif urgency_score >= 35:
        exit_signal = 'consider'
    else:
        exit_signal = 'hold'

    if forced_signal == 'exit_now':
        exit_signal = 'exit_now'
        urgency_score = max(urgency_score, 80)
    elif forced_signal == 'consider' and exit_signal == 'hold':
        exit_signal = 'consider'
        urgency_score = max(urgency_score, 55)

    urgency_score = min(urgency_score, 100)
    deduped_reasons = list(dict.fromkeys(reasons))

    unique_insights: List[Dict[str, Any]] = []
    seen_insight_ids: Set[str] = set()
    for insight in insights:
        if not isinstance(insight, dict):
            continue
        insight_id = str(insight.get('id') or f"insight-{len(unique_insights)}")
        if insight_id in seen_insight_ids:
            continue
        seen_insight_ids.add(insight_id)
        normalized = dict(insight)
        normalized['id'] = insight_id
        unique_insights.append(normalized)

    return {
        'exit_signal': exit_signal,
        'exit_urgency_score': urgency_score,
        'exit_reasons': deduped_reasons,
        'last_signal_check': datetime.now().isoformat(),
        'last_catalyst_review': last_catalyst_review,
        'contextual_insights': unique_insights,
        'pending_alerts': pending_alerts,
        'last_profit_alert_threshold': last_alert_threshold,
        'last_profit_alert_at': last_profit_alert_at,
    }


def update_positions(positions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Update current prices and P&L for a list of positions.

    Args:
        positions: List of position dictionaries with symbol, strike, expiration, etc.

    Returns:
        List of updated positions with current prices and P&L
    """
    updated_positions = []

    for position in positions:
        # Skip closed positions
        if position.get('status') == 'closed':
            updated_positions.append(position)
            continue

        # Fetch current data
        current_data = fetch_option_data(
            symbol=position['symbol'],
            strike=position['strike'],
            expiration=position['expiration'],
            option_type=position['option_type']
        )

        if current_data:
            # Calculate P&L
            pl_data = calculate_pl(
                entry_price=position['entry_price'],
                current_price=current_data['current_price'],
                contracts=position['contracts']
            )

            # Track running peaks for profit protection logic
            existing_peak_price = safe_float(position.get('peak_option_price'))
            current_option_price = safe_float(current_data.get('current_price'))
            if current_option_price is not None:
                if existing_peak_price is None or current_option_price > existing_peak_price:
                    peak_option_price = current_option_price
                else:
                    peak_option_price = existing_peak_price
            else:
                peak_option_price = existing_peak_price

            if peak_option_price is None:
                peak_option_price = safe_float(position.get('entry_price'))

            existing_peak_pl = safe_float(position.get('peak_unrealized_pl')) or 0.0
            existing_peak_pl_pct = safe_float(position.get('peak_unrealized_pl_percent')) or 0.0

            peak_unrealized_pl = existing_peak_pl
            peak_unrealized_pl_percent = existing_peak_pl_pct

            if pl_data['unrealized_pl'] > peak_unrealized_pl:
                peak_unrealized_pl = pl_data['unrealized_pl']
            if pl_data['unrealized_pl_percent'] > peak_unrealized_pl_percent:
                peak_unrealized_pl_percent = pl_data['unrealized_pl_percent']

            peak_metrics = {
                'peak_option_price': peak_option_price,
                'peak_unrealized_pl': peak_unrealized_pl,
                'peak_unrealized_pl_percent': peak_unrealized_pl_percent,
            }

            # Calculate exit signal
            exit_data = calculate_exit_signal(
                position=position,
                current_data=current_data,
                pl_data=pl_data,
                peak_metrics=peak_metrics,
            )

            # Update position with current data
            position.update({
                'current_price': current_data['current_price'],
                'current_stock_price': current_data['stock_price'],
                'current_delta': current_data['delta'],
                'current_theta': current_data['theta'],
                'unrealized_pl': pl_data['unrealized_pl'],
                'unrealized_pl_percent': pl_data['unrealized_pl_percent'],
                'exit_signal': exit_data['exit_signal'],
                'exit_urgency_score': exit_data['exit_urgency_score'],
                'exit_reasons': exit_data['exit_reasons'],
                'last_signal_check': exit_data['last_signal_check'],
                'peak_option_price': peak_metrics['peak_option_price'],
                'peak_unrealized_pl': peak_metrics['peak_unrealized_pl'],
                'peak_unrealized_pl_percent': peak_metrics['peak_unrealized_pl_percent'],
                'last_catalyst_review': exit_data.get('last_catalyst_review'),
                'contextual_insights': exit_data.get('contextual_insights'),
                'pending_alerts': exit_data.get('pending_alerts'),
                'last_profit_alert_threshold': exit_data.get('last_profit_alert_threshold'),
                'last_profit_alert_at': exit_data.get('last_profit_alert_at'),
                'updated_at': datetime.now().isoformat()
            })

            signal_emoji = '🔴' if exit_data['exit_signal'] == 'exit_now' else '🟡' if exit_data['exit_signal'] == 'consider' else '🟢'
            print(f"{signal_emoji} Updated {position['symbol']} ${position['strike']} {position['option_type']}: ${current_data['current_price']:.2f} ({pl_data['unrealized_pl_percent']:.1f}%) - {exit_data['exit_signal'].upper()} ({exit_data['exit_urgency_score']})", file=sys.stderr, flush=True)
        else:
            print(f"✗ Failed to update {position['symbol']} ${position['strike']} {position['option_type']}", file=sys.stderr, flush=True)

        updated_positions.append(position)

        # Add delay between positions to avoid rate limiting
        if REQUEST_THROTTLE_SECONDS > 0:
            jitter = REQUEST_THROTTLE_JITTER if REQUEST_THROTTLE_JITTER > 0 else 0.0
            time.sleep(REQUEST_THROTTLE_SECONDS + random.uniform(0, jitter))

    return updated_positions


def main():
    """Main entry point for updating position prices."""
    print("=== Starting position price update ===", file=sys.stderr, flush=True)

    # Read positions from stdin
    try:
        input_data = sys.stdin.read()
        print(f"Received {len(input_data)} bytes of input", file=sys.stderr, flush=True)
        positions = json.loads(input_data)
        print(f"Parsed {len(positions)} positions from input", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"Error reading input: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

    # Update positions
    print(f"Updating {len(positions)} positions...", file=sys.stderr, flush=True)
    updated: List[Dict[str, Any]]
    try:
        updated = update_positions(positions)
    finally:
        try:
            CACHE.prune()
            CACHE.save()
        except Exception as cache_error:
            print(f"Warning: Failed to persist cache: {cache_error}", file=sys.stderr, flush=True)

    print(f"Update complete. Returning {len(updated)} positions.", file=sys.stderr, flush=True)

    # Output updated positions as JSON
    print(json.dumps(updated, indent=2, default=str))
    sys.stdout.flush()


if __name__ == '__main__':
    main()
