"""
Congressional Trading Data Scraper

Scrapes politician stock trading data from public disclosure sources:
- House: House Stock Watcher Data (S3 bucket)
- Senate: Senate Stock Watcher Data (GitHub repo aggregates)

This scraper pulls directly from free, public sources rather than using paid APIs.
Data is stored in the politician_trades table in Supabase.
"""

from __future__ import annotations

import requests
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class CongressionalTrade:
    """Structured representation of a congressional stock trade."""

    politician_name: str
    chamber: str  # "House" or "Senate"
    party: str  # "Democrat", "Republican", "Independent", "Unknown"
    ticker: str
    transaction_type: str  # "purchase", "sale", "exchange", "partial_sale"
    amount_range: str  # "$1,001 - $15,000", etc.
    disclosure_date: datetime
    transaction_date: Optional[datetime] = None
    disclosure_year: Optional[int] = None
    state: Optional[str] = None
    district: Optional[str] = None
    asset_description: Optional[str] = None
    owner: Optional[str] = None
    industry: Optional[str] = None
    sector: Optional[str] = None
    cap_gains_over_200_usd: Optional[bool] = None
    ptr_link: Optional[str] = None
    source_file: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for database insertion."""
        data = asdict(self)
        # Convert datetime objects to ISO format strings
        if self.transaction_date:
            data['transaction_date'] = self.transaction_date.date().isoformat()
        if self.disclosure_date:
            data['disclosure_date'] = self.disclosure_date.date().isoformat()
        return data


class HouseStockWatcherScraper:
    """Scraper for House of Representatives trading data."""

    BASE_URL = "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

    def fetch_all_transactions(self) -> List[CongressionalTrade]:
        """
        Fetch all House transactions from the House Stock Watcher S3 bucket.

        Returns:
            List of CongressionalTrade objects
        """
        trades = []

        try:
            # Try JSON endpoint first
            json_url = f"{self.BASE_URL}/all_transactions.json"
            logger.info(f"Fetching House data from: {json_url}")

            response = self.session.get(json_url, timeout=30)
            response.raise_for_status()

            data = response.json()
            logger.info(f"Successfully fetched {len(data)} House transactions")

            for item in data:
                trade = self._parse_house_transaction(item)
                if trade:
                    trades.append(trade)

            logger.info(f"Successfully parsed {len(trades)} House trades")

        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching House data: {e}")
            # Try CSV as fallback
            try:
                csv_url = f"{self.BASE_URL}/all_transactions.csv"
                logger.info(f"Trying CSV fallback: {csv_url}")
                response = self.session.get(csv_url, timeout=30)
                response.raise_for_status()
                trades = self._parse_csv(response.text)
            except Exception as csv_error:
                logger.error(f"CSV fallback also failed: {csv_error}")

        return trades

    def _parse_house_transaction(self, item: Dict[str, Any]) -> Optional[CongressionalTrade]:
        """Parse a single House transaction from JSON data."""
        try:
            # Extract ticker
            ticker = item.get('ticker', '').strip().upper()
            if not ticker or ticker in ['--', 'N/A', '']:
                return None

            # Parse politician name
            politician_name = item.get('representative', 'Unknown')

            # Parse transaction type
            tx_type = item.get('type', 'purchase').lower()
            transaction_type = "purchase"
            if "sale" in tx_type or "sold" in tx_type:
                transaction_type = "sale"
            elif "exchange" in tx_type:
                transaction_type = "exchange"
            elif "partial" in tx_type:
                transaction_type = "partial_sale"

            # Parse amount range
            amount_range = item.get('amount', '$1,001 - $15,000')

            # Parse dates
            transaction_date = None
            disclosure_date = None

            if item.get('transaction_date'):
                try:
                    transaction_date = datetime.strptime(item['transaction_date'], "%Y-%m-%d")
                    transaction_date = transaction_date.replace(tzinfo=timezone.utc)
                except Exception:
                    pass

            if item.get('disclosure_date'):
                try:
                    disclosure_date = datetime.strptime(item['disclosure_date'], "%Y-%m-%d")
                    disclosure_date = disclosure_date.replace(tzinfo=timezone.utc)
                except Exception:
                    pass

            # If no disclosure date, skip this trade
            if not disclosure_date:
                return None

            # Parse party
            party = item.get('party', 'Unknown')
            if party in ['D', 'Democratic', 'Democrat']:
                party = "Democrat"
            elif party in ['R', 'Republican']:
                party = "Republican"
            elif party in ['I', 'Independent']:
                party = "Independent"
            else:
                party = "Unknown"

            # Extract disclosure year
            disclosure_year = item.get('disclosure_year')
            if disclosure_year:
                try:
                    disclosure_year = int(disclosure_year)
                except:
                    disclosure_year = disclosure_date.year if disclosure_date else None

            trade = CongressionalTrade(
                politician_name=politician_name,
                chamber="House",
                party=party,
                ticker=ticker,
                transaction_type=transaction_type,
                amount_range=amount_range,
                disclosure_date=disclosure_date,
                transaction_date=transaction_date,
                disclosure_year=disclosure_year,
                state=item.get('state'),
                district=item.get('district'),
                asset_description=item.get('asset_description'),
                owner=item.get('owner'),
                industry=item.get('industry'),
                sector=item.get('sector'),
                cap_gains_over_200_usd=item.get('cap_gains_over_200_usd') == 'true',
                ptr_link=item.get('ptr_link'),
                source_file="house-stock-watcher-data",
                raw_data=item
            )

            return trade

        except Exception as e:
            logger.error(f"Error parsing House transaction: {e}")
            return None

    def _parse_csv(self, csv_text: str) -> List[CongressionalTrade]:
        """Parse CSV data as fallback."""
        import csv
        from io import StringIO

        trades = []
        reader = csv.DictReader(StringIO(csv_text))

        for row in reader:
            trade = self._parse_house_transaction(row)
            if trade:
                trades.append(trade)

        return trades


class SenateStockWatcherScraper:
    """Scraper for Senate trading data from GitHub aggregate files."""

    # GitHub raw content URLs for aggregate data
    AGGREGATE_BASE = "https://raw.githubusercontent.com/timothycarambat/senate-stock-watcher-data/master/aggregate"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

    def fetch_all_transactions(self) -> List[CongressionalTrade]:
        """
        Fetch Senate transactions from the aggregate JSON file.

        Returns:
            List of CongressionalTrade objects
        """
        trades = []

        try:
            # Fetch the all_transactions aggregate file
            url = f"{self.AGGREGATE_BASE}/all_transactions.json"
            logger.info(f"Fetching Senate data from: {url}")

            response = self.session.get(url, timeout=30)
            response.raise_for_status()

            data = response.json()
            logger.info(f"Successfully fetched Senate data with {len(data)} transactions")

            # The aggregate file is a list of all transactions
            for tx in data:
                trade = self._parse_senate_transaction(tx)
                if trade:
                    trades.append(trade)

            logger.info(f"Successfully parsed {len(trades)} Senate trades")

        except Exception as e:
            logger.error(f"Error fetching Senate data: {e}")

        return trades

    def _parse_senate_transaction(self, transaction: Dict[str, Any]) -> Optional[CongressionalTrade]:
        """Parse a single Senate transaction."""
        try:
            # Extract ticker
            ticker = transaction.get('ticker', '').strip().upper()
            if not ticker or ticker in ['--', 'N/A', '', 'N/A']:
                return None

            # Parse transaction type
            tx_type = transaction.get('type', 'purchase').lower()
            transaction_type = "purchase"
            if "sale" in tx_type or "sold" in tx_type:
                transaction_type = "sale"
            elif "exchange" in tx_type:
                transaction_type = "exchange"
            elif "partial" in tx_type or "full" in tx_type:
                transaction_type = "sale" if "sale" in tx_type else "purchase"

            # Parse dates - Senate uses MM/DD/YYYY format
            transaction_date = None

            if transaction.get('transaction_date'):
                try:
                    # Try MM/DD/YYYY format first
                    transaction_date = datetime.strptime(transaction['transaction_date'], "%m/%d/%Y")
                    transaction_date = transaction_date.replace(tzinfo=timezone.utc)
                except ValueError:
                    # Try YYYY-MM-DD format as fallback
                    try:
                        transaction_date = datetime.strptime(transaction['transaction_date'], "%Y-%m-%d")
                        transaction_date = transaction_date.replace(tzinfo=timezone.utc)
                    except Exception:
                        pass

            # For Senate data, we don't have a separate disclosure_date field
            # Use transaction_date as both
            disclosure_date = transaction_date

            # If no date, skip
            if not disclosure_date:
                return None

            # We don't have party data in this dataset, so mark as Unknown
            # We could potentially look this up separately if needed
            senator_name = transaction.get('senator', 'Unknown')
            party = "Unknown"

            trade = CongressionalTrade(
                politician_name=senator_name,
                chamber="Senate",
                party=party,  # Not available in this dataset
                ticker=ticker,
                transaction_type=transaction_type,
                amount_range=transaction.get('amount', '$1,001 - $15,000'),
                disclosure_date=disclosure_date,
                transaction_date=transaction_date,
                disclosure_year=disclosure_date.year if disclosure_date else None,
                asset_description=transaction.get('asset_description'),
                owner=transaction.get('owner'),
                ptr_link=transaction.get('ptr_link'),
                source_file="senate-stock-watcher-data",
                raw_data=transaction
            )

            return trade

        except Exception as e:
            logger.error(f"Error parsing Senate transaction: {e}")
            return None


class FinnhubCongressionalScraper:
    """
    Scraper using Finnhub API for congressional trading data.

    Finnhub provides free access to congressional trading data with a free API key.
    Sign up at: https://finnhub.io

    This is the RECOMMENDED data source as it provides current data.
    """

    BASE_URL = "https://finnhub.io/api/v1"

    def __init__(self, api_key: str):
        """
        Initialize Finnhub scraper.

        Args:
            api_key: Finnhub API key (get free key at https://finnhub.io)
        """
        self.api_key = api_key
        self.session = requests.Session()

    def fetch_all_transactions(self, from_date: str = None, to_date: str = None) -> List[CongressionalTrade]:
        """
        Fetch congressional trading data from Finnhub.

        Args:
            from_date: Start date in YYYY-MM-DD format (default: 1 year ago)
            to_date: End date in YYYY-MM-DD format (default: today)

        Returns:
            List of CongressionalTrade objects
        """
        trades = []

        try:
            # Default date range: last year
            if not from_date:
                from_date = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%d")
            if not to_date:
                to_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

            url = f"{self.BASE_URL}/stock/congressional-trading"
            params = {
                'from': from_date,
                'to': to_date,
                'token': self.api_key
            }

            logger.info(f"Fetching congressional data from Finnhub ({from_date} to {to_date})...")

            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()

            data = response.json()

            if 'data' in data:
                transactions = data['data']
                logger.info(f"Successfully fetched {len(transactions)} transactions from Finnhub")

                for tx in transactions:
                    trade = self._parse_finnhub_transaction(tx)
                    if trade:
                        trades.append(trade)

                logger.info(f"Successfully parsed {len(trades)} Finnhub trades")
            else:
                logger.warning(f"No data field in Finnhub response: {data}")

        except Exception as e:
            logger.error(f"Error fetching from Finnhub: {e}")

        return trades

    def _parse_finnhub_transaction(self, transaction: Dict[str, Any]) -> Optional[CongressionalTrade]:
        """Parse a Finnhub congressional trade transaction."""
        try:
            # Finnhub format: https://finnhub.io/docs/api/congressional-trading
            # Example fields: symbol, name, amount, transactionDate, transactionType, etc.

            ticker = transaction.get('symbol', '').strip().upper()
            if not ticker:
                return None

            # Parse transaction type
            tx_type = transaction.get('transactionType', '').lower()
            transaction_type = "purchase"
            if 'sale' in tx_type or 'sell' in tx_type:
                transaction_type = "sale"
            elif 'exchange' in tx_type:
                transaction_type = "exchange"

            # Parse date
            transaction_date = None
            if transaction.get('transactionDate'):
                try:
                    transaction_date = datetime.strptime(transaction['transactionDate'], "%Y-%m-%d")
                    transaction_date = transaction_date.replace(tzinfo=timezone.utc)
                except Exception:
                    pass

            if not transaction_date:
                return None

            # Extract politician info
            politician_name = transaction.get('name', 'Unknown')

            # Finnhub doesn't provide party info, set as Unknown
            party = "Unknown"

            # Determine chamber from position/title if available
            position = transaction.get('position', '').lower()
            chamber = "Unknown"
            if 'senate' in position or 'senator' in position:
                chamber = "Senate"
            elif 'house' in position or 'representative' in position or 'rep.' in position:
                chamber = "House"

            trade = CongressionalTrade(
                politician_name=politician_name,
                chamber=chamber,
                party=party,
                ticker=ticker,
                transaction_type=transaction_type,
                amount_range=transaction.get('amount', '$1,001 - $15,000'),
                disclosure_date=transaction_date,  # Finnhub uses transaction date
                transaction_date=transaction_date,
                disclosure_year=transaction_date.year,
                asset_description=transaction.get('assetDescription'),
                owner=transaction.get('owner'),
                source_file="finnhub-api",
                raw_data=transaction
            )

            return trade

        except Exception as e:
            logger.error(f"Error parsing Finnhub transaction: {e}")
            return None


class CongressionalTradesScraper:
    """Main scraper that coordinates data collection from multiple sources."""

    def __init__(self, finnhub_api_key: Optional[str] = None):
        """
        Initialize the scraper.

        Args:
            finnhub_api_key: Optional Finnhub API key for current data (recommended)
        """
        self.house_scraper = HouseStockWatcherScraper()
        self.senate_scraper = SenateStockWatcherScraper()
        self.finnhub_scraper = None

        # Use Finnhub if API key is provided (recommended for current data)
        if finnhub_api_key:
            self.finnhub_scraper = FinnhubCongressionalScraper(finnhub_api_key)
            logger.info("Finnhub scraper initialized - will fetch current data")

    def fetch_all_trades(self, days_back: Optional[int] = None) -> List[CongressionalTrade]:
        """
        Fetch all congressional trades from available sources.

        Priority order:
        1. Finnhub API (if API key provided) - Current data
        2. House Stock Watcher S3 bucket - Often blocked
        3. Senate Stock Watcher GitHub - Outdated (2021)

        Args:
            days_back: Optional filter to only get trades from last N days

        Returns:
            Combined list of all trades
        """
        all_trades = []

        # If Finnhub is available, use it (most reliable and current)
        if self.finnhub_scraper:
            logger.info("Using Finnhub API for current congressional trading data...")

            # Calculate date range
            from_date = None
            to_date = None
            if days_back:
                from_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")
                to_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

            finnhub_trades = self.finnhub_scraper.fetch_all_transactions(from_date, to_date)
            all_trades.extend(finnhub_trades)
            logger.info(f"Fetched {len(finnhub_trades)} trades from Finnhub")
        else:
            # Fall back to scraping free sources (may be outdated or blocked)
            logger.warning("No Finnhub API key provided - falling back to free sources (may be outdated)")

            # Try House trades (S3 bucket - currently blocked)
            logger.info("Fetching House trades...")
            house_trades = self.house_scraper.fetch_all_transactions()
            all_trades.extend(house_trades)
            logger.info(f"Fetched {len(house_trades)} House trades")

            # Fetch Senate trades (GitHub - outdated but works)
            logger.info("Fetching Senate trades...")
            senate_trades = self.senate_scraper.fetch_all_transactions()
            all_trades.extend(senate_trades)
            logger.info(f"Fetched {len(senate_trades)} Senate trades")

            # Filter by date if specified
            if days_back:
                cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_back)
                all_trades = [
                    t for t in all_trades
                    if t.disclosure_date and t.disclosure_date >= cutoff_date
                ]
                logger.info(f"Filtered to {len(all_trades)} trades from last {days_back} days")

        logger.info(f"Total trades fetched: {len(all_trades)}")
        return all_trades

    def fetch_trades_for_ticker(self, ticker: str, days_back: int = 30) -> List[CongressionalTrade]:
        """
        Fetch trades for a specific ticker symbol.

        Args:
            ticker: Stock ticker symbol
            days_back: How many days back to search

        Returns:
            List of trades for that ticker
        """
        all_trades = self.fetch_all_trades(days_back=days_back)
        ticker_trades = [t for t in all_trades if t.ticker == ticker.upper()]
        return ticker_trades


if __name__ == "__main__":
    # Test the scraper
    scraper = CongressionalTradesScraper()

    # Fetch recent trades (last 30 days)
    trades = scraper.fetch_all_trades(days_back=30)

    print(f"\nFetched {len(trades)} total trades")
    print(f"House trades: {sum(1 for t in trades if t.chamber == 'House')}")
    print(f"Senate trades: {sum(1 for t in trades if t.chamber == 'Senate')}")

    # Show a few examples
    if trades:
        print("\nSample trades:")
        for trade in trades[:5]:
            print(f"  {trade.politician_name} ({trade.chamber}) - {trade.transaction_type} {trade.ticker} - {trade.amount_range}")
