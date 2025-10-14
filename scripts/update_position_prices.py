#!/usr/bin/env python3
"""
Update current prices and Greeks for open options positions.
"""

import sys
import json
from datetime import datetime, date
from typing import Dict, Any, List, Optional
import yfinance as yf
import pandas as pd

from src.math.greeks import GreeksCalculator


def fetch_option_data(symbol: str, strike: float, expiration: str, option_type: str) -> Optional[Dict[str, Any]]:
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
        ticker = yf.Ticker(symbol)

        # Get current stock price
        stock_info = ticker.history(period='1d')
        if stock_info.empty:
            print(f"Warning: No stock data for {symbol}", file=sys.stderr)
            return None

        stock_price = float(stock_info['Close'].iloc[-1])

        # Convert expiration date to yfinance format (YYYY-MM-DD)
        exp_date = datetime.strptime(expiration, '%Y-%m-%d').date()

        # Get options chain for expiration date
        try:
            options = ticker.option_chain(exp_date.strftime('%Y-%m-%d'))
        except Exception as e:
            print(f"Warning: Could not get options chain for {symbol} {exp_date}: {e}", file=sys.stderr)
            return None

        # Get the right chain (calls or puts)
        chain = options.calls if option_type.lower() == 'call' else options.puts

        # Find the specific contract
        contract = chain[chain['strike'] == strike]

        if contract.empty:
            print(f"Warning: Contract not found for {symbol} ${strike} {option_type} {exp_date}", file=sys.stderr)
            return None

        # Get contract data
        row = contract.iloc[0]

        last_price = float(row['lastPrice'])
        bid = float(row['bid']) if 'bid' in row and pd.notna(row['bid']) else last_price * 0.95
        ask = float(row['ask']) if 'ask' in row and pd.notna(row['ask']) else last_price * 1.05
        volume = int(row['volume']) if 'volume' in row and pd.notna(row['volume']) else 0
        open_interest = int(row['openInterest']) if 'openInterest' in row and pd.notna(row['openInterest']) else 0
        implied_volatility = float(row['impliedVolatility']) if 'impliedVolatility' in row and pd.notna(row['impliedVolatility']) else 0.5

        # Calculate Greeks using our calculator
        calculator = GreeksCalculator(risk_free_rate=0.045)

        days_to_expiry = (exp_date - date.today()).days
        time_to_expiry = max(days_to_expiry / 365.0, 0.001)

        greeks = calculator.calculate_greeks(
            stock_price=stock_price,
            strike=strike,
            time_to_expiry=time_to_expiry,
            volatility=implied_volatility,
            option_type=option_type.lower()
        )

        return {
            'current_price': last_price,
            'bid': bid,
            'ask': ask,
            'volume': volume,
            'open_interest': open_interest,
            'implied_volatility': implied_volatility,
            'stock_price': stock_price,
            'delta': greeks['delta'],
            'theta': greeks['theta'],
            'gamma': greeks['gamma'],
            'vega': greeks['vega'],
        }

    except Exception as e:
        print(f"Error fetching option data for {symbol}: {e}", file=sys.stderr)
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
    cost_basis = entry_price * contracts
    current_value = current_price * contracts
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
    expiration_date = datetime.strptime(position['expiration'], '%Y-%m-%d').date()
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
            print(f"{signal_emoji} Updated {position['symbol']} ${position['strike']} {position['option_type']}: ${current_data['current_price']:.2f} ({pl_data['unrealized_pl_percent']:.1f}%) - {exit_data['exit_signal'].upper()} ({exit_data['exit_urgency_score']})", file=sys.stderr)
        else:
            print(f"✗ Failed to update {position['symbol']} ${position['strike']} {position['option_type']}", file=sys.stderr)

        updated_positions.append(position)

    return updated_positions


def main():
    """Main entry point for updating position prices."""
    # Read positions from stdin
    try:
        input_data = sys.stdin.read()
        positions = json.loads(input_data)
    except Exception as e:
        print(f"Error reading input: {e}", file=sys.stderr)
        sys.exit(1)

    # Update positions
    updated = update_positions(positions)

    # Output updated positions as JSON
    print(json.dumps(updated, indent=2, default=str))


if __name__ == '__main__':
    main()
