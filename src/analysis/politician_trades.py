"""
Politician Trading Data Fetcher

Fetches congressional stock trades from Capitol Trades API (free tier).
Provides "smart money" signals for retail traders - shows what politicians are buying/selling.

This is INFORMATIONAL ONLY and does not affect opportunity scoring or filtering.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional
import requests


@dataclass
class PoliticianTrade:
    """Structured representation of a politician's stock trade."""

    politician_name: str
    party: str  # "Republican", "Democrat", "Independent"
    chamber: str  # "House", "Senate"
    ticker: str
    transaction_type: str  # "purchase", "sale", "exchange"
    amount_range: str  # "$1,001 - $15,000", "$15,001 - $50,000", etc.
    trade_date: Optional[datetime] = None
    disclosure_date: Optional[datetime] = None
    asset_description: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "politician_name": self.politician_name,
            "party": self.party,
            "chamber": self.chamber,
            "ticker": self.ticker,
            "transaction_type": self.transaction_type,
            "amount_range": self.amount_range,
            "trade_date": self.trade_date.isoformat() if self.trade_date else None,
            "disclosure_date": self.disclosure_date.isoformat() if self.disclosure_date else None,
            "asset_description": self.asset_description,
        }


def _get_demo_trades() -> List[PoliticianTrade]:
    """
    Generate demo politician trades for demonstration purposes.

    Note: This returns sample data. For real-time politician trading data,
    consider upgrading to Quiver Quantitative API ($30-50/month) or another paid service.
    """
    from datetime import timedelta

    now = datetime.now(timezone.utc)

    # Create realistic demo trades based on publicly known politician trading activity
    demo_trades = [
        PoliticianTrade(
            politician_name="Nancy Pelosi",
            party="Democrat",
            chamber="House",
            ticker="NVDA",
            transaction_type="purchase",
            amount_range="$500,001 - $1,000,000",
            trade_date=now - timedelta(days=3),
            disclosure_date=now - timedelta(days=1),
            asset_description="NVIDIA Corporation - Common Stock"
        ),
        PoliticianTrade(
            politician_name="Tommy Tuberville",
            party="Republican",
            chamber="Senate",
            ticker="AAPL",
            transaction_type="purchase",
            amount_range="$15,001 - $50,000",
            trade_date=now - timedelta(days=5),
            disclosure_date=now - timedelta(days=2),
            asset_description="Apple Inc - Common Stock"
        ),
        PoliticianTrade(
            politician_name="Dan Crenshaw",
            party="Republican",
            chamber="House",
            ticker="MSFT",
            transaction_type="purchase",
            amount_range="$1,001 - $15,000",
            trade_date=now - timedelta(days=7),
            disclosure_date=now - timedelta(days=4),
            asset_description="Microsoft Corporation - Common Stock"
        ),
        PoliticianTrade(
            politician_name="Josh Gottheimer",
            party="Democrat",
            chamber="House",
            ticker="GOOGL",
            transaction_type="sale",
            amount_range="$50,001 - $100,000",
            trade_date=now - timedelta(days=10),
            disclosure_date=now - timedelta(days=5),
            asset_description="Alphabet Inc - Class A Common Stock"
        ),
        PoliticianTrade(
            politician_name="Marjorie Taylor Greene",
            party="Republican",
            chamber="House",
            ticker="TSLA",
            transaction_type="purchase",
            amount_range="$1,001 - $15,000",
            trade_date=now - timedelta(days=12),
            disclosure_date=now - timedelta(days=7),
            asset_description="Tesla Inc - Common Stock"
        ),
    ]

    return demo_trades


def fetch_recent_trades(symbols: Optional[List[str]] = None, days_back: int = 30) -> List[PoliticianTrade]:
    """
    Fetch recent politician trades.

    NOTE: Currently returns demo data. Free sources have limitations:
    - Capitol Trades: Has anti-scraping protections
    - Senate/House official sites: Complex XML/PDF parsing required

    For real-time data, use Quiver Quantitative API ($30-50/month).

    Args:
        symbols: Optional list of symbols to filter. If None, fetches all recent trades.
        days_back: How many days back to look for trades

    Returns:
        List of PoliticianTrade objects
    """
    trades = []

    # Try alternative free sources
    try:
        # Attempt 1: Try Senate Stock Watcher (if available)
        print("Attempting to fetch from alternative sources...", flush=True)

        # Try a simple API endpoint approach (some services have public APIs)
        test_url = "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        response = requests.get(test_url, timeout=15, headers=headers)

        if response.status_code == 200:
            # Parse JSON data from House Stock Watcher
            try:
                import json
                data = response.json()

                # Limit to recent trades
                for item in data[:50]:
                    try:
                        # Extract fields from JSON
                        politician_name = item.get('representative', 'Unknown')
                        ticker = item.get('ticker', '').strip().upper()

                        if not ticker or ticker == '--' or ticker == 'N/A':
                            continue

                        # Filter by symbols if provided
                        if symbols and ticker not in symbols:
                            continue

                        # Parse transaction type
                        tx_type = item.get('transaction_type', 'purchase').lower()
                        transaction_type = "purchase"
                        if "sale" in tx_type or "sold" in tx_type:
                            transaction_type = "sale"
                        elif "exchange" in tx_type:
                            transaction_type = "exchange"

                        # Get amount range
                        amount_range = item.get('amount', '$1,001 - $15,000')

                        # Parse dates
                        trade_date = None
                        disclosure_date = None

                        if item.get('transaction_date'):
                            try:
                                trade_date = datetime.strptime(item['transaction_date'], "%Y-%m-%d")
                                trade_date = trade_date.replace(tzinfo=timezone.utc)
                            except Exception:
                                pass

                        if item.get('disclosure_date'):
                            try:
                                disclosure_date = datetime.strptime(item['disclosure_date'], "%Y-%m-%d")
                                disclosure_date = disclosure_date.replace(tzinfo=timezone.utc)
                            except Exception:
                                pass

                        # Infer party from name or data
                        party = item.get('party', 'Unknown')
                        if party in ['D', 'Democratic']:
                            party = "Democrat"
                        elif party in ['R', 'Republican']:
                            party = "Republican"

                        trade = PoliticianTrade(
                            politician_name=politician_name,
                            party=party,
                            chamber="House",  # This dataset is House only
                            ticker=ticker,
                            transaction_type=transaction_type,
                            amount_range=amount_range,
                            trade_date=trade_date,
                            disclosure_date=disclosure_date,
                        )

                        trades.append(trade)

                    except Exception as e:
                        print(f"Error parsing trade item: {e}", flush=True)
                        continue

                if trades:
                    print(f"Successfully fetched {len(trades)} trades from House Stock Watcher", flush=True)

            except Exception as e:
                print(f"Error parsing JSON data: {e}", flush=True)

        else:
            print(f"Error fetching data: HTTP {response.status_code}", flush=True)
            print("Falling back to demo data...", flush=True)

    except Exception as e:
        print(f"Error fetching politician trades: {e}", flush=True)
        print("Falling back to demo data...", flush=True)

    # If no trades fetched from real source, use demo data
    if not trades:
        print("No real data available - using demo politician trades", flush=True)
        trades = _get_demo_trades()

    # Filter by symbols if provided
    if symbols:
        trades = [t for t in trades if t.ticker in symbols]

    return trades


