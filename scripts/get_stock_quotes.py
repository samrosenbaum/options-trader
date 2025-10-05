import yfinance as yf
import pandas as pd
import json

def get_quotes(symbols):
    """Fetch real-time quotes for multiple symbols"""
    quotes = []
    
    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            
            # Get current price
            current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))
            previous_close = info.get('previousClose', current_price)
            
            quote = {
                'symbol': symbol,
                'price': round(current_price, 2),
                'change': round(current_price - previous_close, 2),
                'changePercent': round(((current_price - previous_close) / previous_close) * 100, 2) if previous_close else 0,
                'volume': info.get('volume', 0),
                'high': info.get('dayHigh', current_price),
                'low': info.get('dayLow', current_price),
                'open': info.get('open', current_price),
                'previousClose': previous_close,
                'marketCap': info.get('marketCap', 0),
                'avgVolume': info.get('averageVolume', 0)
            }
            quotes.append(quote)
            
        except Exception as e:
            print(f"Error fetching quote for {symbol}: {e}")
            continue
    
    return quotes

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        symbols = sys.argv[1].split(',')
    else:
        symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "AMD", "NFLX", "SPY"]
    
    quotes = get_quotes(symbols)
    print(json.dumps(quotes, indent=2))
