import json
import time
from itertools import islice
from typing import Iterable, List
import yfinance as yf


def chunked(iterable: Iterable[str], size: int) -> Iterable[List[str]]:
    """Split an iterable into chunks of specified size."""
    iterator = iter(iterable)
    while True:
        chunk = list(islice(iterator, size))
        if not chunk:
            return
        yield chunk


def fetch_quote_batch(symbols: List[str]) -> List[dict]:
    """Fetch a batch of quotes using yfinance with better error handling."""

    quotes: List[dict] = []

    # Use yfinance's download method for batch fetching
    try:
        # Fetch all symbols at once
        tickers = yf.Tickers(" ".join(symbols))

        for symbol in symbols:
            try:
                ticker = tickers.tickers.get(symbol) or yf.Ticker(symbol)
                info = ticker.info

                # Get current price with multiple fallbacks
                price = info.get('currentPrice') or info.get('regularMarketPrice') or info.get('previousClose')
                if price is None or price == 0:
                    continue

                prev_close = info.get('previousClose') or info.get('regularMarketPreviousClose') or price

                # Calculate change values
                change = price - prev_close
                change_percent = (change / prev_close * 100) if prev_close and prev_close != 0 else 0

                quote = {
                    "symbol": symbol,
                    "price": round(float(price), 2),
                    "change": round(float(change), 2),
                    "changePercent": round(float(change_percent), 2),
                    "volume": info.get('volume') or info.get('regularMarketVolume') or 0,
                    "high": info.get('dayHigh') or info.get('regularMarketDayHigh'),
                    "low": info.get('dayLow') or info.get('regularMarketDayLow'),
                    "open": info.get('open') or info.get('regularMarketOpen'),
                    "previousClose": prev_close,
                    "marketCap": info.get('marketCap'),
                    "avgVolume": info.get('averageVolume') or info.get('averageDailyVolume3Month'),
                }
                quotes.append(quote)

            except Exception as error:
                print(f"Error fetching {symbol}: {error}")
                continue

    except Exception as error:
        print(f"Error fetching batch {symbols}: {error}")

    return quotes


def get_quotes(symbols: Iterable[str]) -> List[dict]:
    """Fetch real-time quotes for multiple symbols with retries and batching."""

    collected: List[dict] = []

    # Process in batches of 10 to avoid overwhelming the API
    for batch in chunked([symbol.strip() for symbol in symbols if symbol.strip()], 10):
        retries = 3
        for attempt in range(retries):
            try:
                quotes = fetch_quote_batch(batch)
                collected.extend(quotes)
                break
            except Exception as error:
                if attempt == retries - 1:
                    print(f"Error fetching quotes for {batch}: {error}")
                else:
                    # Exponential backoff: 1s, 2s, 3s
                    time.sleep(1 + attempt)

        # Add rate limiting between batches to avoid hitting API limits
        time.sleep(0.2)

    return collected


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1].strip():
        symbols = sys.argv[1].split(",")
    else:
        symbols = [
            "AAPL",
            "MSFT",
            "GOOGL",
            "AMZN",
            "NVDA",
            "TSLA",
            "META",
            "AMD",
            "NFLX",
            "SPY",
        ]

    quotes = get_quotes(symbols)
    print(json.dumps(quotes, indent=2))