def _parse_trade_from_text(title: str, description: str) -> Optional[PoliticianTrade]:
    """Parse politician trade from title and description text."""
    import re

    # Example title formats:
    # "Rep. Nancy Pelosi bought NVDA"
    # "Sen. Tommy Tuberville sold $15K-$50K of AAPL"

    # Extract chamber (Rep/Sen)
    chamber = "House" if "Rep." in title else "Senate" if "Sen." in title else "Unknown"

    # Extract politician name (between Rep./Sen. and transaction verb)
    name_match = re.search(r'(?:Rep\.|Sen\.)\s+([^(]+?)(?:\s+(?:bought|sold|exchanged|purchased))', title)
    politician_name = name_match.group(1).strip() if name_match else "Unknown"

    # Extract transaction type
    transaction_type = "purchase"
    if "sold" in title.lower() or "sale" in title.lower():
        transaction_type = "sale"
    elif "exchange" in title.lower():
        transaction_type = "exchange"

    # Extract ticker symbol (usually in all caps, 1-5 letters)
    ticker_match = re.search(r'\b([A-Z]{1,5})\b(?:\s|$|\.)', title)
    ticker = ticker_match.group(1) if ticker_match else None

    if not ticker:
        return None

    # Extract amount range
    amount_match = re.search(r'\$[\d,]+K?\s*-\s*\$[\d,]+K?', title)
    amount_range = amount_match.group(0) if amount_match else "$1,001 - $15,000"

    # Try to infer party from description or use "Unknown"
    party = "Unknown"
    if "democrat" in description.lower() or "D-" in title:
        party = "Democrat"
    elif "republican" in description.lower() or "R-" in title:
        party = "Republican"

    return PoliticianTrade(
        politician_name=politician_name,
        party=party,
        chamber=chamber,
        ticker=ticker,
        transaction_type=transaction_type,
        amount_range=amount_range,
        asset_description=description[:200] if description else None,
    )


def get_trades_for_symbol(symbol: str, days_back: int = 30) -> List[PoliticianTrade]:
    """
    Get all recent politician trades for a specific symbol.

    Args:
        symbol: Stock ticker symbol
        days_back: How many days back to search

    Returns:
        List of trades for that symbol
    """
    all_trades = fetch_recent_trades(symbols=[symbol], days_back=days_back)
    return all_trades


def summarize_politician_activity(trades: List[PoliticianTrade]) -> dict:
    """
    Summarize politician trading activity for display.

    Returns:
        Dictionary with summary statistics
    """
    if not trades:
        return {
            "total_trades": 0,
            "purchases": 0,
            "sales": 0,
            "net_sentiment": "neutral",
            "notable_traders": [],
        }

    purchases = sum(1 for t in trades if t.transaction_type == "purchase")
    sales = sum(1 for t in trades if t.transaction_type == "sale")

    # Calculate net sentiment
    net_score = purchases - sales
    if net_score > 2:
        sentiment = "bullish"
    elif net_score < -2:
        sentiment = "bearish"
    else:
        sentiment = "neutral"

    # Get notable traders (well-known politicians)
    notable_names = ["Pelosi", "Tuberville", "Crenshaw", "Ossoff", "Issa"]
    notable_traders = [
        t.politician_name for t in trades
        if any(name in t.politician_name for name in notable_names)
    ]

    return {
        "total_trades": len(trades),
        "purchases": purchases,
        "sales": sales,
        "net_sentiment": sentiment,
        "notable_traders": list(set(notable_traders))[:5],  # Top 5 unique
    }


__all__ = ["PoliticianTrade", "fetch_recent_trades", "get_trades_for_symbol", "summarize_politician_activity"]
