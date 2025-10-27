-- Add field to track opening portfolio value for intraday change calculation
ALTER TABLE portfolio_snapshots
ADD COLUMN IF NOT EXISTS opening_value_today DECIMAL(12, 2);

-- Add comment explaining the field
COMMENT ON COLUMN portfolio_snapshots.opening_value_today IS 'Portfolio value at market open (9:30 AM ET) for calculating intraday changes';
