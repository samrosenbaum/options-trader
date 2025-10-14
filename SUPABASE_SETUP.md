# Supabase Portfolio Tracker Setup

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in:
   - **Name**: options-trader-portfolio
   - **Database Password**: (create a strong password - save it!)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free
4. Click "Create new project"

Wait a few minutes for the project to be created.

## Step 2: Run Database Migration

1. In your Supabase project, go to the **SQL Editor** (left sidebar)
2. Click "New Query"
3. Copy the entire contents of `supabase/migrations/001_initial_schema.sql`
4. Paste it into the SQL editor
5. Click "Run" (or press Cmd/Ctrl + Enter)

You should see a success message. This creates your `positions` and `alerts` tables with proper security.

## Step 3: Get Your API Keys

1. In your Supabase project, go to **Settings** → **API**
2. You'll see two important values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (long string)

## Step 4: Configure Local Environment

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` and add your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

## Step 5: Configure Email Authentication

1. In Supabase, go to **Authentication** → **Providers**
2. Enable **Email** provider (should be enabled by default)
3. Go to **Authentication** → **URL Configuration**
4. Add your site URL:
   - **Site URL**: `http://localhost:3000` (for local dev)
   - **Redirect URLs**: Add `http://localhost:3000/auth/callback`

For production (Render):
   - **Site URL**: `https://your-app.onrender.com`
   - **Redirect URLs**: Add `https://your-app.onrender.com/auth/callback`

## Step 6: Test It Out

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Visit `http://localhost:3000/auth/login`
3. Create an account
4. Check your email for confirmation
5. Click the confirmation link
6. You should be redirected to `/portfolio`

## What You Get

### Portfolio Tracker Features
- **User Authentication**: Sign up, login, secure sessions
- **Position Tracking**: Log your options trades
- **Open Positions Table**: See all your active trades
- **P&L Tracking**: Unrealized and realized profit/loss
- **Add Position Form**: Quick entry for new trades

### Database Tables
- **positions**: Stores your options trades
  - Entry price, strike, expiration
  - Current P&L (manual for now)
  - Greeks snapshot at entry
  - Notes and tags
- **alerts**: For future profit target/stop loss alerts

### Security (RLS)
- Users can only see/edit their own positions
- All queries are automatically filtered by user_id
- Database-level security via Row Level Security policies

## Next Steps

Now that the foundation is set up, you can:

1. **Deploy to Render**: Add the environment variables to Render dashboard
2. **Auto-update prices**: Add a cron job to fetch current option prices
3. **Exit recommendations**: Build the logic to suggest when to close positions
4. **Alerts**: Add email/SMS notifications for profit targets
5. **Analytics**: Win rate, best symbols, performance over time

## Troubleshooting

**"Invalid API key"**: Double-check your `.env.local` has the correct values

**"User not found"**: Make sure you confirmed your email

**"Permission denied"**: The RLS policies should be working - check SQL was run correctly

**Can't sign up**: Check Supabase → Authentication → Providers → Email is enabled
