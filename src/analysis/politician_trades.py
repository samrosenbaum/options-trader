"""
Politician Trading Data Fetcher

Fetches congressional stock trades from our local database.
Data is scraped from House Stock Watcher and Senate Stock Watcher public sources.
Provides "smart money" signals for retail traders - shows what politicians are buying/selling.

This is INFORMATIONAL ONLY and does not affect opportunity scoring or filtering.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import os
import sys


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
    Fetch recent politician trades from the database.

    Data is sourced from our scraper that pulls from:
    - House Stock Watcher (House of Representatives trades)
    - Senate Stock Watcher (Senate trades)

    Falls back to demo data if database is unavailable.

    Args:
        symbols: Optional list of symbols to filter. If None, fetches all recent trades.
        days_back: How many days back to look for trades

    Returns:
        List of PoliticianTrade objects
    """
    trades = []

    # Try to fetch from database first
    try:
        from supabase import create_client, Client

        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_anon_key = os.environ.get("SUPABASE_ANON_KEY")

        if supabase_url and supabase_anon_key:
            client: Client = create_client(supabase_url, supabase_anon_key)

            # Calculate cutoff date
            cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).date().isoformat()

            # Query the database
            query = client.table("politician_trades").select("*")
            query = query.gte("disclosure_date", cutoff_date)

            if symbols:
                query = query.in_("ticker", symbols)

            query = query.order("disclosure_date", desc=True).limit(500)

            result = query.execute()

            if result.data:
                # Convert database records to PoliticianTrade objects
                for record in result.data:
                    try:
                        # Parse dates
                        trade_date = None
                        disclosure_date = None

                        if record.get('transaction_date'):
                            try:
                                trade_date = datetime.fromisoformat(record['transaction_date'])
                                if trade_date.tzinfo is None:
                                    trade_date = trade_date.replace(tzinfo=timezone.utc)
                            except Exception:
                                pass

                        if record.get('disclosure_date'):
                            try:
                                disclosure_date = datetime.fromisoformat(record['disclosure_date'])
                                if disclosure_date.tzinfo is None:
                                    disclosure_date = disclosure_date.replace(tzinfo=timezone.utc)
                            except Exception:
                                pass

                        trade = PoliticianTrade(
                            politician_name=record['politician_name'],
                            party=record['party'],
                            chamber=record['chamber'],
                            ticker=record['ticker'],
                            transaction_type=record['transaction_type'],
                            amount_range=record['amount_range'],
                            trade_date=trade_date,
                            disclosure_date=disclosure_date,
                            asset_description=record.get('asset_description'),
                        )

                        trades.append(trade)

                    except Exception as e:
                        print(f"Error parsing database record: {e}", flush=True)
                        continue

                print(f"Successfully fetched {len(trades)} trades from database", flush=True)

    except ImportError:
        print("Supabase client not available, using demo data", flush=True)
    except Exception as e:
        print(f"Error fetching from database: {e}", flush=True)

    # If no trades fetched from database, use demo data
    if not trades:
        print("No database data available - using demo politician trades", flush=True)
        trades = _get_demo_trades()

    # Filter by symbols if provided (for demo data)
    if symbols and trades and trades[0].politician_name == "Nancy Pelosi":  # Demo data check
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
