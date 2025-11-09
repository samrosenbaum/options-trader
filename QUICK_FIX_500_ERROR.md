# Quick Fix: Fundamentals Scanner 500 Error

## The Problem
You're seeing:
```
Failed to load resource: the server responded with a status of 500 ()
/api/fundamentals-scanner?minScore=50&limit=50
```

## The Cause
The `fundamentals_signals` table likely doesn't exist in your database yet, or the table exists but is empty.

## The Fix (3 Steps)

### Step 1: Check what's actually wrong

Visit this debug endpoint in your browser:
```
http://localhost:3000/api/fundamentals-scanner/debug?minScore=50&limit=50
```

This will show you detailed logs about what's failing.

### Step 2: Run the database migration

If the debug shows "table does not exist", run:

```bash
npx supabase db push
```

This creates the `fundamentals_signals` table in your database.

### Step 3: Populate the table with data

Run the scanner to analyze stocks and fill the database:

```bash
# Quick test (10 stocks, ~1 minute)
./scripts/run-fundamentals-scanner.sh --quick

# OR full scan (70+ stocks, ~5-10 minutes)
./scripts/run-fundamentals-scanner.sh --all
```

If the script doesn't work, run the Python directly:

```bash
python src/scanner/fundamentals_runner.py --symbols AAPL MSFT GOOGL AMZN META
```

### Step 4: Verify it works

Visit the scanner page:
```
http://localhost:3000/scanner/stock-fundamentals
```

You should now see stocks in either the Chat or Card view!

## Still Getting Errors?

### Error: "Python dependencies missing"

Install required packages:
```bash
pip install yfinance supabase
```

### Error: "Supabase credentials not found"

Check your `.env.local` file has:
```
NEXT_PUBLIC_SUPABASE_URL=your_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_key_here
```

### Error: "Permission denied" on script

Make the script executable:
```bash
chmod +x scripts/run-fundamentals-scanner.sh
```

### Still stuck?

1. Check server logs in your terminal running `npm run dev`
2. Visit `/api/fundamentals-scanner/test` for diagnostics
3. Check the browser console for more error details

## Understanding the Scanner

The scanner has two views (toggle between them):
- **Chat Scanner**: AI guide walks you through stocks
- **Card View**: See all stocks at once in organized cards

Data refreshes automatically every 7 days, or you can manually run the scanner script anytime.
