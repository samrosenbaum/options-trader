# Rejection Tracking - Filter Optimization System

This system tracks options that were filtered out by the scanner and analyzes their next-day performance to validate filter tuning decisions.

**Now using Supabase** for permanent cloud storage - no more worrying about Render's ephemeral filesystem!

## How It Works

1. **During Scanning**: The scanner logs every option that gets rejected, including:
   - Which filter rejected it (liquidity, quality, institutional)
   - Specific rejection reason (volume too low, delta too small, etc.)
   - Full option details (price, volume, OI, greeks, scores)
   - **Stored in Supabase `rejected_options` table**

2. **Next Day**: Fetch current prices for rejected options to see if they would have been profitable

3. **Analysis**: Generate reports showing:
   - Which filters have high false-positive rates (rejecting profitable options)
   - Pattern detection (e.g., "low volume but profitable")
   - Actionable recommendations for filter tuning

## Setup

### 1. Run Supabase Migration

The `rejected_options` table needs to be created in your Supabase database:

```bash
# Apply the migration via Supabase CLI
supabase db push

# Or manually run the SQL in Supabase Studio:
# supabase/migrations/004_add_rejection_tracker.sql
```

### 2. Environment Variables

Make sure these are set in your Render environment (and `.env.local` for local dev):

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # For backend scanner
# OR
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key  # Fallback
```

### 3. Install Dependencies

```bash
pip install supabase
```

## Usage

### Analyze Rejections Manually

```bash
# Analyze yesterday's rejections
python scripts/analyze_rejections.py

# Analyze rejections from 3 days ago
python scripts/analyze_rejections.py --days-ago 3

# Analyze last 14 days with 15% minimum profit threshold
python scripts/analyze_rejections.py --lookback 14 --min-profit 15.0

# Output as JSON for programmatic use
python scripts/analyze_rejections.py --json
```

### Schedule Daily Analysis (Cron)

Add to your crontab (`crontab -e`):

```cron
# Run rejection analysis every day at 5 PM ET (after market close)
0 17 * * 1-5 cd /Users/samrosenbaum/options-trader && python3 scripts/analyze_rejections.py >> logs/rejection_analysis.log 2>&1
```

Or for more advanced scheduling with email alerts:

```cron
# Run and email results if recommendations found
0 17 * * 1-5 cd /Users/samrosenbaum/options-trader && python3 scripts/analyze_rejections.py && mail -s "Filter Tuning Recommendations" your@email.com < logs/rejection_analysis.log
```

### Integrate into Dashboard

The analysis script can output JSON for integration into web dashboards:

```python
from src.analysis.rejection_tracker import RejectionTracker

tracker = RejectionTracker()
analysis = tracker.analyze_missed_opportunities(days_back=7, min_profit_percent=10.0)

# Access results programmatically
total_rejections = analysis['total_rejections']
profitable_rate = analysis['profitable_rejection_rate']
missed_opportunities = analysis['missed_opportunities']  # List of MissedOpportunity objects
recommendations = analysis['recommendations']  # List of strings
```

## Example Output

```
================================================================================
REJECTION TRACKER ANALYSIS
================================================================================

📊 Overall Statistics:
  Total Rejections Tracked: 237
  Profitable Rejection Rate: 42.3%
  Avg Price Change (All): 5.2%

💰 Missed Opportunities (18 found):

  1. AAPL call $180 gained 23.5% but was rejected for: volume=18≤20
     Volume: 18, OI: 45
     Tags: low_volume_but_profitable

  2. TSLA put $240 gained 19.2% but was rejected for: probability 7.8%
     Volume: 95, OI: 320
     Tags:

🔍 Rejection Reason Analysis:

  volume=18≤20:
    Count: 45
    Profitable Rate: 68.9%
    Avg Change: 15.3%

  probability 7.8%:
    Count: 32
    Profitable Rate: 53.1%
    Avg Change: 8.7%

  delta 0.012:
    Count: 28
    Profitable Rate: 25.0%
    Avg Change: -2.1%

💡 Recommendations:
  • Consider relaxing 'volume=18≤20' filter - 69% of rejections were profitable
    with avg 15.3% gain (45 samples)
  • Consider relaxing 'probability 7.8%' filter - 53% of rejections were profitable
    with avg 8.7% gain (32 samples)
  • Filter 'delta 0.012' is working well - only 25% of rejections were profitable
    (28 samples)

================================================================================
```

## Database (Supabase)

Rejection data is stored in the `rejected_options` table in your Supabase database.

### Schema

```sql
CREATE TABLE rejected_options (
    id UUID PRIMARY KEY,
    symbol TEXT,
    strike NUMERIC,
    expiration DATE,
    option_type TEXT,
    rejection_reason TEXT,
    filter_stage TEXT,
    rejected_at TIMESTAMP WITH TIME ZONE,
    stock_price NUMERIC,
    option_price NUMERIC,
    volume INTEGER,
    open_interest INTEGER,
    implied_volatility NUMERIC,
    delta NUMERIC,
    probability_score NUMERIC,
    risk_adjusted_score NUMERIC,
    quality_score NUMERIC,
    next_day_price NUMERIC,
    price_change_percent NUMERIC,
    was_profitable BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
);
```

### Query Examples (Supabase Studio)

```sql
-- Find most profitable rejection reason in last 7 days
SELECT
    rejection_reason,
    COUNT(*) as count,
    AVG(price_change_percent) as avg_gain,
    AVG(CASE WHEN was_profitable = true THEN 1.0 ELSE 0.0 END) as win_rate
FROM rejected_options
WHERE rejected_at >= NOW() - INTERVAL '7 days'
    AND was_profitable = true
GROUP BY rejection_reason
ORDER BY avg_gain DESC
LIMIT 10;

-- Find low-volume options that were profitable
SELECT symbol, strike, option_type, volume, price_change_percent
FROM rejected_options
WHERE volume < 20
    AND was_profitable = true
    AND rejected_at >= NOW() - INTERVAL '7 days'
ORDER BY price_change_percent DESC;

-- Use the pre-built analysis view
SELECT * FROM rejection_analysis
ORDER BY profitable_rate DESC;
```

## Benefits of Supabase vs SQLite

✅ **Permanent storage** - Data persists across Render deploys
✅ **No disk management** - Supabase handles backups and scaling
✅ **Easy queries** - Use Supabase Studio to explore data
✅ **Potential dashboard** - Could build UI to view rejections in real-time
✅ **Multi-instance** - Multiple Render instances can share data

## Filter Tuning Workflow

1. **Run Analysis**: `python scripts/analyze_rejections.py`
2. **Review Recommendations**: Look for filters with >60% profitable rejection rate
3. **Adjust Filters**: Update filter thresholds in scanner code
4. **Monitor**: Track if changes improve scanner results
5. **Iterate**: Repeat weekly to continuously optimize

## Notes

- The system automatically logs rejections during every scan
- Logging failures won't break the scanner (wrapped in try/except)
- Next-day prices are fetched via yfinance (may have rate limits)
- Expired options will fail to fetch prices (expected behavior)
- Recommendations require statistical significance (5-10+ samples)
- Data is queryable via Supabase Studio or API
