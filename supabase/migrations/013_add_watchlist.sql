-- Create watchlist table for tracking interesting options across devices
CREATE TABLE IF NOT EXISTS watchlist (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  option_type TEXT NOT NULL CHECK (option_type IN ('call', 'put')),
  strike NUMERIC NOT NULL,
  expiration TEXT NOT NULL,
  premium NUMERIC NOT NULL,
  score NUMERIC,
  risk_level TEXT,
  days_to_expiration INTEGER,
  trade_summary TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);

-- Create index for expiration lookups (to clean up old entries)
CREATE INDEX IF NOT EXISTS idx_watchlist_expiration ON watchlist(expiration);

-- Enable RLS (Row Level Security)
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own watchlist items
CREATE POLICY "Users can view their own watchlist items"
  ON watchlist FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own watchlist items
CREATE POLICY "Users can insert their own watchlist items"
  ON watchlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own watchlist items
CREATE POLICY "Users can update their own watchlist items"
  ON watchlist FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own watchlist items
CREATE POLICY "Users can delete their own watchlist items"
  ON watchlist FOR DELETE
  USING (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_watchlist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
CREATE TRIGGER set_watchlist_updated_at
  BEFORE UPDATE ON watchlist
  FOR EACH ROW
  EXECUTE FUNCTION update_watchlist_updated_at();
