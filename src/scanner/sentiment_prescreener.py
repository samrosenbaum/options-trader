"""
Market Sentiment Pre-Screener

Fast first-pass screener that identifies high-potential symbols using FREE data sources:
1. Stock momentum (biggest movers today)
2. Volume surges (unusual activity)
3. IV rank expansion (volatility opportunities)
4. Earnings calendar (catalyst plays)

This reverses the pipeline: instead of scanning 150+ symbols and filtering,
we pre-screen to ~30-50 hot symbols and scan those with high accuracy.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set

import pandas as pd
import yfinance as yf

from src.scanner.iv_rank_history import IVRankHistory


class SentimentPreScreener:
    """Pre-screen symbols based on live market sentiment and activity."""

    def __init__(self, iv_history: Optional[IVRankHistory] = None):
        """
        Initialize pre-screener.

        Args:
            iv_history: Optional IV rank history database for volatility screening
        """
        self.iv_history = iv_history
        self.cache = {}  # Cache results for current session
        self.cache_timestamp = None

    def get_top_gainers(self, limit: int = 20) -> List[str]:
        """
        Get today's top gaining stocks using Yahoo Finance.

        Args:
            limit: Maximum number of symbols to return

        Returns:
            List of symbols sorted by gain %
        """
        try:
            # Use Yahoo Finance's built-in screener
            # Note: This is a free API, no key needed
            print("🟢 Fetching top gainers...", file=sys.stderr)

            # Get S&P 500 tickers as baseline (free source)
            sp500_url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
            sp500_table = pd.read_html(sp500_url)[0]
            sp500_symbols = sp500_table['Symbol'].tolist()

            # Sample: Check price changes for active symbols
            gainers = []
            check_count = min(100, len(sp500_symbols))  # Sample first 100

            for symbol in sp500_symbols[:check_count]:
                try:
                    ticker = yf.Ticker(symbol)
                    hist = ticker.history(period="2d")

                    if len(hist) >= 2:
                        change_pct = ((hist['Close'].iloc[-1] - hist['Close'].iloc[-2]) / hist['Close'].iloc[-2]) * 100

                        if change_pct > 1.5:  # 1.5% threshold
                            gainers.append((symbol, change_pct))

                except Exception:
                    continue

            # Sort by gain and return top N
            gainers.sort(key=lambda x: x[1], reverse=True)
            symbols = [s[0] for s in gainers[:limit]]

            print(f"✅ Found {len(symbols)} top gainers", file=sys.stderr)
            return symbols

        except Exception as e:
            print(f"⚠️  Error fetching gainers: {e}", file=sys.stderr)
            return []

    def get_top_losers(self, limit: int = 20) -> List[str]:
        """
        Get today's top losing stocks (for put opportunities).

        Args:
            limit: Maximum number of symbols to return

        Returns:
            List of symbols sorted by loss %
        """
        try:
            print("🔴 Fetching top losers...", file=sys.stderr)

            # Same approach as gainers, but looking for losses
            sp500_url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
            sp500_table = pd.read_html(sp500_url)[0]
            sp500_symbols = sp500_table['Symbol'].tolist()

            losers = []
            check_count = min(100, len(sp500_symbols))

            for symbol in sp500_symbols[:check_count]:
                try:
                    ticker = yf.Ticker(symbol)
                    hist = ticker.history(period="2d")

                    if len(hist) >= 2:
                        change_pct = ((hist['Close'].iloc[-1] - hist['Close'].iloc[-2]) / hist['Close'].iloc[-2]) * 100

                        if change_pct < -1.5:  # -1.5% threshold
                            losers.append((symbol, abs(change_pct)))

                except Exception:
                    continue

            losers.sort(key=lambda x: x[1], reverse=True)
            symbols = [s[0] for s in losers[:limit]]

            print(f"✅ Found {len(symbols)} top losers", file=sys.stderr)
            return symbols

        except Exception as e:
            print(f"⚠️  Error fetching losers: {e}", file=sys.stderr)
            return []

    def get_volume_surges(self, universe: List[str], limit: int = 20) -> List[str]:
        """
        Find symbols with unusual volume surges.

        Args:
            universe: List of symbols to check
            limit: Maximum number to return

        Returns:
            List of symbols with high volume ratios
        """
        try:
            print("📊 Checking for volume surges...", file=sys.stderr)

            volume_movers = []

            for symbol in universe[:50]:  # Sample first 50
                try:
                    ticker = yf.Ticker(symbol)
                    hist = ticker.history(period="30d")

                    if len(hist) < 10:
                        continue

                    today_vol = hist['Volume'].iloc[-1]
                    avg_vol = hist['Volume'].iloc[-20:-1].mean()

                    if avg_vol > 0:
                        vol_ratio = today_vol / avg_vol

                        if vol_ratio > 1.5:  # 1.5x average volume
                            volume_movers.append((symbol, vol_ratio))

                except Exception:
                    continue

            volume_movers.sort(key=lambda x: x[1], reverse=True)
            symbols = [s[0] for s in volume_movers[:limit]]

            print(f"✅ Found {len(symbols)} symbols with volume surges", file=sys.stderr)
            return symbols

        except Exception as e:
            print(f"⚠️  Error checking volume: {e}", file=sys.stderr)
            return []

    def get_high_iv_rank(self, universe: List[str], min_iv_rank: float = 70.0, limit: int = 20) -> List[str]:
        """
        Find symbols with high IV rank (volatility expansion opportunities).

        Args:
            universe: List of symbols to check
            min_iv_rank: Minimum IV rank threshold
            limit: Maximum number to return

        Returns:
            List of symbols with high IV rank
        """
        if not self.iv_history:
            print("⚠️  IV history not available", file=sys.stderr)
            return []

        try:
            print("🌊 Finding high IV rank symbols...", file=sys.stderr)

            high_iv = []

            for symbol in universe[:100]:  # Sample first 100
                try:
                    iv_rank = self.iv_history.get_current_iv_rank(symbol)

                    if iv_rank and iv_rank >= min_iv_rank:
                        high_iv.append((symbol, iv_rank))

                except Exception:
                    continue

            high_iv.sort(key=lambda x: x[1], reverse=True)
            symbols = [s[0] for s in high_iv[:limit]]

            print(f"✅ Found {len(symbols)} high IV rank symbols", file=sys.stderr)
            return symbols

        except Exception as e:
            print(f"⚠️  Error checking IV rank: {e}", file=sys.stderr)
            return []

    def get_earnings_plays(self, universe: List[str], days_ahead: int = 7, limit: int = 10) -> List[str]:
        """
        Find symbols with earnings in the next N days.

        Args:
            universe: List of symbols to check
            days_ahead: Look ahead this many days
            limit: Maximum number to return

        Returns:
            List of symbols with upcoming earnings
        """
        try:
            print("📅 Finding earnings plays...", file=sys.stderr)

            earnings_plays = []
            today = datetime.now()

            for symbol in universe[:50]:  # Sample first 50
                try:
                    ticker = yf.Ticker(symbol)
                    calendar = ticker.calendar

                    if calendar is not None and 'Earnings Date' in calendar:
                        earnings_dates = calendar['Earnings Date']

                        # Check if earnings is within our window
                        if isinstance(earnings_dates, pd.Series):
                            earnings_date = pd.to_datetime(earnings_dates.iloc[0])
                        else:
                            earnings_date = pd.to_datetime(earnings_dates)

                        days_until = (earnings_date - today).days

                        if 0 <= days_until <= days_ahead:
                            earnings_plays.append((symbol, days_until))

                except Exception:
                    continue

            earnings_plays.sort(key=lambda x: x[1])  # Sort by soonest first
            symbols = [s[0] for s in earnings_plays[:limit]]

            print(f"✅ Found {len(symbols)} earnings plays", file=sys.stderr)
            return symbols

        except Exception as e:
            print(f"⚠️  Error checking earnings: {e}", file=sys.stderr)
            return []

    def get_hot_symbols(
        self,
        universe: List[str],
        max_results: int = 50,
        *,
        include_gainers: bool = True,
        include_losers: bool = True,
        include_volume: bool = True,
        include_iv: bool = True,
        include_earnings: bool = True
    ) -> List[str]:
        """
        Get hot symbols from multiple sentiment sources.

        Args:
            universe: Full symbol universe to check
            max_results: Maximum number of symbols to return
            include_gainers: Include top gainers
            include_losers: Include top losers
            include_volume: Include volume surge symbols
            include_iv: Include high IV rank symbols
            include_earnings: Include earnings plays

        Returns:
            Deduplicated list of hot symbols, prioritized by frequency across sources
        """
        # Check cache
        if self.cache_timestamp and (datetime.now() - self.cache_timestamp).seconds < 300:  # 5 min cache
            print("📦 Using cached pre-screen results", file=sys.stderr)
            return self.cache.get('hot_symbols', [])[:max_results]

        print("\n🚀 Running sentiment pre-screen...")
        print("="*80, file=sys.stderr)

        symbol_scores: Dict[str, int] = {}

        # Source 1: Top gainers
        if include_gainers:
            gainers = self.get_top_gainers(limit=20)
            for symbol in gainers:
                symbol_scores[symbol] = symbol_scores.get(symbol, 0) + 3  # High weight

        # Source 2: Top losers (put opportunities)
        if include_losers:
            losers = self.get_top_losers(limit=20)
            for symbol in losers:
                symbol_scores[symbol] = symbol_scores.get(symbol, 0) + 3  # High weight

        # Source 3: Volume surges
        if include_volume:
            volume_symbols = self.get_volume_surges(universe, limit=20)
            for symbol in volume_symbols:
                symbol_scores[symbol] = symbol_scores.get(symbol, 0) + 2  # Medium weight

        # Source 4: High IV rank
        if include_iv:
            iv_symbols = self.get_high_iv_rank(universe, limit=20)
            for symbol in iv_symbols:
                symbol_scores[symbol] = symbol_scores.get(symbol, 0) + 2  # Medium weight

        # Source 5: Earnings plays
        if include_earnings:
            earnings_symbols = self.get_earnings_plays(universe, limit=10)
            for symbol in earnings_symbols:
                symbol_scores[symbol] = symbol_scores.get(symbol, 0) + 1  # Lower weight

        # Sort by score (symbols appearing in multiple sources ranked higher)
        ranked_symbols = sorted(symbol_scores.items(), key=lambda x: x[1], reverse=True)
        hot_symbols = [symbol for symbol, score in ranked_symbols][:max_results]

        # Cache results
        self.cache = {'hot_symbols': hot_symbols}
        self.cache_timestamp = datetime.now()

        print("="*80, file=sys.stderr)
        print(f"✅ Pre-screen complete: {len(hot_symbols)} hot symbols identified", file=sys.stderr)
        print(f"   Multi-source symbols: {sum(1 for _, score in ranked_symbols if score >= 3)}", file=sys.stderr)
        print(f"   Cache expires in 5 minutes\n", file=sys.stderr)

        return hot_symbols

    def get_symbol_sentiment_score(self, symbol: str) -> float:
        """
        Get sentiment score for a specific symbol (0-100).

        Higher scores indicate stronger sentiment signals.

        Returns:
            Sentiment score 0-100
        """
        score = 0.0

        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="30d")

            if len(hist) < 10:
                return 0.0

            # Price momentum (40 points max)
            change_pct = ((hist['Close'].iloc[-1] - hist['Close'].iloc[-2]) / hist['Close'].iloc[-2]) * 100
            score += min(40, abs(change_pct) * 10)

            # Volume surge (30 points max)
            today_vol = hist['Volume'].iloc[-1]
            avg_vol = hist['Volume'].iloc[-20:-1].mean()
            if avg_vol > 0:
                vol_ratio = today_vol / avg_vol
                score += min(30, (vol_ratio - 1) * 15)

            # Volatility (20 points max)
            if self.iv_history:
                iv_rank = self.iv_history.get_current_iv_rank(symbol)
                if iv_rank:
                    score += (iv_rank / 100) * 20

            # Consistency (10 points max)
            # Symbols moving consistently in one direction get bonus
            recent_closes = hist['Close'].iloc[-5:]
            if len(recent_closes) >= 5:
                if all(recent_closes.iloc[i] > recent_closes.iloc[i-1] for i in range(1, 5)):
                    score += 10  # Strong uptrend
                elif all(recent_closes.iloc[i] < recent_closes.iloc[i-1] for i in range(1, 5)):
                    score += 10  # Strong downtrend

        except Exception:
            return 0.0

        return min(100, score)


__all__ = ["SentimentPreScreener"]
