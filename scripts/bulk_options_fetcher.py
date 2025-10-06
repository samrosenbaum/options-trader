#!/usr/bin/env python3
"""
Bulk Options Data Fetcher - Get options data from multiple sources efficiently
"""

import yfinance as yf
import pandas as pd
import requests
import json
import time
import concurrent.futures
from datetime import datetime, timedelta
import numpy as np

class BulkOptionsFetcher:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        
        # High-volume stocks that typically have good options liquidity
        self.priority_symbols = [
            'SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX',
            'AMD', 'INTC', 'CRM', 'ADBE', 'PYPL', 'UBER', 'SQ', 'ROKU', 'ZM', 'DOCU',
            'SNOW', 'PLTR', 'COIN', 'HOOD', 'SOFI', 'AFRM', 'UPST', 'LCID', 'RIVN', 'XPEV'
        ]
        
        # Alternative data sources
        self.data_sources = {
            'yfinance': self.fetch_yfinance_options,
            'polygon': self.fetch_polygon_options,  # If you have API key
            'alpha_vantage': self.fetch_alpha_vantage_options  # If you have API key
        }
    
    def fetch_yfinance_options(self, symbol, max_workers=5):
        """Fetch options data using yfinance with threading"""
        try:
            ticker = yf.Ticker(symbol)
            
            # Get current stock price
            stock_info = ticker.info
            current_price = stock_info.get('currentPrice', stock_info.get('regularMarketPrice', 0))
            
            # Get options chain
            expirations = ticker.options
            if not expirations:
                return None
            
            # Get next 2-3 expirations
            relevant_expirations = expirations[:3]
            
            all_options = []
            for exp_date in relevant_expirations:
                try:
                    opt_chain = ticker.option_chain(exp_date)
                    calls = opt_chain.calls
                    puts = opt_chain.puts
                    
                    # Add metadata
                    calls['symbol'] = symbol
                    calls['expiration'] = exp_date
                    calls['type'] = 'call'
                    calls['stockPrice'] = current_price
                    
                    puts['symbol'] = symbol
                    puts['expiration'] = exp_date
                    puts['type'] = 'put'
                    puts['stockPrice'] = current_price
                    
                    all_options.extend([
                        calls[['symbol', 'strike', 'lastPrice', 'volume', 'openInterest', 
                              'impliedVolatility', 'bid', 'ask', 'expiration', 'type', 'stockPrice']],
                        puts[['symbol', 'strike', 'lastPrice', 'volume', 'openInterest', 
                             'impliedVolatility', 'bid', 'ask', 'expiration', 'type', 'stockPrice']]
                    ])
                    
                    # Small delay to avoid rate limits
                    time.sleep(0.1)
                    
                except Exception as e:
                    print(f"Error fetching {symbol} options for {exp_date}: {e}")
                    continue
            
            if all_options:
                combined_df = pd.concat(all_options, ignore_index=True)
                return combined_df
            
        except Exception as e:
            print(f"Error fetching {symbol} from yfinance: {e}")
            return None
        
        return None
    
    def fetch_polygon_options(self, symbol, api_key=None):
        """Fetch from Polygon.io (requires API key)"""
        if not api_key:
            return None
        
        try:
            url = f"https://api.polygon.io/v3/reference/options/contracts"
            params = {
                'underlying_ticker': symbol,
                'limit': 1000,
                'apikey': api_key
            }
            
            response = self.session.get(url, params=params)
            if response.status_code == 200:
                data = response.json()
                # Process Polygon data format
                return self.process_polygon_data(data, symbol)
                
        except Exception as e:
            print(f"Error fetching {symbol} from Polygon: {e}")
        
        return None
    
    def fetch_alpha_vantage_options(self, symbol, api_key=None):
        """Fetch from Alpha Vantage (requires API key)"""
        if not api_key:
            return None
        
        try:
            url = "https://www.alphavantage.co/query"
            params = {
                'function': 'TIME_SERIES_INTRADAY',
                'symbol': symbol,
                'interval': '1min',
                'apikey': api_key
            }
            
            response = self.session.get(url, params=params)
            if response.status_code == 200:
                data = response.json()
                # Process Alpha Vantage data
                return self.process_alpha_vantage_data(data, symbol)
                
        except Exception as e:
            print(f"Error fetching {symbol} from Alpha Vantage: {e}")
        
        return None
    
    def fetch_bulk_options_parallel(self, symbols=None, max_workers=3):
        """Fetch options data for multiple symbols in parallel"""
        if symbols is None:
            symbols = self.priority_symbols[:10]  # Start with 10 symbols
        
        all_options_data = []
        successful_fetches = 0
        
        print(f"Fetching options data for {len(symbols)} symbols using {max_workers} workers...")
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all fetch tasks
            future_to_symbol = {
                executor.submit(self.fetch_yfinance_options, symbol): symbol 
                for symbol in symbols
            }
            
            # Collect results as they complete
            for future in concurrent.futures.as_completed(future_to_symbol):
                symbol = future_to_symbol[future]
                try:
                    options_data = future.result(timeout=30)  # 30 second timeout per symbol
                    if options_data is not None and not options_data.empty:
                        all_options_data.append(options_data)
                        successful_fetches += 1
                        print(f"✅ {symbol}: {len(options_data)} options")
                    else:
                        print(f"❌ {symbol}: No data")
                        
                except Exception as e:
                    print(f"❌ {symbol}: Error - {e}")
        
        if all_options_data:
            combined_df = pd.concat(all_options_data, ignore_index=True)
            print(f"\n📊 Total options fetched: {len(combined_df)}")
            print(f"📈 Successful symbols: {successful_fetches}/{len(symbols)}")
            return combined_df
        else:
            print("❌ No options data fetched")
            return None
    
    def save_to_cache(self, data, filename="options_cache.json"):
        """Save options data to cache file"""
        try:
            # Convert DataFrame to JSON-serializable format
            data_dict = data.to_dict('records')
            
            cache_data = {
                'timestamp': datetime.now().isoformat(),
                'data_count': len(data_dict),
                'symbols': data['symbol'].unique().tolist(),
                'options': data_dict
            }
            
            with open(filename, 'w') as f:
                json.dump(cache_data, f, indent=2)
            
            print(f"💾 Cached {len(data_dict)} options to {filename}")
            
        except Exception as e:
            print(f"Error saving cache: {e}")
    
    def load_from_cache(self, filename="options_cache.json", max_age_minutes=15):
        """Load options data from cache if it's recent enough"""
        try:
            with open(filename, 'r') as f:
                cache_data = json.load(f)
            
            cache_time = datetime.fromisoformat(cache_data['timestamp'])
            age_minutes = (datetime.now() - cache_time).total_seconds() / 60
            
            if age_minutes <= max_age_minutes:
                print(f"📂 Using cached data ({age_minutes:.1f} minutes old)")
                return pd.DataFrame(cache_data['options'])
            else:
                print(f"🕐 Cache too old ({age_minutes:.1f} minutes), will fetch fresh data")
                return None
                
        except FileNotFoundError:
            print("📂 No cache file found")
            return None
        except Exception as e:
            print(f"Error loading cache: {e}")
            return None
    
    def get_fresh_options_data(self, use_cache=True):
        """Get fresh options data, using cache if available"""
        if use_cache:
            cached_data = self.load_from_cache()
            if cached_data is not None:
                return cached_data
        
        # Fetch fresh data
        fresh_data = self.fetch_bulk_options_parallel()
        
        if fresh_data is not None:
            self.save_to_cache(fresh_data)
        
        return fresh_data

def main():
    fetcher = BulkOptionsFetcher()
    
    print("🚀 Starting bulk options data fetch...")
    
    # Try to get fresh data
    options_data = fetcher.get_fresh_options_data(use_cache=True)
    
    if options_data is not None:
        print(f"\n✅ Successfully fetched {len(options_data)} options")
        print(f"📊 Symbols: {options_data['symbol'].unique()}")
        print(f"📅 Date range: {options_data['expiration'].min()} to {options_data['expiration'].max()}")
        
        # Show sample of data
        print(f"\n📋 Sample data:")
        print(options_data.head())
        
        return options_data
    else:
        print("❌ Failed to fetch options data")
        return None

if __name__ == "__main__":
    main()
