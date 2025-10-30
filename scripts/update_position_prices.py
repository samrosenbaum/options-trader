#!/usr/bin/env python3
"""
Update current prices and Greeks for open options positions.
"""

import sys
import json
import time
from datetime import datetime, date, timezone
from typing import Dict, Any, List, Optional

import requests

from src.math.greeks import GreeksCalculator


CONTRACT_MULTIPLIER = 100
YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept": "application/json",
}


def safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        result = float(value)
        if result != result:  # NaN check
            return None
        return result
    except (TypeError, ValueError):
        return None


def safe_int(value: Any) -> int:
    try:
        if value in (None, "", False):
            return 0
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def fetch_json(url: str, *, params: Optional[Dict[str, Any]] = None, retries: int = 3) -> Optional[Dict[str, Any]]:
    last_error: Optional[Exception] = None

    for attempt in range(retries):
        try:
            response = requests.get(url, params=params, headers=YF_HEADERS, timeout=10)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            last_error = exc if isinstance(exc, Exception) else Exception(str(exc))
            wait_seconds = 1 + attempt
            time.sleep(wait_seconds)

    if last_error:
        print(f"Warning: request to {url} failed after retries: {last_error}", file=sys.stderr)

    return None


def fetch_stock_price(symbol: str) -> Optional[float]:
    data = fetch_json(
        "https://query1.finance.yahoo.com/v7/finance/quote",
        params={"symbols": symbol},
    )

    if not data:
        return None

    result = data.get("quoteResponse", {}).get("result", [])
    if not result:
        return None

    price = safe_float(result[0].get("regularMarketPrice"))
    if price is None:
        price = safe_float(result[0].get("regularMarketDayHigh"))

    return price


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


def fetch_option_data(symbol: str, strike: float, expiration: Any, option_type: str) -> Optional[Dict[str, Any]]:
    """
    Fetch current price and data for a specific option contract.

    Args:
        symbol: Stock ticker symbol
        strike: Strike price
        expiration: Expiration date (YYYY-MM-DD)
        option_type: 'call' or 'put'

    Returns:
        Dictionary with current price, Greeks, and stock price
    """

    try:
        try:
            exp_date = parse_expiration_date(expiration)
        except ValueError as error:
            print(f"Warning: invalid expiration for {symbol}: {error}", file=sys.stderr)
            return None

        stock_price = fetch_stock_price(symbol)
        if stock_price is None:
            print(f"Warning: unable to fetch stock price for {symbol}", file=sys.stderr)
            return None

        expiration_dt = datetime(exp_date.year, exp_date.month, exp_date.day, tzinfo=timezone.utc)
        expiration_ts = int(expiration_dt.timestamp())

        options_data = fetch_json(
            f"https://query2.finance.yahoo.com/v7/finance/options/{symbol}",
            params={"date": expiration_ts},
        )

        if not options_data:
            print(f"Warning: no option chain data for {symbol} on {exp_date}", file=sys.stderr)
            return None

        chain_results = options_data.get("optionChain", {}).get("result", [])
        if not chain_results:
            print(f"Warning: empty option chain result for {symbol} on {exp_date}", file=sys.stderr)
            return None

        chain_options = chain_results[0].get("options", [])
        if not chain_options:
            print(f"Warning: missing options list for {symbol} on {exp_date}", file=sys.stderr)
            return None

        option_entry = chain_options[0]
        contracts = option_entry.get("calls" if option_type.lower() == "call" else "puts", [])

        target_contract: Optional[Dict[str, Any]] = None
        closest_diff: Optional[float] = None
        for contract in contracts:
            contract_strike = safe_float(contract.get("strike"))
            if contract_strike is None:
                continue
            diff = abs(contract_strike - float(strike))
            if closest_diff is None or diff < closest_diff:
                closest_diff = diff
                target_contract = contract

        if target_contract is None or (closest_diff is not None and closest_diff > max(0.05, strike * 0.001)):
            print(
                f"Warning: Contract not found for {symbol} ${strike} {option_type} {exp_date} (closest diff {closest_diff})",
                file=sys.stderr,
            )
            return None

        last_price = safe_float(target_contract.get("lastPrice"))
        mark_price = safe_float(target_contract.get("mark"))
        bid = safe_float(target_contract.get("bid"))
        ask = safe_float(target_contract.get("ask"))

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
                print(
                    f"Warning: No usable price for {symbol} ${strike} {option_type} {exp_date}",
                    file=sys.stderr,
                )
                return None

        if not bid or bid <= 0:
            bid = last_price * 0.95
        if not ask or ask <= 0:
            ask = last_price * 1.05

        volume = safe_int(target_contract.get("volume"))
        open_interest = safe_int(target_contract.get("openInterest"))
        implied_volatility = safe_float(target_contract.get("impliedVolatility")) or 0.5

        calculator = GreeksCalculator(risk_free_rate=0.045)

        days_to_expiry = (exp_date - date.today()).days
        time_to_expiry = max(days_to_expiry / 365.0, 0.001)

        greeks = calculator.calculate_all_greeks(
            option_type=option_type.lower(),
            stock_price=stock_price,
            strike_price=strike,
            time_to_expiration=time_to_expiry,
            volatility=implied_volatility,
        )

        return {
            "current_price": last_price,
            "bid": bid,
            "ask": ask,
            "volume": volume,
            "open_interest": open_interest,
            "implied_volatility": implied_volatility,
            "stock_price": stock_price,
            "delta": greeks.delta,
            "theta": greeks.theta,
            "gamma": greeks.gamma,
            "vega": greeks.vega,
        }
    except Exception as error:
        print(f"Error fetching option data for {symbol}: {error}", file=sys.stderr)
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
    updated = update_positions(positions)
    print(f"Update complete. Returning {len(updated)} positions.", file=sys.stderr, flush=True)

    # Output updated positions as JSON
    print(json.dumps(updated, indent=2, default=str))
    sys.stdout.flush()


if __name__ == '__main__':
    main()
