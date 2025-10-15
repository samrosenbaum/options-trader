# Switching from Render Cron to GitHub Actions (FREE)

## Current Cost: Render Cron Job
- **~$1.40/month** (288 min/day × $0.00016/min)
- Runs every 10 minutes
- Easy to set up, reliable

## Why Switch to GitHub Actions?
- **$0/month** (100% free)
- 2,000 minutes/month free tier (more than enough)
- Same reliability
- Runs on GitHub's infrastructure

## How to Switch (When Ready)

### Step 1: Add Secrets to GitHub

1. Go to: https://github.com/YOUR_USERNAME/options-trader/settings/secrets/actions
2. Click **"New repository secret"**
3. Add these secrets:

**Secret 1:**
- Name: `SUPABASE_URL`
- Value: Your Supabase URL (e.g., `https://xxx.supabase.co`)

**Secret 2:**
- Name: `SUPABASE_SERVICE_KEY`
- Value: Your Supabase service role key

### Step 2: Commit & Push the Workflow

The workflow file is already created at `.github/workflows/background-scanner.yml`

```bash
git add .github/workflows/background-scanner.yml
git commit -m "Add GitHub Actions background scanner (free alternative to Render cron)"
git push
```

### Step 3: Verify It's Working

1. Go to: https://github.com/YOUR_USERNAME/options-trader/actions
2. You should see "Background Scanner" workflow
3. Click on it to see runs
4. You can manually trigger it with **"Run workflow"** button to test

### Step 4: Disable Render Cron Job

Once GitHub Actions is working:
1. Go to Render Dashboard
2. Find your `background-scanner` cron job
3. Click **"Suspend"** or **"Delete"**
4. Done! Now running for free on GitHub

## Comparison

| Feature | Render Cron | GitHub Actions |
|---------|-------------|----------------|
| Cost | ~$1.40/month | **FREE** |
| Setup | Easier | Need secrets setup |
| Monitoring | Render Dashboard | GitHub Actions tab |
| Minutes/month | Unlimited | 2,000 (plenty!) |
| Reliability | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

## Usage Estimate

Your usage:
- 144 scans/day × 2 min/scan = **288 min/day**
- 288 min/day × 30 days = **8,640 min/month**

**Wait... that exceeds 2,000 minutes!**

### Solution: Reduce Scan Frequency on GitHub Actions

If using GitHub Actions, change schedule to **every 15 minutes** instead of 10:

In `.github/workflows/background-scanner.yml`:
```yaml
schedule:
  - cron: '*/15 * * * *'  # Every 15 minutes (was */10)
```

New usage:
- 96 scans/day × 2 min = **192 min/day**
- 192 × 30 = **5,760 min/month**

Still exceeds! Let's do **every 20 minutes**:
```yaml
schedule:
  - cron: '*/20 * * * *'  # Every 20 minutes
```

New usage:
- 72 scans/day × 2 min = **144 min/day**
- 144 × 30 = **4,320 min/month**

Still close to limit! **Best option: Every 30 minutes**
```yaml
schedule:
  - cron: '*/30 * * * *'  # Every 30 minutes
```

Final usage:
- 48 scans/day × 2 min = **96 min/day**
- 96 × 30 = **2,880 min/month**

**Hmm, still over 2,000!**

## Recommendation: Hybrid Approach

### Option 1: Keep Render for Now
- $1.40/month is very cheap
- You get every-10-minute freshness
- Less complexity

### Option 2: GitHub Actions + Longer Cache TTL
- Change to every 30 minutes (2,880 min/month)
- Increase cache TTL from 15 min → 30 min
- Still exceeds free tier but only by ~880 minutes
- Cost would be minimal for overage

### Option 3: Optimize Scanner Runtime
- Make scanner run faster (currently ~2 min)
- If we get it to ~1 min, we can run every 20 min within free tier

## When to Switch?

**Keep Render if:**
- You want 10-minute freshness
- $1.40/month is acceptable
- You want simpler setup

**Switch to GitHub Actions if:**
- You want to save $1.40/month
- 30-minute freshness is acceptable
- You want centralized monitoring in GitHub

## My Recommendation

**Stick with Render for now** because:
1. $1.40/month is negligible cost
2. You get fresher data (10 min vs 30 min)
3. GitHub Actions free tier is actually too limited for every-10-min scans
4. Simpler to manage (one less platform)

But the workflow is ready when you want it! 🚀
