# Email Setup Guide - Resend Integration

Get your Morning Brief delivered automatically via email! ✉️

---

## Step 1: Create Resend Account

1. Go to https://resend.com
2. Sign up with your email (free plan includes 3,000 emails/month)
3. Verify your email address

---

## Step 2: Get API Key

1. In Resend dashboard, go to **API Keys**
2. Click **Create API Key**
3. Name it: `Monty Production`
4. Copy the API key (starts with `re_...`)

---

## Step 3: Add Domain (Optional but Recommended)

**Without domain:** Emails sent from `onboarding@resend.dev`
**With domain:** Emails sent from `briefings@monty.trading` (or your domain)

### To add domain:

1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `monty.trading`)
4. Add the DNS records Resend provides to your domain registrar
5. Wait for verification (usually 5-15 minutes)

---

## Step 4: Install Resend in Your App

```bash
cd /Users/samrosenbaum/options-trader
npm install resend
```

---

## Step 5: Add Environment Variables

Add to your `.env.local` file:

```bash
# Resend API Key
RESEND_API_KEY=re_your_api_key_here

# Base URL for links in emails
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Optional: Custom sender domain
RESEND_FROM_EMAIL=briefings@monty.trading
```

**For production (Vercel):**

1. Go to Vercel dashboard → Your project → Settings → Environment Variables
2. Add `RESEND_API_KEY` with your key
3. Add `NEXT_PUBLIC_BASE_URL` with your production URL (e.g., `https://monty.trading`)

---

## Step 6: Create Cron Job API Route

Create `/app/api/cron/morning-brief/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { sendBriefToUsers } from "@/src/email/send-morning-brief"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET(request: Request) {
  // Verify cron secret (security)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get users who want morning briefs
    const supabase = await createClient()
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('analyst_brief_enabled', true) // Add this column to users table

    if (error) {
      console.error('Error fetching users:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'No users subscribed' })
    }

    // Fetch morning brief data
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/analyst/morning-brief`)
    const { brief } = await response.json()

    // Format recipients
    const recipients = users.map(user => ({
      email: user.email,
      name: user.full_name,
      user_id: user.id,
      dashboard_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`
    }))

    // Send emails
    const results = await sendBriefToUsers(brief, recipients)

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      success: true,
      sent: successful,
      failed: failed,
      total: users.length
    })
  } catch (error) {
    console.error('Error sending morning briefs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send briefs' },
      { status: 500 }
    )
  }
}
```

---

## Step 7: Schedule the Cron Job

### Option A: Vercel Cron (Recommended for Production)

Create `vercel.json` in your project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/morning-brief",
      "schedule": "0 11 * * 1-5"
    }
  ]
}
```

**Schedule explained:**
- `0 11 * * 1-5` = 11:00 AM UTC = 7:00 AM ET (Monday-Friday)

**Generate a cron secret:**

```bash
# Generate random secret
openssl rand -base64 32

# Add to Vercel environment variables:
CRON_SECRET=your_generated_secret_here
```

### Option B: Manual Test

Test the endpoint manually first:

```bash
# Test locally
curl http://localhost:3000/api/cron/morning-brief \
  -H "Authorization: Bearer your_cron_secret_here"

# Test in production
curl https://your-app.vercel.app/api/cron/morning-brief \
  -H "Authorization: Bearer your_cron_secret_here"
```

---

## Step 8: Add Database Column

Add to your Supabase `users` table:

```sql
-- Enable/disable morning briefs per user
ALTER TABLE users ADD COLUMN analyst_brief_enabled BOOLEAN DEFAULT false;

-- Preferred time for briefs (future enhancement)
ALTER TABLE users ADD COLUMN analyst_email_time TIME DEFAULT '07:00:00';

-- Minimum vol/OI ratio to include in email
ALTER TABLE users ADD COLUMN analyst_min_vol_oi_ratio NUMERIC DEFAULT 2.0;
```

---

## Step 9: Test Email Sending

Create a test script `scripts/test-email.ts`:

```typescript
import { sendBriefToUsers } from '../src/email/send-morning-brief'

async function test() {
  // Fetch real brief data
  const response = await fetch('http://localhost:3000/api/analyst/morning-brief')
  const { brief } = await response.json()

  // Send to your email
  const results = await sendBriefToUsers(brief, [
    {
      email: 'your-email@example.com',
      name: 'Test User',
      user_id: 'test_123',
      dashboard_url: 'http://localhost:3000/dashboard'
    }
  ])

  console.log('Results:', results)
}

test()
```

Run it:

```bash
npx tsx scripts/test-email.ts
```

---

## Step 10: Enable for Users

Add to your user settings page:

```typescript
// components/settings/email-preferences.tsx

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function EmailPreferences({ userId }: { userId: string }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)

  async function toggleBriefs() {
    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('users')
      .update({ analyst_brief_enabled: !enabled })
      .eq('id', userId)

    if (!error) {
      setEnabled(!enabled)
    }

    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Morning Brief</h3>
      <p className="text-sm text-gray-600">
        Receive daily pre-market intelligence at 7:00 AM ET
      </p>

      <button
        onClick={toggleBriefs}
        disabled={loading}
        className={`px-4 py-2 rounded-lg ${
          enabled
            ? 'bg-green-600 text-white'
            : 'bg-gray-200 text-gray-700'
        }`}
      {
        loading ? 'Updating...' : enabled ? 'Enabled ✓' : 'Disabled'
      }
      </button>
    </div>
  )
}
```

---

## Testing Checklist

Before going live:

- [ ] Resend API key added to environment
- [ ] `npm install resend` completed
- [ ] Test email sent successfully
- [ ] Database column `analyst_brief_enabled` added
- [ ] Cron job API route created
- [ ] Cron secret generated and added to Vercel
- [ ] `vercel.json` cron schedule configured
- [ ] Test with your own email address
- [ ] Email displays correctly in Gmail/Outlook/Apple Mail
- [ ] Links in email work correctly
- [ ] Unsubscribe flow implemented

---

## Monitoring

Check your cron jobs in Vercel:

1. Go to Vercel dashboard → Your project → Logs
2. Filter by `/api/cron/morning-brief`
3. Check for successful executions at 11:00 AM UTC

Check Resend dashboard:

1. Go to https://resend.com/emails
2. See all sent emails
3. View open rates, click rates, bounces

---

## Cost Estimates

**Resend Pricing:**
- Free: 3,000 emails/month
- Pro: $20/month for 50,000 emails

**Example:**
- 100 users × 5 days/week × 4 weeks = 2,000 emails/month (FREE ✅)
- 500 users × 5 days/week × 4 weeks = 10,000 emails/month ($20/month)

---

## Troubleshooting

**Issue: Emails not sending**
- Check Resend dashboard for error logs
- Verify API key is correct
- Check environment variables in Vercel

**Issue: Emails going to spam**
- Add SPF/DKIM records for your domain
- Use Resend's domain verification
- Ask recipients to whitelist `briefings@monty.trading`

**Issue: Cron job not running**
- Verify cron schedule in `vercel.json`
- Check Vercel logs for errors
- Ensure cron secret matches in environment

**Issue: Slow email generation**
- Morning brief takes ~45 seconds to generate
- Consider caching brief data for 5 minutes
- Send emails in batches of 50

---

## Next Steps

1. **Set up Resend account** ← Start here!
2. **Test with your email**
3. **Deploy to Vercel**
4. **Add user preferences UI**
5. **Monitor first week of emails**
6. **Iterate based on user feedback**

You're ready to deliver intelligence straight to your users' inboxes! 📧🚀
