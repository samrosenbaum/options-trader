-- Add table for politician/congressional trading disclosures
-- Stores both House and Senate financial disclosure data

CREATE TABLE IF NOT EXISTS politician_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Politician Information
  politician_name TEXT NOT NULL,
  chamber TEXT NOT NULL CHECK (chamber IN ('House', 'Senate')),
  party TEXT CHECK (party IN ('Democrat', 'Republican', 'Independent', 'Unknown')),
  state TEXT,
  district TEXT, -- For House members

  -- Trade Information
  ticker TEXT NOT NULL,
  asset_description TEXT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'sale', 'exchange', 'partial_sale')),
  amount_range TEXT NOT NULL, -- e.g., "$1,001 - $15,000"
  owner TEXT, -- e.g., "self", "spouse", "joint", "dependent"

  -- Dates
  transaction_date DATE,
  disclosure_date DATE NOT NULL,
  disclosure_year INTEGER,

  -- Additional Details
  industry TEXT,
  sector TEXT,
  cap_gains_over_200_usd BOOLEAN,

  -- Source Information
  ptr_link TEXT, -- Periodic Transaction Report link
  source_file TEXT, -- Which data source this came from
  raw_data JSONB, -- Store the full original JSON for reference

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Create a unique constraint to prevent duplicate trades
  CONSTRAINT unique_politician_trade UNIQUE (
    politician_name,
    ticker,
    transaction_date,
    disclosure_date,
    transaction_type,
    amount_range
  )
);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_politician_trades_ticker ON politician_trades(ticker);
CREATE INDEX IF NOT EXISTS idx_politician_trades_politician ON politician_trades(politician_name);
CREATE INDEX IF NOT EXISTS idx_politician_trades_transaction_date ON politician_trades(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_politician_trades_disclosure_date ON politician_trades(disclosure_date DESC);
CREATE INDEX IF NOT EXISTS idx_politician_trades_chamber ON politician_trades(chamber);
CREATE INDEX IF NOT EXISTS idx_politician_trades_party ON politician_trades(party);
CREATE INDEX IF NOT EXISTS idx_politician_trades_transaction_type ON politician_trades(transaction_type);

-- Create a composite index for ticker + transaction date queries (most common use case)
CREATE INDEX IF NOT EXISTS idx_politician_trades_ticker_date ON politician_trades(ticker, transaction_date DESC);

-- Add RLS (Row Level Security) - this data is public, so everyone can read
ALTER TABLE politician_trades ENABLE ROW LEVEL SECURITY;

-- Allow all users to read politician trades (public data)
CREATE POLICY "Allow public read access to politician trades"
  ON politician_trades
  FOR SELECT
  USING (true);

-- Only allow service role to insert/update/delete
CREATE POLICY "Only service role can modify politician trades"
  ON politician_trades
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add a comment to the table
COMMENT ON TABLE politician_trades IS 'Congressional stock trading disclosures from both House and Senate members. Updated regularly via scraper.';
