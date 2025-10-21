#!/usr/bin/env python3
"""
Fetch macro economic indicators for trading dashboard.
"""

import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List
import yfinance as yf


def fetch_market_indices() -> Dict[str, Any]:
    """Fetch major market indices and their performance."""
    indices = {
        '^GSPC': 'S&P 500',
        '^DJI': 'Dow Jones',
        '^IXIC': 'NASDAQ',
        '^RUT': 'Russell 2000',
        '^VIX': 'VIX',
        'DX-Y.NYB': 'Dollar Index',
    }

    results = {}
    for symbol, name in indices.items():
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period='5d')

            if hist.empty:
                continue

            current_price = float(hist['Close'].iloc[-1])
            prev_close = float(hist['Close'].iloc[-2]) if len(hist) > 1 else current_price
            change = current_price - prev_close
            change_pct = (change / prev_close) * 100 if prev_close > 0 else 0

            # Get 52-week range
            year_data = ticker.history(period='1y')
            high_52w = float(year_data['High'].max()) if not year_data.empty else current_price
            low_52w = float(year_data['Low'].min()) if not year_data.empty else current_price

            results[symbol] = {
                'name': name,
                'price': current_price,
                'change': change,
                'change_pct': change_pct,
                'high_52w': high_52w,
                'low_52w': low_52w,
            }
        except Exception as e:
            print(f"Error fetching {symbol}: {e}", file=sys.stderr, flush=True)

    return results


def fetch_treasury_yields() -> Dict[str, Any]:
    """Fetch US Treasury yields."""
    treasuries = {
        '^IRX': '3-Month',
        '^FVX': '5-Year',
        '^TNX': '10-Year',
        '^TYX': '30-Year',
    }

    results = {}
    for symbol, name in treasuries.items():
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period='5d')

            if hist.empty:
                continue

            current_yield = float(hist['Close'].iloc[-1])
            prev_yield = float(hist['Close'].iloc[-2]) if len(hist) > 1 else current_yield
            change = current_yield - prev_yield

            results[name] = {
                'yield': current_yield,
                'change': change,
            }
        except Exception as e:
            print(f"Error fetching {symbol}: {e}", file=sys.stderr, flush=True)

    return results


def fetch_commodities() -> Dict[str, Any]:
    """Fetch key commodity prices."""
    commodities = {
        'GC=F': 'Gold',
        'CL=F': 'Crude Oil',
        'BTC-USD': 'Bitcoin',
    }

    results = {}
    for symbol, name in commodities.items():
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period='5d')

            if hist.empty:
                continue

            current_price = float(hist['Close'].iloc[-1])
            prev_close = float(hist['Close'].iloc[-2]) if len(hist) > 1 else current_price
            change = current_price - prev_close
            change_pct = (change / prev_close) * 100 if prev_close > 0 else 0

            results[name] = {
                'price': current_price,
                'change': change,
                'change_pct': change_pct,
            }
        except Exception as e:
            print(f"Error fetching {symbol}: {e}", file=sys.stderr, flush=True)

    return results


def calculate_market_sentiment() -> Dict[str, Any]:
    """Calculate market sentiment indicators."""
    try:
        vix_ticker = yf.Ticker('^VIX')
        vix_hist = vix_ticker.history(period='1mo')

        if not vix_hist.empty:
            current_vix = float(vix_hist['Close'].iloc[-1])
            avg_vix = float(vix_hist['Close'].mean())

            # VIX interpretation
            if current_vix < 15:
                sentiment = 'Complacent'
                description = 'Low fear, market feels safe'
            elif current_vix < 20:
                sentiment = 'Normal'
                description = 'Average volatility'
            elif current_vix < 30:
                sentiment = 'Elevated'
                description = 'Increased uncertainty'
            else:
                sentiment = 'Fearful'
                description = 'High volatility, market stress'

            return {
                'vix': current_vix,
                'vix_avg_30d': avg_vix,
                'sentiment': sentiment,
                'description': description,
            }
    except Exception as e:
        print(f"Error calculating sentiment: {e}", file=sys.stderr, flush=True)

    return {}


def main():
    """Main entry point for fetching macro indicators."""
    print("=== Fetching macro indicators ===", file=sys.stderr, flush=True)

    try:
        data = {
            'indices': fetch_market_indices(),
            'treasuries': fetch_treasury_yields(),
            'commodities': fetch_commodities(),
            'sentiment': calculate_market_sentiment(),
            'timestamp': datetime.now().isoformat(),
        }

        print(f"Fetched {len(data['indices'])} indices, {len(data['treasuries'])} yields, {len(data['commodities'])} commodities", file=sys.stderr, flush=True)
        print(json.dumps(data, indent=2, default=str))
        sys.stdout.flush()

    except Exception as e:
        print(f"Error in main: {e}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
