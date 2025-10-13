#!/usr/bin/env python3
"""
Bulk Options Data Fetcher - Get options data from multiple sources efficiently
"""

from __future__ import annotations

import os
import pandas as pd
import requests
import json
import time
import concurrent.futures
from datetime import datetime, timezone

from src.adapters.base import AdapterError
from src.config import get_options_data_adapter, get_settings

class BulkOptionsFetcher:
    def __init__(self, settings: "AppSettings" | None = None):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })

        self.settings = settings or get_settings()
        self.adapter = get_options_data_adapter()
        self.fetcher_settings = getattr(self.settings, "fetcher", None)
        default_runtime = 75.0
        configured_runtime = getattr(self.fetcher_settings, "max_runtime_seconds", default_runtime)
        env_runtime = os.getenv("SCAN_MAX_RUNTIME_SECONDS")
        if env_runtime is not None:
            try:
                configured_runtime = float(env_runtime)
            except ValueError:  # pragma: no cover - defensive parsing
                pass
        if configured_runtime is None:
            self.max_runtime_seconds = None
        else:
            try:
                runtime_value = float(configured_runtime)
            except (TypeError, ValueError):  # pragma: no cover - defensive parsing
                runtime_value = default_runtime
            self.max_runtime_seconds = runtime_value if runtime_value > 0 else None

        # Maximum expirations to evaluate per symbol when fetching chains
        self.max_expirations = 6

        # High-volume stocks that typically have good options liquidity
        base_symbols = [
            'SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX',
            'AMD', 'INTC', 'CRM', 'ADBE', 'PYPL', 'UBER', 'SQ', 'ROKU', 'ZM', 'DOCU',
            'SNOW', 'PLTR', 'COIN', 'HOOD', 'SOFI', 'AFRM', 'UPST', 'LCID', 'RIVN', 'XPEV',
            'SHOP', 'CRWD', 'SMCI', 'MARA', 'AI', 'AVGO', 'ASML', 'ANET', 'MDB',
        ]

        self.priority_symbols = self._build_priority_symbols(base_symbols, self.settings)
        
        # Alternative data sources
        self.data_sources = {
            'adapter': self.fetch_options_via_adapter,
            'yfinance': self.fetch_options_via_adapter,
            'polygon': self.fetch_polygon_options,  # If you have API key
            'alpha_vantage': self.fetch_alpha_vantage_options  # If you have API key
        }

    def _build_priority_symbols(self, base_symbols, settings=None):
        """Combine static high-liquidity names with configured watchlists."""

        symbols = list(base_symbols)
        try:
            effective_settings = settings or get_settings()
            for watchlist in effective_settings.watchlists.values():
                symbols.extend(watchlist)
        except Exception as exc:  # pragma: no cover - defensive
            print(f"⚠️  Unable to load watchlist symbols from config: {exc}")

        # Preserve order while removing duplicates and normalising case
        seen = set()
        unique_symbols = []
        for raw_symbol in symbols:
            symbol = str(raw_symbol).upper().strip()
            if not symbol or symbol in seen:
                continue
            seen.add(symbol)
            unique_symbols.append(symbol)

        return unique_symbols

    def fetch_options_via_adapter(self, symbol, max_expirations: int = 3):
        """Fetch options data using the configured adapter."""

        try:
            expirations = self.adapter.get_expirations(symbol)
        except AdapterError as exc:
            print(f"Error loading expirations for {symbol}: {exc}")
            return None
        except NotImplementedError:
            print("Configured adapter does not support expiration lookup.")
            return None

        if not expirations:
            return None

        all_options = []
        for exp_date in expirations[:max_expirations]:
            try:
                chain = self.adapter.get_chain(symbol, exp_date)
            except AdapterError as exc:
                print(f"Error fetching {symbol} options for {exp_date}: {exc}")
                continue
            except Exception as exc:  # pragma: no cover - defensive branch
                print(f"Unexpected error fetching {symbol} options: {exc}")
                continue

            options_df = chain.to_dataframe()
            if not options_df.empty:
                all_options.append(options_df)

            # Small delay to avoid rate limits on subsequent requests
            time.sleep(0.1)

        if all_options:
            return pd.concat(all_options, ignore_index=True)

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
    
    def _resolve_symbol_limit(self, requested_limit: int | None) -> int | None:
        if requested_limit is not None:
            return requested_limit
        if self.fetcher_settings is not None:
            return self.fetcher_settings.max_priority_symbols
        return None

    def fetch_bulk_options_parallel(self, symbols=None, max_workers=5, max_symbols: int | None = None):
        """Fetch options data for multiple symbols in parallel"""
        symbol_limit = self._resolve_symbol_limit(max_symbols)
        if symbols is None:
            symbols = self.priority_symbols
            if symbol_limit is not None:
                symbols = symbols[:symbol_limit]
        else:
            # Ensure we do not request duplicate symbols from callers
            cleaned_symbols = []
            seen = set()
            for sym in symbols:
                if not sym:
                    continue
                normalized = str(sym).upper().strip()
                if normalized in seen:
                    continue
                seen.add(normalized)
                cleaned_symbols.append(normalized)
            symbols = cleaned_symbols
            if symbol_limit is not None:
                symbols = symbols[:symbol_limit]
        
        all_options_data = []
        successful_fetches = 0
        
        print(f"Fetching options data for {len(symbols)} symbols using {max_workers} workers...")
        
        start_time = time.monotonic()
        deadline = None
        if self.max_runtime_seconds is not None:
            deadline = start_time + self.max_runtime_seconds

        executor = concurrent.futures.ThreadPoolExecutor(max_workers=max_workers)
        future_to_symbol = {
            executor.submit(self.fetch_options_via_adapter, symbol, self.max_expirations): symbol
            for symbol in symbols
        }
        pending = set(future_to_symbol.keys())
        timed_out = False

        try:
            while pending:
                timeout = None
                if deadline is not None:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        timed_out = True
                        break
                    timeout = remaining

                done, pending = concurrent.futures.wait(
                    pending,
                    timeout=timeout,
                    return_when=concurrent.futures.FIRST_COMPLETED,
                )

                if not done:
                    timed_out = True
                    break

                for future in done:
                    symbol = future_to_symbol.get(future)
                    try:
                        options_data = future.result()
                        if options_data is not None and not options_data.empty:
                            all_options_data.append(options_data)
                            successful_fetches += 1
                            print(f"✅ {symbol}: {len(options_data)} options")
                        else:
                            print(f"❌ {symbol}: No data")
                    except Exception as e:  # pragma: no cover - network errors
                        print(f"❌ {symbol}: Error - {e}")
                    finally:
                        future_to_symbol.pop(future, None)

                if deadline is not None and time.monotonic() >= deadline:
                    timed_out = True
                    break
        finally:
            for future in pending:
                future.cancel()
            executor.shutdown(wait=False, cancel_futures=True)

        if timed_out:
            elapsed = time.monotonic() - start_time
            print(
                f"⏱️  Stopping fetch after {elapsed:.1f}s - collected {successful_fetches}/{len(symbols)} symbols",
            )

        if all_options_data:
            combined_df = pd.concat(all_options_data, ignore_index=True)
            print(f"\n📊 Total options fetched: {len(combined_df)}")
            print(f"📈 Successful symbols: {successful_fetches}/{len(symbols)}")
            return combined_df
        else:
            print("❌ No options data fetched")
            return None
    
    def _has_future_contracts(self, frame: pd.DataFrame) -> bool:
        """Determine whether a DataFrame contains any non-expired contracts."""

        if frame is None or frame.empty or "expiration" not in frame.columns:
            return False

        expirations = pd.to_datetime(frame["expiration"], errors="coerce", utc=True)
        if expirations.empty:
            return False

        now = pd.Timestamp.now(tz=timezone.utc)
        return bool((expirations >= now - pd.Timedelta(minutes=1)).any())

    def save_to_cache(self, data, filename="options_cache.json"):
        """Save options data to cache file"""
        try:
            # Convert DataFrame to JSON-serializable format
            data_dict = data.to_dict('records')

            # Custom JSON encoder to handle pandas Timestamp objects
            def json_serializer(obj):
                """JSON serializer for objects not serializable by default json code"""
                if isinstance(obj, pd.Timestamp):
                    return obj.isoformat()
                elif hasattr(obj, 'isoformat'):
                    return obj.isoformat()
                raise TypeError(f"Type {type(obj)} not serializable")

            cache_data = {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'data_count': len(data_dict),
                'symbols': data['symbol'].unique().tolist(),
                'options': data_dict
            }

            with open(filename, 'w') as f:
                json.dump(cache_data, f, indent=2, default=json_serializer)

            print(f"💾 Cached {len(data_dict)} options to {filename}")

        except Exception as e:
            print(f"Error saving cache: {e}")
    
    def load_from_cache(
        self,
        filename="options_cache.json",
        max_age_minutes=15,
        symbols: list[str] | None = None,
        *,
        allow_stale: bool = False,
    ):
        """Load options data from cache if it's recent enough"""
        try:
            with open(filename, 'r') as f:
                cache_data = json.load(f)

            cache_time = datetime.fromisoformat(cache_data['timestamp'])
            if cache_time.tzinfo is None:
                cache_time = cache_time.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            raw_age_minutes = (now - cache_time).total_seconds() / 60

            cache_frame = pd.DataFrame(cache_data['options'])
            has_future_contracts = self._has_future_contracts(cache_frame)
            cache_frame.attrs["cache_timestamp"] = cache_time.isoformat()
            cache_frame.attrs["cache_age_minutes"] = max(raw_age_minutes, 0.0)
            cache_frame.attrs["cache_used"] = True
            cache_frame.attrs["cache_has_future_contracts"] = has_future_contracts

            cached_symbols = [str(sym).upper() for sym in cache_data.get('symbols', [])]
            symbol_mismatch = False
            if symbols is not None:
                requested = [str(sym).upper() for sym in symbols if sym]
                if sorted(requested) != sorted(cached_symbols):
                    symbol_mismatch = True
                    if not allow_stale:
                        print("📂 Cache symbols mismatch, refreshing data")
                        return None
                    print("⚠️  Cache symbols mismatch – using stale cache dataset")

            if raw_age_minutes < 0:
                print("⚠️  Cache timestamp is in the future; discarding fresh cache")
                if allow_stale:
                    cache_frame.attrs["cache_source"] = "adapter-cache-stale"
                    cache_frame.attrs["cache_stale"] = True
                    cache_frame.attrs["cache_age_minutes"] = abs(raw_age_minutes)
                    return cache_frame
                return None

            if not has_future_contracts:
                print("📂 Cache contains only expired contracts")
                if allow_stale:
                    cache_frame.attrs["cache_source"] = "adapter-cache-stale"
                    cache_frame.attrs["cache_stale"] = True
                    return cache_frame
                return None

            if raw_age_minutes <= max_age_minutes:
                print(f"📂 Using cached data ({raw_age_minutes:.1f} minutes old)")
                cache_frame.attrs["cache_source"] = "adapter-cache"
                cache_frame.attrs["cache_stale"] = False
                return cache_frame

            print(f"🕐 Cache too old ({raw_age_minutes:.1f} minutes), will fetch fresh data")

            if allow_stale:
                print("⚠️  Falling back to stale cache - live fetch failed")
                cache_frame.attrs["cache_source"] = "adapter-cache-stale"
                cache_frame.attrs["cache_stale"] = True
                return cache_frame

            return None

        except FileNotFoundError:
            print("📂 No cache file found")
            return None
        except Exception as e:
            print(f"Error loading cache: {e}")
            return None
    
    def get_fresh_options_data(
        self,
        use_cache=True,
        max_symbols: int | None = None,
        symbols: list[str] | None = None,
    ):
        """Get fresh options data, using cache if available"""
        normalized_symbols: list[str] | None = None
        if symbols is not None:
            seen: set[str] = set()
            normalized_symbols = []
            for sym in symbols:
                if not sym:
                    continue
                normal = str(sym).upper().strip()
                if not normal or normal in seen:
                    continue
                seen.add(normal)
                normalized_symbols.append(normal)

        if use_cache:
            cached_data = self.load_from_cache(symbols=normalized_symbols)
            if cached_data is not None:
                return cached_data

        # Fetch fresh data
        if normalized_symbols is not None:
            fresh_data = self.fetch_bulk_options_parallel(symbols=normalized_symbols, max_symbols=max_symbols)
        else:
            fresh_data = self.fetch_bulk_options_parallel(max_symbols=max_symbols)

        if fresh_data is not None:
            fetch_time = datetime.now(timezone.utc).isoformat()
            has_future_contracts = self._has_future_contracts(fresh_data)
            fresh_data.attrs["cache_timestamp"] = fetch_time
            fresh_data.attrs["cache_age_minutes"] = 0.0
            fresh_data.attrs["cache_source"] = "adapter-live"
            fresh_data.attrs["cache_stale"] = not has_future_contracts
            fresh_data.attrs["cache_used"] = False
            fresh_data.attrs["cache_has_future_contracts"] = has_future_contracts

            if has_future_contracts:
                self.save_to_cache(fresh_data)
            else:
                print("⚠️  Live fetch returned only expired contracts; skipping cache save")

            return fresh_data

        if use_cache:
            stale_cache = self.load_from_cache(
                symbols=normalized_symbols,
                allow_stale=True,
            )
            if stale_cache is not None:
                return stale_cache

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
