# Congressional Trading Data Scraper

## Overview

This module scrapes congressional stock trading disclosure data and stores it in the `politician_trades` database table. The data shows what stocks members of Congress are buying and selling, which can be used as "smart money" signals for trading analysis.

## Current Status

### ✅ What's Working
- **Database Schema**: Complete schema in `supabase/migrations/20251105_add_politician_trades.sql`
- **Scraper Framework**: Modular scraper in `src/scrapers/congressional_trades_scraper.py`
- **Data Storage**: Automated storage to Supabase in `src/scrapers/store_politician_trades.py`
- **Scheduled Job**: GitHub Actions workflow to run daily (`.github/workflows/update-politician-trades.yml`)
- **API Integration**: Updated `src/analysis/politician_trades.py` to fetch from database

### ⚠️ Data Source Challenges

**Senate Data**:
- ✅ Can access via GitHub: `timothycarambat/senate-stock-watcher-data`
- ❌ Data is outdated (last update: March 2021)
- 📊 Contains 6,239 trades from 2012-2021

**House Data**:
- ❌ S3 bucket (`house-stock-watcher-data`) now returns 403 Forbidden
- ❌ House Stock Watcher API endpoint returns "Access denied"

## Data Source Options

### Option 1: Free APIs (Recommended)

**Finnhub** (Free Tier Available):
- Endpoint: https://finnhub.io/docs/api/congressional-trading
- Requires free API key signup
- Updated regularly from official sources
- Rate limits apply (60 calls/minute on free tier)

**Usage**:
```python
import requests
api_key = "YOUR_FINNHUB_API_KEY"
url = f"https://finnhub.io/api/v1/stock/congressional-trading?symbol=AAPL&token={api_key}"
response = requests.get(url)
```

### Option 2: Paid APIs

**Financial Modeling Prep**:
- House Trading API: https://site.financialmodelingprep.com/developer/docs/stable/house-trading
- Senate Trading API: https://site.financialmodelingprep.com/developer/docs/senate-trading-api
- ~$30-50/month for full access

**Quiver Quantitative**:
- https://www.quiverquant.com/congresstrading/
- Professional-grade data with analysis
- $30-50/month

### Option 3: Direct Scraping (Complex)

**Official Sources**:
- House: https://disclosures-clerk.house.gov/FinancialDisclosure
- Senate: https://efdsearch.senate.gov/search/

**Challenges**:
- Anti-scraping protections
- Complex ASPX forms
- Mix of PDF and XML formats
- Some documents require OCR
- Rate limiting and IP blocking

**Would require**:
- Selenium/Playwright for browser automation
- PDF parsing libraries (pypdf, pdfplumber)
- XML parsing for electronic filings
- Robust error handling and retries
- Possibly rotating IPs/user agents

## Current Implementation

The scraper currently uses:
1. **Senate**: GitHub repo (outdated but works as proof-of-concept)
2. **House**: Disabled due to S3 bucket access issues

## How to Add Finnhub Support

1. Sign up for free API key at https://finnhub.io
2. Add `FINNHUB_API_KEY` to environment variables
3. Update `src/scrapers/congressional_trades_scraper.py` to add Finnhub scraper:

```python
class FinnhubCongressionalScraper:
    """Scraper using Finnhub API for congressional trading data."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://finnhub.io/api/v1"

    def fetch_congressional_trades(self, symbol: str = None, from_date: str = None, to_date: str = None):
        """Fetch congressional trading data from Finnhub."""
        params = {
            'token': self.api_key,
        }
        if symbol:
            params['symbol'] = symbol
        if from_date:
            params['from'] = from_date  # Format: YYYY-MM-DD
        if to_date:
            params['to'] = to_date

        url = f"{self.base_url}/stock/congressional-trading"
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.json()
```

## Testing the Current Scraper

```bash
# Test the scraper (will only get old Senate data)
python3 src/scrapers/congressional_trades_scraper.py

# Store data to database (requires Supabase credentials)
python3 scripts/update_politician_trades.py
```

## Database Schema

The `politician_trades` table includes:
- Politician info (name, chamber, party, state, district)
- Trade details (ticker, transaction type, amount range)
- Dates (transaction date, disclosure date)
- Additional data (industry, sector, PTR link)
- Full raw data stored as JSONB

## Scheduled Updates

The GitHub Actions workflow runs daily at 6:00 AM ET to update the database with new trades.

## Next Steps

1. **Short term**: Add Finnhub API support (free, current data)
2. **Medium term**: Build proper scraper for official .gov sites
3. **Long term**: Consider paid API if volume/reliability needs increase

## Legal Compliance

All data sources used must comply with:
- STOCK Act of 2012 (requires disclosure within 45 days)
- Data is public record
- Usage must not be for unlawful purposes or credit rating determination
- News media and research use is permitted
