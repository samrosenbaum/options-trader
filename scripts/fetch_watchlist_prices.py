#!/usr/bin/env python3
"""
Fetch current prices for watchlist options contracts.
Reads watchlist items from stdin and outputs current prices to stdout.
"""

import sys
import json
from scripts.update_position_prices import fetch_option_data


def main():
    """Main entry point."""
    try:
        # Read watchlist items from stdin
        input_data = sys.stdin.read()
        watchlist_items = json.loads(input_data)

        results = []

        for item in watchlist_items:
            try:
                symbol = item['symbol']
                strike = float(item['strike'])
                expiration = item['expiration']
                option_type = item['optionType'].lower()
                original_premium = float(item['premium'])

                print(f"Fetching price for {symbol} ${strike} {option_type.upper()} exp {expiration}...", file=sys.stderr)

                # Fetch current option data
                option_data = fetch_option_data(symbol, strike, expiration, option_type)

                if option_data:
                    current_premium = option_data.get('current_price', 0)

                    # Calculate return
                    pl_amount = current_premium - original_premium
                    pl_percent = (pl_amount / original_premium * 100) if original_premium > 0 else 0

                    results.append({
                        'id': item['id'],
                        'currentPremium': round(current_premium, 2),
                        'plAmount': round(pl_amount, 2),
                        'plPercent': round(pl_percent, 2),
                        'stockPrice': option_data.get('stock_price', 0)
                    })

                    print(f"  ✓ Current: ${current_premium:.2f} (${pl_amount:+.2f}, {pl_percent:+.1f}%)", file=sys.stderr)
                else:
                    print(f"  ✗ Could not fetch data", file=sys.stderr)
                    results.append({
                        'id': item['id'],
                        'currentPremium': None,
                        'plAmount': None,
                        'plPercent': None,
                        'stockPrice': None
                    })

            except Exception as e:
                print(f"Error processing {item.get('symbol', 'unknown')}: {str(e)}", file=sys.stderr)
                results.append({
                    'id': item['id'],
                    'currentPremium': None,
                    'plAmount': None,
                    'plPercent': None,
                    'stockPrice': None
                })

        # Output results as JSON to stdout
        print(json.dumps(results))

    except Exception as e:
        print(f"Fatal error: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
