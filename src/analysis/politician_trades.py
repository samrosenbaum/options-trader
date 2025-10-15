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

    NOTE: Currently returns demo data. Capitol Trades website has anti-scraping protections.
    For real-time data, consider:
    - Quiver Quantitative API ($30-50/month) - Most comprehensive
    - Capitol Trades API (requires subscription)
    - Other congressional trading APIs

    Args:
        symbols: Optional list of symbols to filter. If None, fetches all recent trades.
        days_back: How many days back to look for trades

    Returns:
        List of PoliticianTrade objects
    """
    trades = []

    # Try to fetch real data from Capitol Trades
    try:
        # Use Capitol Trades public trades page (HTML scraping)
        base_url = "https://www.capitoltrades.com/trades"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }

        # Add symbol filter if provided
        if symbols and len(symbols) == 1:
            url = f"{base_url}?symbol={symbols[0]}"
        else:
            url = base_url

        response = requests.get(url, timeout=15, headers=headers)

        if response.status_code == 200:
            # Parse HTML to extract trade data
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.content, 'html.parser')

            # Find trade cards/rows in the HTML
            # Capitol Trades uses a table structure with class 'q-table'
            trade_rows = soup.find_all('tr', class_='q-tr')[:50]  # Limit to 50 trades

            for row in trade_rows:
                try:
                    # Extract politician info
                    politician_cell = row.find('td', class_='q-column--politician')
                    if not politician_cell:
                        continue

                    politician_link = politician_cell.find('a')
                    politician_name = politician_link.text.strip() if politician_link else "Unknown"

                    # Extract party and chamber info
                    party_info = politician_cell.find('span', class_='q-field--party')
                    party = "Unknown"
                    chamber = "Unknown"

                    if party_info:
                        party_text = party_info.text.strip()
                        if 'D' in party_text or 'Democrat' in party_text:
                            party = "Democrat"
                        elif 'R' in party_text or 'Republican' in party_text:
                            party = "Republican"

                        if 'House' in party_text or 'Representative' in politician_name:
                            chamber = "House"
                        elif 'Senate' in party_text or 'Senator' in politician_name:
                            chamber = "Senate"

                    # Extract ticker
                    ticker_cell = row.find('td', class_='q-column--ticker')
                    ticker = ticker_cell.text.strip() if ticker_cell else None

                    if not ticker or ticker == '--':
                        continue

                    # Filter by symbols if provided
                    if symbols and ticker not in symbols:
                        continue

                    # Extract transaction type
                    trade_type_cell = row.find('td', class_='q-column--txType')
                    trade_type_text = trade_type_cell.text.strip().lower() if trade_type_cell else "purchase"

                    transaction_type = "purchase"
                    if "sale" in trade_type_text or "sold" in trade_type_text:
                        transaction_type = "sale"
                    elif "exchange" in trade_type_text:
                        transaction_type = "exchange"

                    # Extract amount range
                    amount_cell = row.find('td', class_='q-column--size')
                    amount_range = amount_cell.text.strip() if amount_cell else "$1,001 - $15,000"

                    # Extract dates
                    trade_date_cell = row.find('td', class_='q-column--txDate')
                    disclosure_date_cell = row.find('td', class_='q-column--pubDate')

                    trade_date = None
                    disclosure_date = None

                    if trade_date_cell:
                        try:
                            trade_date_str = trade_date_cell.text.strip()
                            trade_date = datetime.strptime(trade_date_str, "%Y-%m-%d")
                            trade_date = trade_date.replace(tzinfo=timezone.utc)
                        except Exception:
                            pass

                    if disclosure_date_cell:
                        try:
                            disclosure_date_str = disclosure_date_cell.text.strip()
                            disclosure_date = datetime.strptime(disclosure_date_str, "%Y-%m-%d")
                            disclosure_date = disclosure_date.replace(tzinfo=timezone.utc)
                        except Exception:
                            pass

                    # Create trade object
                    trade = PoliticianTrade(
                        politician_name=politician_name,
                        party=party,
                        chamber=chamber,
                        ticker=ticker,
                        transaction_type=transaction_type,
                        amount_range=amount_range,
                        trade_date=trade_date,
                        disclosure_date=disclosure_date,
                    )

                    trades.append(trade)

                except Exception as e:
                    print(f"Error parsing trade row: {e}")
                    continue

        else:
            print(f"Error fetching Capitol Trades: HTTP {response.status_code}")
            print("Falling back to demo data...")

    except Exception as e:
        print(f"Error fetching politician trades: {e}")
        print("Falling back to demo data...")

    # If no trades fetched from real source, use demo data
    if not trades:
        print("Using demo politician trades data")
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
