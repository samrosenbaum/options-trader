#!/usr/bin/env python3
"""
Update current prices and Greeks for open options positions.
"""

import sys
import json
import os
import random
import time
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import yfinance as yf

from src.cache import CacheResult, PositionPriceCache
from src.math.greeks import GreeksCalculator


CONTRACT_MULTIPLIER = 100

CACHE = PositionPriceCache.from_environment()
_TICKER_CACHE: Dict[str, yf.Ticker] = {}
_OPTION_CHAIN_CACHE: Dict[Tuple[str, str], Any] = {}

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
            # Parse expiration date
            try:
                exp_date = parse_expiration_date(expiration)
            except ValueError as error:
                print(f"Warning: invalid expiration for {symbol}: {error}", file=sys.stderr)
                return None

            # Create ticker object
            ticker = yf.Ticker(symbol)

            # Get current stock price
            stock_info = ticker.history(period='1d')
            if stock_info.empty:
                # Try alternative method
                info = ticker.info
                stock_price = safe_float(info.get('currentPrice') or info.get('regularMarketPrice') or info.get('previousClose'))
                if stock_price is None:
                    print(f"Warning: No stock data for {symbol}", file=sys.stderr)
                    return None
            else:
                stock_price = float(stock_info['Close'].iloc[-1])

            # Get options chain for expiration date
            try:
                options = ticker.option_chain(exp_date.strftime('%Y-%m-%d'))
            except Exception as e:
                if attempt < retry_count - 1:
                    # Longer delays for rate limit errors (2s, 4s, 6s)
                    wait_time = 2 * (attempt + 1)
                    print(f"Retry {attempt + 1}/{retry_count} for {symbol} after error: {e}", file=sys.stderr)
                    time.sleep(wait_time)
                    continue
                print(f"Warning: Could not get options chain for {symbol} {exp_date}: {e}", file=sys.stderr)
                return None

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

            if last_price is None or last_price <= 0:
                if mark_price and mark_price > 0:
                    last_price = mark_price
                elif bid and ask and bid > 0 and ask > 0:
                    last_price = (bid + ask) / 2
                elif bid and bid > 0:
                    last_price = bid
                elif ask and ask > 0:
                    last_price = ask
                else:
                    raise RuntimeError(
                        f"No usable price for {symbol} ${strike_value} {option_type_normalized} {expiration_key}"
                    )

            if not bid or bid <= 0:
                bid = last_price * 0.95
            if not ask or ask <= 0:
                ask = last_price * 1.05

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
                'current_price': float(last_price),
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
                # Longer delays for rate limit errors (2s, 4s, 6s)
                wait_time = 2 * (attempt + 1)
                print(f"Retry {attempt + 1}/{retry_count} for {symbol} after error: {error}", file=sys.stderr)
                time.sleep(wait_time)
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


def calculate_exit_signal(position: Dict[str, Any], current_data: Dict[str, Any], pl_data: Dict[str, float]) -> Dict[str, Any]:
    """
    Calculate exit signal based on multiple risk factors.

    Args:
        position: Position data with entry details
        current_data: Current market data with Greeks
        pl_data: P&L data with unrealized gains/losses

    Returns:
        Dictionary with exit_signal, exit_urgency_score, and exit_reasons
    """
    reasons = []
    urgency_score = 0

    pl_percent = pl_data['unrealized_pl_percent']
    delta = current_data.get('delta', 0)
    theta = current_data.get('theta', 0)

    # Calculate days to expiration
    expiration_date = parse_expiration_date(position['expiration'])
    dte = (expiration_date - date.today()).days

    # 1. Profit Target (50% gain)
    if pl_percent >= 50:
        reasons.append('profit_target_hit')
        urgency_score += 35

    # 2. Stop Loss (-50% loss)
    if pl_percent <= -50:
        reasons.append('stop_loss_triggered')
        urgency_score += 50

    # 3. Moderate Loss (-30% to -50%)
    elif pl_percent <= -30:
        reasons.append('moderate_loss')
        urgency_score += 25

    # 4. Theta Decay Warning (< 7 DTE with low delta)
    if dte < 7 and abs(delta) < 0.15:
        reasons.append('theta_decay_warning')
        urgency_score += 30

    # 5. Approaching Expiration (< 3 DTE)
    if dte < 3:
        reasons.append('expiration_imminent')
        urgency_score += 40

    # 6. Deep Out of Money (delta < 0.05 and negative P&L)
    if abs(delta) < 0.05 and pl_percent < 0:
        reasons.append('deep_otm')
        urgency_score += 20

    # 7. Heavy Theta Decay (theta < -0.10 for calls/puts)
    if theta < -0.10 and dte < 14:
        reasons.append('high_theta_decay')
        urgency_score += 15

    # Determine exit signal based on urgency score
    if urgency_score >= 70:
        exit_signal = 'exit_now'
    elif urgency_score >= 35:
        exit_signal = 'consider'
    else:
        exit_signal = 'hold'

    # Cap urgency score at 100
    urgency_score = min(urgency_score, 100)

    return {
        'exit_signal': exit_signal,
        'exit_urgency_score': urgency_score,
        'exit_reasons': reasons,
        'last_signal_check': datetime.now().isoformat()
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

            # Calculate exit signal
            exit_data = calculate_exit_signal(
                position=position,
                current_data=current_data,
                pl_data=pl_data
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
                'updated_at': datetime.now().isoformat()
            })

            signal_emoji = '🔴' if exit_data['exit_signal'] == 'exit_now' else '🟡' if exit_data['exit_signal'] == 'consider' else '🟢'
            print(f"{signal_emoji} Updated {position['symbol']} ${position['strike']} {position['option_type']}: ${current_data['current_price']:.2f} ({pl_data['unrealized_pl_percent']:.1f}%) - {exit_data['exit_signal'].upper()} ({exit_data['exit_urgency_score']})", file=sys.stderr, flush=True)
        else:
            print(f"✗ Failed to update {position['symbol']} ${position['strike']} {position['option_type']}", file=sys.stderr, flush=True)

        updated_positions.append(position)

        # Add delay between positions to avoid Yahoo Finance rate limiting
        # Yahoo heavily rate-limits option chain requests, so we need longer delays
        time.sleep(2.0)

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
