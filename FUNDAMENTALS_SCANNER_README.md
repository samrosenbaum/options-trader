# Stock Fundamentals Scanner

A comprehensive stock analysis tool that identifies high-quality buying opportunities based on fundamental metrics.

## Overview

The Fundamentals Scanner analyzes stocks across 5 key dimensions:
- **Financial Health (25%)**: Debt levels, cash flow, liquidity
- **Profitability (25%)**: Margins, ROE, capital efficiency
- **Growth (20%)**: Revenue and earnings growth trends
- **Valuation (15%)**: P/E, PEG, price-to-sales ratios
- **Leverage (15%)**: Debt management and financial stability

## Quick Start

### 1. Ensure Database is Set Up

First, make sure the `fundamentals_signals` table exists:

```bash
npx supabase db push
```

### 2. Populate the Database

Run the scanner to analyze stocks and populate the database:

```bash
# Quick scan (10 stocks) - takes ~1 minute
./scripts/run-fundamentals-scanner.sh --quick

# Default scan (20 stocks) - takes ~2 minutes
./scripts/run-fundamentals-scanner.sh

# Full scan (70+ stocks) - takes ~5-10 minutes
./scripts/run-fundamentals-scanner.sh --all
```

Or run the Python script directly:

```bash
# Scan specific symbols
python src/scanner/fundamentals_runner.py --symbols AAPL MSFT GOOGL

# Scan with custom minimum score
python src/scanner/fundamentals_runner.py --min-score 60

# Scan full universe
python src/scanner/fundamentals_runner.py --all
```

### 3. View Results

Visit the scanner page:
- **Find Stocks**: `/scanner/stock-fundamentals` (lightweight redirect lives at `/scanner/fundamentals`)

## Features

### Find Stocks Experience

- Clean light-mode layout aligned with the public landing page
- Grouped insights for Excellent, Good, Fair, and Watch quality tiers
- Rich cards with expandable fundamentals, analyst commentary, and risk callouts
- Demo dataset automatically loads when Supabase credentials are missing so the UI keeps working

### Quality Levels

- **⭐ Excellent (80+)**: Outstanding fundamentals, strong buy candidates
- **💎 Good (65-79)**: Solid fundamentals with minor weaknesses
- **📊 Fair (50-64)**: Mixed fundamentals, selective opportunities
- **⚠️ Watch (<50)**: Weak fundamentals, monitor only

## Architecture

### Frontend Components

- `app/scanner/stock-fundamentals/page.tsx` - Find Stocks experience with light theme
- `components/fundamentals-scanner.tsx` - Traditional card grid view

### Backend

- `app/api/fundamentals-scanner/route.ts` - API endpoint
- `src/signals/fundamentals_scanner.py` - Core analysis engine
- `src/scanner/fundamentals_runner.py` - Scanner runner script

### Database

- Table: `fundamentals_signals`
- Migration: `supabase/migrations/20251108_add_fundamentals_signals.sql`
- Data refreshes: Signals expire after 7 days

## Data Refresh Schedule

Fundamentals data should be refreshed regularly:

```bash
# Add to cron for daily refresh at 6 AM
0 6 * * * cd /path/to/project && ./scripts/run-fundamentals-scanner.sh --all
```

## Troubleshooting

### "Failed to load resource: 500" Error

This means the database is either:
1. Not set up (run `npx supabase db push`)
2. Empty (run `./scripts/run-fundamentals-scanner.sh`)

### "No data available" Message

The scanner hasn't been run yet or all signals have expired. Run:

```bash
./scripts/run-fundamentals-scanner.sh
```

### Python Dependencies Missing

Install required packages:

```bash
pip install yfinance supabase
```

### Supabase Connection Errors

Ensure environment variables are set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

Check your `.env.local` file.

## Development

### Adding New Stocks to Universe

Edit the `DEFAULT_UNIVERSE` list in `src/scanner/fundamentals_runner.py`:

```python
DEFAULT_UNIVERSE = [
    'AAPL', 'MSFT', 'GOOGL',  # Add your symbols here
    # ...
]
```

### Customizing Scoring Weights

Modify weights in `src/signals/fundamentals_scanner.py`:

```python
weights = {
    'health': 0.25,      # Adjust these percentages
    'growth': 0.20,
    'profitability': 0.25,
    'leverage': 0.15,
    'valuation': 0.15
}
```

### Adding New Metrics

1. Add field to `FundamentalMetrics` dataclass
2. Extract in `_extract_metrics()` method
3. Update scoring function
4. Add database column in migration

## API Usage

### Get Fundamentals Signals

```typescript
// Fetch signals with default filters
const response = await fetch('/api/fundamentals-scanner?minScore=50&limit=50')
const data = await response.json()

// Filter by quality level
const excellent = await fetch('/api/fundamentals-scanner?qualityLevel=excellent')

// Filter by symbols
const myStocks = await fetch('/api/fundamentals-scanner?symbols=AAPL,MSFT,GOOGL')

// Filter by sector
const tech = await fetch('/api/fundamentals-scanner?sector=Technology')
```

### Response Format

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "symbol": "AAPL",
      "overallScore": 85,
      "qualityLevel": "excellent",
      "recommendation": "STRONG BUY",
      "buyReason": "Strong growth momentum...",
      "currentPrice": 150.25,
      "strengths": ["..."],
      "weaknesses": ["..."],
      "riskFactors": ["..."]
    }
  ],
  "count": 10,
  "totalScanned": 50,
  "qualityBreakdown": {
    "excellent": 5,
    "good": 15,
    "fair": 20,
    "poor": 10
  }
}
```

## Best Practices

1. **Refresh data regularly** - Fundamentals change, keep signals fresh
2. **Use both views** - Chat for discovery, Cards for screening
3. **Check all details** - Expand cards to see strengths, weaknesses, and risks
4. **Validate externally** - Cross-reference with analyst ratings shown
5. **Consider your strategy** - Different quality levels suit different risk profiles

## License

Part of the Options Trader application.
