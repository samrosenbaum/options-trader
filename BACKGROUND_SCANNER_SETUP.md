# Background Scanner Setup Guide

## Overview

The background scanner architecture solves the timeout problem by pre-computing scan results every 10 minutes and caching them in Supabase. When users request a scan, results are served instantly from cache (<2 seconds) instead of waiting 2-4 minutes for Python analysis.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  BACKGROUND WORKER                          │
│                  (Runs every 10 minutes)                    │
│                                                             │
│  1. Run FULL enhanced scan (50+ symbols, all features)     │
│  2. Compute historical patterns (365 days)                 │
│  3. Run backtesting validation                             │
│  4. Calculate institutional-grade probabilities            │
│  5. Store results in Supabase cached_scan_results table    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                 SUPABASE DATABASE                           │
│         (cached_scan_results table)                         │
│                                                             │
│  Stores complete scan results with metadata                │
│  - Opportunities array (JSON)                              │
│  - Scan timestamp                                          │
│  - Symbols scanned                                         │
│  - Total evaluated                                         │
│  - Metadata (filters, settings, etc.)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  USER REQUEST                               │
│              (Instant response <2s)                         │
│                                                             │
│  1. User clicks "Scan"                                     │
│  2. API checks cache (age < 15 minutes?)                   │
│  3. If fresh: Serve from cache INSTANTLY                   │
│  4. If stale/missing: Fall back to live scan              │
│  5. Show "Last updated: 3 minutes ago" to user            │
└─────────────────────────────────────────────────────────────┘
```

## Setup Instructions

### Step 1: Run Supabase Migration

```bash
# Option A: Using Supabase CLI (recommended)
supabase db push

# Option B: Manual via Supabase Studio
# 1. Go to https://app.supabase.com/project/YOUR_PROJECT/editor
# 2. Click SQL Editor
# 3. Copy contents of supabase/migrations/005_add_cached_scan_results.sql
# 4. Paste and run
```

Verify the migration:
```sql
-- Check table exists
SELECT * FROM cached_scan_results LIMIT 1;

-- Test function
SELECT * FROM get_latest_scan('strict');
```

### Step 2: Test Background Scanner Locally

```bash
# Set environment variables
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"

# Run background scanner
python3 scripts/background_scanner.py --filter-mode strict

# Should output:
# 🚀 BACKGROUND SCANNER STARTED
# 📊 Running FULL enhanced scan...
# ✅ Saved scan to Supabase: 15 opportunities
# 🏁 BACKGROUND SCANNER FINISHED
```

### Step 3: Verify API Serves Cached Results

```bash
# Start your Next.js app
npm run dev

# In another terminal, trigger a scan
curl http://localhost:3000/api/scan-enhanced

# Should see in logs:
# ⚡ Checking cache for strict mode results...
# 🚀 Serving cached results (2.5 min old)
# Response time: <2 seconds!
```

### Step 4: Set Up Render Cron Job

#### Option A: Render Cron Job (Recommended for Render)

1. In your Render dashboard, go to your web service
2. Click "Cron Jobs" tab
3. Add new cron job:
   - **Name:** Background Scanner
   - **Command:** `python3 scripts/background_scanner.py --filter-mode strict`
   - **Schedule:** `*/10 * * * *` (every 10 minutes)
   - **Environment:** Same as your web service

#### Option B: GitHub Actions (Alternative)

Create `.github/workflows/background-scan.yml`:

```yaml
name: Background Scanner

on:
  schedule:
    # Run every 10 minutes
    - cron: '*/10 * * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Run background scanner
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
        run: python3 scripts/background_scanner.py --filter-mode strict
```

#### Option C: Supabase Edge Function (Advanced)

See: https://supabase.com/docs/guides/functions/schedule-functions

### Step 5: Monitor Background Scans

#### Check last scan in Supabase:
```sql
SELECT
  scan_timestamp,
  filter_mode,
  jsonb_array_length(opportunities) as opportunity_count,
  total_evaluated,
  scan_duration_seconds,
  EXTRACT(EPOCH FROM (NOW() - scan_timestamp)) / 60 AS age_minutes
FROM cached_scan_results
ORDER BY scan_timestamp DESC
LIMIT 5;
```

#### View in Next.js logs:
```
⚡ Checking cache for strict mode results...
🚀 Serving cached results (3.2 min old, 18 opportunities)
```

## Configuration

### Adjust Cache TTL

In `app/api/scan-enhanced/route.ts`:

```typescript
// Change cache freshness threshold (default: 15 minutes)
if (ageMinutes > 15) {  // <-- Change this value
  console.warn(`Cached scan is stale`)
  return null
}
```

### Adjust Scan Frequency

Change cron schedule:
- Every 5 minutes: `*/5 * * * *`
- Every 10 minutes: `*/10 * * * *` (recommended)
- Every 15 minutes: `*/15 * * * *`

### Adjust Symbol Coverage

In `scripts/background_scanner.py`:

```python
run_enhanced_scan(
    max_symbols=None,  # None = scan ALL symbols (50-100+)
    # max_symbols=30,  # Or limit to specific number
    force_refresh=True,
)
```

## Troubleshooting

### Problem: "No cached scan found"

**Solution:** Run background scanner manually once:
```bash
python3 scripts/background_scanner.py --filter-mode strict
```

### Problem: "Cached scan is stale"

**Cause:** Background scanner hasn't run in >15 minutes

**Solutions:**
1. Check cron job is running
2. Check environment variables are set
3. Check Render logs for errors
4. Run manually to verify it works

### Problem: API still timing out

**Cause:** No cache available, falling back to live scan

**Solution:** Ensure background scanner runs successfully:
```bash
# Test locally first
python3 scripts/background_scanner.py --filter-mode strict

# Check Supabase has data
# Go to Supabase Studio -> Table Editor -> cached_scan_results
```

### Problem: Background scanner fails

Check logs:
```bash
# Render: View cron job logs in dashboard
# GitHub Actions: Check workflow run logs
# Local: See terminal output
```

Common issues:
- Missing `SUPABASE_SERVICE_ROLE_KEY` (not anon key!)
- Python dependencies not installed
- Network connectivity to Supabase

## Performance Metrics

### Before (Synchronous Scan):
- User wait time: 120-240 seconds
- Often times out
- CPU intensive on every request
- Poor UX

### After (Background Cached Scan):
- User wait time: <2 seconds
- Never times out
- Zero CPU on user request
- Excellent UX
- Can scan 100+ symbols with all features

## Cleanup Old Scans

Automatically cleanup old cached scans (keeps last 100):

```sql
-- Run manually or via cron
SELECT cleanup_old_scans();
```

Or set up automatic cleanup via Supabase cron:
```sql
SELECT cron.schedule(
  'cleanup-old-scans',
  '0 0 * * *', -- Daily at midnight
  $$SELECT cleanup_old_scans()$$
);
```

## Next Steps

1. ✅ Run migration
2. ✅ Test background scanner locally
3. ✅ Verify API serves cached results
4. ✅ Set up Render cron job
5. Monitor for 24 hours
6. Adjust frequency/TTL as needed

## Future Enhancements

- **Progressive streaming:** Show results as they arrive
- **Multiple filter modes:** Cache both strict and relaxed
- **Symbol-specific caching:** Cache analysis per symbol
- **Real-time updates:** WebSocket updates when new scan completes
