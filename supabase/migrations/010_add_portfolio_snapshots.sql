-- Drop table if it exists with bad schema
DROP TABLE IF EXISTS portfolio_snapshots CASCADE;

-- Create portfolio_snapshots table to track daily portfolio value over time
CREATE TABLE portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_value DECIMAL(12, 2) NOT NULL,
  cash_value DECIMAL(12, 2) DEFAULT 0,
  positions_value DECIMAL(12, 2) NOT NULL,
  unrealized_pl DECIMAL(12, 2) DEFAULT 0,
  realized_pl DECIMAL(12, 2) DEFAULT 0,
  daily_change DECIMAL(12, 2) DEFAULT 0,
  daily_change_percent DECIMAL(8, 4) DEFAULT 0,
  open_positions_count INT DEFAULT 0,
  closed_positions_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, snapshot_date)
);

-- Add RLS policies
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own portfolio snapshots"
  ON portfolio_snapshots
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own portfolio snapshots"
  ON portfolio_snapshots
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own portfolio snapshots"
  ON portfolio_snapshots
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_portfolio_snapshots_user_date ON portfolio_snapshots(user_id, snapshot_date DESC);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_portfolio_snapshots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER portfolio_snapshots_updated_at
  BEFORE UPDATE ON portfolio_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_portfolio_snapshots_updated_at();
