import json
import time
from itertools import islice
from typing import Iterable, List

import requests

YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept": "application/json",
}


def chunked(iterable: Iterable[str], size: int) -> Iterable[List[str]]:
    iterator = iter(iterable)
    while True:
        chunk = list(islice(iterator, size))
        if not chunk:
            return
        yield chunk


def fetch_quote_batch(symbols: List[str]) -> List[dict]:
    """Fetch a batch of quotes from Yahoo Finance's public quote endpoint."""

    url = "https://query1.finance.yahoo.com/v7/finance/quote"
    params = {"symbols": ",".join(symbols)}

    response = requests.get(url, params=params, headers=YF_HEADERS, timeout=10)
    response.raise_for_status()

    payload = response.json()
    results = payload.get("quoteResponse", {}).get("result", [])

    quotes: List[dict] = []
    for raw in results:
        price = raw.get("regularMarketPrice")
        prev_close = (
            raw.get("regularMarketPreviousClose")
            or raw.get("previousClose")
            or raw.get("chartPreviousClose")
        )

        if price is None and raw.get("regularMarketDayHigh") is not None:
            price = raw.get("regularMarketDayHigh")

        if price is None:
            continue

        change = raw.get("regularMarketChange")
        change_percent = raw.get("regularMarketChangePercent")

        if change is None and prev_close not in (None, 0):
            change = float(price) - float(prev_close)

        if change_percent is None and prev_close:
            try:
                change_percent = (float(change) / float(prev_close)) * 100 if prev_close else 0
            except Exception:
                change_percent = None

        quote = {
            "symbol": raw.get("symbol", symbols[0]),
            "price": round(float(price), 2),
            "change": round(float(change), 2) if change is not None else 0.0,
            "changePercent": round(float(change_percent), 2) if change_percent is not None else 0.0,
            "volume": raw.get("regularMarketVolume"),
            "high": raw.get("regularMarketDayHigh"),
            "low": raw.get("regularMarketDayLow"),
            "open": raw.get("regularMarketOpen"),
            "previousClose": prev_close,
            "marketCap": raw.get("marketCap"),
            "avgVolume": raw.get("averageDailyVolume3Month"),
        }
        quotes.append(quote)

    return quotes


def get_quotes(symbols: Iterable[str]) -> List[dict]:
    """Fetch real-time quotes for multiple symbols with retries and batching."""

    collected: List[dict] = []
    for batch in chunked([symbol.strip() for symbol in symbols if symbol.strip()], 10):
        retries = 3
        for attempt in range(retries):
            try:
                collected.extend(fetch_quote_batch(batch))
                break
            except Exception as error:
                if attempt == retries - 1:
                    print(f"Error fetching quotes for {batch}: {error}")
                else:
                    time.sleep(1 + attempt)

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
