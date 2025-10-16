# Scanner Performance Guide

## What Broke The Scanner (October 16, 2025)

### Root Cause: Rejection Tracking Loop
**Location:** `src/scanner/service.py` lines 508-536

The rejection tracking loop was iterating through **thousands** of rejected options after filtering to top 150, causing 120+ second timeouts.

```python
# THIS WAS THE PROBLEM:
for idx, row in rejected_options.iterrows():  # Could be 1000+ iterations!
    row_symbol = row.get('symbol', 'UNKNOWN')
    # ... expensive dict conversions ...
    self.rejection_tracker.log_rejection(...)  # Database/file writes
```

**Why it happened:**
- Added for "retrospective analysis"
- Seemed harmless for small datasets
- During market hours: 1000+ rejected options × expensive operations = 120s+ hang

**The fix:**
- Disabled entire rejection tracking loop
- Now just logs count: `Skipping rejection tracking for speed (N rejected options)`

### Secondary Issues Fixed
1. **Signal-based timeout didn't work in subprocesses** - switched to threading-based timeout
2. **yfinance could hang indefinitely** - now times out after 30s per operation

## ⚠️ RULES TO PREVENT BREAKING SCANNER

### 1. NO EXPENSIVE LOOPS IN HOT PATH
**❌ NEVER DO THIS:**
```python
for row in large_dataframe.iterrows():
    # Expensive operation (I/O, dict conversions, etc.)
    tracker.log_something(row.to_dict())
```

**✅ DO THIS INSTEAD:**
```python
# Just log aggregate stats
print(f"Rejected {len(large_dataframe)} options for speed")
# Or limit iterations
for idx, row in large_dataframe.head(10).iterrows():
    tracker.log_something(row.to_dict())
```

### 2. ALWAYS ADD LOGGING AROUND SLOW OPERATIONS
```python
print("📍 About to fetch options data...", file=sys.stderr)
result = expensive_operation()
print(f"📍 Fetched {len(result)} rows in Xs", file=sys.stderr)
```

This makes it easy to pinpoint hangs in logs.

### 3. SET REALISTIC TIMEOUTS
- Scanner has 120-second total timeout from Next.js
- Each yfinance operation: 30-second timeout
- Budget: ~15 seconds per symbol for 25 symbols = ~90 seconds total

### 4. DISABLE BACKTESTING BY DEFAULT
```bash
DISABLE_BACKTESTING=1  # Always set this env var!
```
Backtesting adds 10-15 minutes. Only enable on-demand via API.

### 5. TEST WITH PRODUCTION DATA SIZES
```bash
# Test locally with realistic data
PYTHONPATH=. python3 -m src.scanner.enhanced_service
```

Watch for operations that take >10 seconds.

## Performance Budget

| Operation | Time Budget | Notes |
|-----------|-------------|-------|
| Fetch options data (25 symbols) | 30-60s | Network I/O, yfinance throttling |
| Filter to liquid options | <1s | DataFrame operations |
| Analyze opportunities | 20-40s | Greek calculations, scoring |
| Enhancement (optional) | Skip | Move to on-demand API |
| **Total** | **60-90s** | Must stay under 120s |

## Monitoring

Check stderr logs for these markers:
- `🔍 Starting smart options scan...`
- `📍 About to fetch options data...` ← Start timing
- `📍 Options data fetched successfully` ← End timing
- `⚡ Limited to top 150 highest-volume options` ← Should be immediate
- `📊 Skipping rejection tracking` ← Should be immediate
- `✅ Found N opportunities` ← Success!

**If you see long gaps between log lines, that's where the hang is.**

## Emergency Fixes

If scanner breaks again:

1. **Check recent git commits** - what changed?
2. **Check stderr logs** - where did it stop logging?
3. **Look for loops over DataFrames** - any new `.iterrows()` calls?
4. **Disable new features** - comment out recent additions
5. **Deploy last known good commit** - Git revert if needed

## Last Known Good Commits

- `befa20f` (2025-10-16) - Disabled rejection tracking, scanner works
- Add more here as we verify stability...

---

**Remember:** Scanner must complete in <120 seconds. Every operation matters.
