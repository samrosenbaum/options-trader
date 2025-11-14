# Email Brief Setup Guide

This guide will help you set up automatic email delivery of analyst briefs using Resend.

## Step 1: Get Your Resend API Key

You already have a Resend account! Now get your API key:

1. Go to https://resend.com/api-keys
2. Copy your API key (starts with `re_...`)

## Step 2: Configure Environment Variables

Open `.env.local` and add your credentials:

```bash
# Resend API (for email briefs)
RESEND_API_KEY=re_your_actual_api_key_here
ANALYST_EMAIL_RECIPIENT=your-email@example.com
ADMIN_EMAIL_RECIPIENT=admin@example.com
```

**Replace:**
- `re_your_actual_api_key_here` with your actual Resend API key
- `your-email@example.com` with the email where you want to receive analyst briefs
- `admin@example.com` with the email where you want to receive admin notifications (new user signups, daily usage summaries)

## Step 3: Restart the Server

```bash
# Kill the current dev server
lsof -ti:3000 | xargs kill -9

# Restart
npm run dev
```

## Step 4: Test Email Sending

Visit: http://localhost:3000/analyst-email-test

Click the buttons to manually send test emails:
- **Send Morning Brief** - Pre-market intelligence (7:00 AM)
- **Send Nightly Brief** - Tomorrow's battle plan (8:00 PM)

You should receive the emails within seconds!

## What's in Each Email?

### Morning Brief (7:00 AM)
- Market conditions (SPY/QQQ trends)
- Unusual options activity (UOA signals)
- Pre-market movers (stocks gapping up/down)
- Earnings today
- Your watchlist for the day

### Nightly Brief (8:00 PM)
- Tomorrow's high-conviction plays
- Key setups with entry strategies
- Market levels (support/resistance)
- Earnings tomorrow
- Portfolio risk summary

### Market Open Update (9:35 AM)
- Entry opportunities with confidence ratings
- HOW TO ENTER strategies
- Stocks to AVOID (too risky)

### Weekly Analysis (Sunday)
- Win rate and P&L summary
- UOA scanner accuracy
- Key learnings from the week
- Next week's action plan

## Admin Notifications

In addition to user-facing briefs, the system also sends admin notifications:

### New User Signup Alert (Immediate)
Sent to `ADMIN_EMAIL_RECIPIENT` whenever a new user completes onboarding:
- User email address
- User name (if provided)
- Signup timestamp (Eastern Time)

### Daily Usage Summary (9:00 AM ET)
Sent to `ADMIN_EMAIL_RECIPIENT` every morning with the previous day's metrics:
- **User Metrics**: New signups, active users, total users
- **Activity Metrics**: Scans run, positions created, positions closed
- **Current State**: Total open positions

These notifications help you track product growth and user engagement.

## Setting Up Automatic Scheduling

For production, you'll want to schedule these emails automatically. Options:

### Option 1: Vercel Cron Jobs (Recommended)

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/analyst/send-morning-brief",
      "schedule": "0 11 * * 1-5"
    },
    {
      "path": "/api/analyst/send-nightly-brief",
      "schedule": "0 0 * * 1-5"
    }
  ]
}
```

### Option 2: GitHub Actions

See `docs/SCHEDULING.md` for GitHub Actions setup.

### Option 3: Manual Triggers

Just visit http://localhost:3000/analyst-email-test whenever you want to send!

## Troubleshooting

### "RESEND_API_KEY is not set"
- Make sure you added it to `.env.local`
- Restart the dev server after adding it

### No email received
- Check your spam folder
- Verify the email address in `ANALYST_EMAIL_RECIPIENT`
- Check the test page for error messages

### Using a custom domain
By default, emails come from `onboarding@resend.dev` (Resend's test domain).

To use your own domain:
1. Add and verify your domain in Resend dashboard
2. Update `lib/resend.ts`:
   ```typescript
   from: 'Monty Analyst <analyst@yourdomain.com>'
   ```

## Next Steps

Once emails are working:
1. Set up automatic scheduling (Option 1 or 2 above)
2. Customize email styling (HTML templates)
3. Add unsubscribe links (if sending to multiple users)
4. Monitor email delivery in Resend dashboard
