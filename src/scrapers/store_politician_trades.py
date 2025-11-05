"""
Store Congressional Trading Data to Supabase

This script fetches congressional trading data and stores it in the
politician_trades table in Supabase.
"""

from __future__ import annotations

import os
import sys
from typing import List, Dict, Any
import logging
from datetime import datetime, timezone

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.scrapers.congressional_trades_scraper import CongressionalTradesScraper, CongressionalTrade

try:
    from supabase import create_client, Client
except ImportError:
    print("Error: supabase-py not installed. Install with: pip install supabase", file=sys.stderr)
    sys.exit(1)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class PoliticianTradesStorage:
    """Handles storage of politician trades to Supabase."""

    def __init__(self):
        """Initialize Supabase client."""
        self.supabase_url = os.environ.get("SUPABASE_URL")
        self.supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

        if not self.supabase_url or not self.supabase_key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set"
            )

        self.client: Client = create_client(self.supabase_url, self.supabase_key)

    def store_trades(self, trades: List[CongressionalTrade]) -> Dict[str, int]:
        """
        Store trades to Supabase.

        Uses upsert to avoid duplicates based on the unique constraint.

        Args:
            trades: List of CongressionalTrade objects

        Returns:
            Dictionary with counts of inserted, updated, and skipped trades
        """
        if not trades:
            logger.warning("No trades to store")
            return {"inserted": 0, "updated": 0, "skipped": 0, "errors": 0}

        stats = {
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
            "errors": 0
        }

        # Process trades in batches to avoid overwhelming the database
        batch_size = 100
        total_batches = (len(trades) + batch_size - 1) // batch_size

        logger.info(f"Storing {len(trades)} trades in {total_batches} batches...")

        for i in range(0, len(trades), batch_size):
            batch = trades[i:i + batch_size]
            batch_num = (i // batch_size) + 1

            logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} trades)")

            # Convert trades to dictionaries
            trade_dicts = []
            for trade in batch:
                trade_dict = self._prepare_trade_for_storage(trade)
                if trade_dict:
                    trade_dicts.append(trade_dict)

            if not trade_dicts:
                continue

            try:
                # Use upsert with on_conflict to handle duplicates
                # Supabase will use the unique constraint we defined in the migration
                result = self.client.table("politician_trades").upsert(
                    trade_dicts,
                    on_conflict="politician_name,ticker,transaction_date,disclosure_date,transaction_type,amount_range"
                ).execute()

                # Count successful inserts/updates
                if result.data:
                    stats["inserted"] += len(result.data)
                    logger.info(f"Batch {batch_num}: Successfully stored {len(result.data)} trades")

            except Exception as e:
                logger.error(f"Error storing batch {batch_num}: {e}")
                stats["errors"] += len(batch)

        logger.info(f"Storage complete. Stats: {stats}")
        return stats

    def _prepare_trade_for_storage(self, trade: CongressionalTrade) -> Dict[str, Any]:
        """
        Prepare a trade object for database storage.

        Args:
            trade: CongressionalTrade object

        Returns:
            Dictionary ready for database insertion
        """
        try:
            data = {
                "politician_name": trade.politician_name,
                "chamber": trade.chamber,
                "party": trade.party,
                "ticker": trade.ticker,
                "transaction_type": trade.transaction_type,
                "amount_range": trade.amount_range,
                "disclosure_date": trade.disclosure_date.date().isoformat() if trade.disclosure_date else None,
                "transaction_date": trade.transaction_date.date().isoformat() if trade.transaction_date else None,
                "disclosure_year": trade.disclosure_year,
                "state": trade.state,
                "district": trade.district,
                "asset_description": trade.asset_description,
                "owner": trade.owner,
                "industry": trade.industry,
                "sector": trade.sector,
                "cap_gains_over_200_usd": trade.cap_gains_over_200_usd,
                "ptr_link": trade.ptr_link,
                "source_file": trade.source_file,
                "raw_data": trade.raw_data,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

            return data

        except Exception as e:
            logger.error(f"Error preparing trade for storage: {e}")
            return None

    def get_recent_trades(self, days_back: int = 30, ticker: str = None) -> List[Dict[str, Any]]:
        """
        Fetch recent trades from the database.

        Args:
            days_back: How many days back to fetch
            ticker: Optional ticker filter

        Returns:
            List of trade dictionaries
        """
        from datetime import timedelta

        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).date().isoformat()

        try:
            query = self.client.table("politician_trades").select("*")
            query = query.gte("disclosure_date", cutoff_date)

            if ticker:
                query = query.eq("ticker", ticker.upper())

            query = query.order("disclosure_date", desc=True)

            result = query.execute()
            return result.data

        except Exception as e:
            logger.error(f"Error fetching trades from database: {e}")
            return []

    def get_trade_count(self) -> int:
        """Get total number of trades in the database."""
        try:
            result = self.client.table("politician_trades").select("id", count="exact").execute()
            return result.count
        except Exception as e:
            logger.error(f"Error getting trade count: {e}")
            return 0


def main():
    """Main function to scrape and store politician trades."""
    logger.info("Starting congressional trades scraper...")

    # Get Finnhub API key from environment (recommended for current data)
    finnhub_api_key = os.environ.get("FINNHUB_API_KEY")

    if finnhub_api_key:
        logger.info("Finnhub API key found - will fetch current congressional trading data")
    else:
        logger.warning("No FINNHUB_API_KEY environment variable found")
        logger.warning("Will fall back to free sources (may be outdated)")
        logger.warning("Get a free API key at: https://finnhub.io")

    # Initialize scraper and storage
    scraper = CongressionalTradesScraper(finnhub_api_key=finnhub_api_key)
    storage = PoliticianTradesStorage()

    # Fetch trades (all available trades, we'll let the database handle duplicates)
    logger.info("Fetching congressional trades...")
    trades = scraper.fetch_all_trades()

    logger.info(f"Fetched {len(trades)} total trades")
    logger.info(f"  House: {sum(1 for t in trades if t.chamber == 'House')}")
    logger.info(f"  Senate: {sum(1 for t in trades if t.chamber == 'Senate')}")

    if not trades:
        logger.warning("No trades fetched. Exiting.")
        return

    # Store trades to database
    logger.info("Storing trades to database...")
    stats = storage.store_trades(trades)

    # Get updated count
    total_count = storage.get_trade_count()
    logger.info(f"Database now contains {total_count} total politician trades")

    # Show some stats
    logger.info("\nStorage Statistics:")
    logger.info(f"  Inserted/Updated: {stats['inserted']}")
    logger.info(f"  Errors: {stats['errors']}")

    # Show recent notable trades
    logger.info("\nRecent notable trades (last 7 days):")
    recent_trades = storage.get_recent_trades(days_back=7)

    # Group by ticker to show which stocks are being traded
    ticker_counts = {}
    for trade in recent_trades:
        ticker = trade['ticker']
        ticker_counts[ticker] = ticker_counts.get(ticker, 0) + 1

    # Show top 10 most traded tickers
    top_tickers = sorted(ticker_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    for ticker, count in top_tickers:
        logger.info(f"  {ticker}: {count} trades")

    logger.info("\nScraper complete!")


if __name__ == "__main__":
    main()
