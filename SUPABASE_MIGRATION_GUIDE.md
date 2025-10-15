# Supabase Migration Guide - Rejection Tracker

The rejection tracker has been migrated from SQLite to Supabase for permanent cloud storage.

## What Changed

### Before (SQLite)
- Stored in `data/rejection_tracker.db`
- Wiped on every Render deploy
- Single-instance only
- Manual backup required

### After (Supabase)
- Stored in Supabase cloud database
- Persists across all deploys
- Multi-instance compatible
- Automatic backups

## Setup Steps

### 1. Run the Migration in Supabase

You have two options:

#### Option A: Using Supabase CLI (Recommended)
```bash
# Make sure you're logged in
supabase login

# Link your project (if not already linked)
supabase link --project-ref YOUR_PROJECT_REF

# Push the migration
supabase db push
```

#### Option B: Manual via Supabase Studio
1. Go to https://app.supabase.com/project/YOUR_PROJECT/editor
2. Click **SQL Editor**
3. Open the file: `supabase/migrations/004_add_rejection_tracker.sql`
4. Copy and paste the SQL into the editor
5. Click **Run**

### 2. Verify Environment Variables

Make sure these are set in **Render** dashboard and your `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Service role key is needed for backend Python scanner to write data
# Find it in: Supabase Dashboard → Settings → API → service_role key
```

### 3. Install Python Dependency

Already added to `requirements.txt`:
```bash
pip install supabase>=2.0.0
```

Render will install this automatically on next deploy.

## Testing Locally

```bash
# Set environment variables
export NEXT_PUBLIC_SUPABASE_URL="your_url"
export SUPABASE_SERVICE_ROLE_KEY="your_key"

# Test the tracker
python3 -c "from src.analysis.rejection_tracker import RejectionTracker; tracker = RejectionTracker(); print('✅ Supabase connection successful')"
```

## Verifying Data in Supabase

After your scanner runs, check that rejections are being logged:

1. Go to Supabase Studio: https://app.supabase.com/project/YOUR_PROJECT
2. Click **Table Editor**
3. Select `rejected_options` table
4. You should see rejection data appearing as the scanner runs

## Query Examples

### View Recent Rejections
```sql
SELECT
  symbol,
  strike,
  rejection_reason,
  filter_stage,
  rejected_at
FROM rejected_options
ORDER BY rejected_at DESC
LIMIT 20;
```

### See Profitable Rejections
```sql
SELECT
  symbol,
  strike,
  rejection_reason,
  price_change_percent
FROM rejected_options
WHERE was_profitable = true
ORDER BY price_change_percent DESC
LIMIT 10;
```

### Use the Analysis View
```sql
SELECT *
FROM rejection_analysis
WHERE profitable_rate > 0.5
ORDER BY profitable_rate DESC;
```

## Troubleshooting

### "Missing Supabase credentials" error
- Make sure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Render
- Restart your Render service after adding env vars

### "supabase package not installed" error
- Run: `pip install supabase`
- Or redeploy on Render (will install from requirements.txt)

### "relation 'rejected_options' does not exist" error
- The migration hasn't been run yet
- Follow Step 1 above to create the table

### No data appearing in Supabase
- Check scanner logs for rejection logging errors
- Verify scanner is actually rejecting options (try strict filters)
- Check Supabase project is correct in env vars

## Rolling Back (if needed)

If you need to revert to SQLite:

1. Checkout the previous commit:
   ```bash
   git checkout HEAD~1 src/analysis/rejection_tracker.py
   ```

2. Remove supabase from requirements.txt

3. Data in Supabase will remain safe for future use

## Next Steps

After migration is complete:

1. ✅ Scanner will automatically log rejections to Supabase
2. ✅ Run analysis script tomorrow: `python scripts/analyze_rejections.py`
3. ✅ Review recommendations and tune filters
4. ✅ (Optional) Build a dashboard to view rejections in real-time
