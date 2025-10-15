-- Create rejected_options table for filter optimization
-- This table tracks options that were filtered out by the scanner
-- to validate filter tuning decisions and identify missed opportunities

CREATE TABLE IF NOT EXISTS rejected_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Option identification
  symbol TEXT NOT NULL,
  strike NUMERIC NOT NULL,
  expiration DATE NOT NULL,
  option_type TEXT NOT NULL CHECK (option_type IN ('call', 'put')),

  -- Rejection details
  rejection_reason TEXT NOT NULL,
  filter_stage TEXT NOT NULL, -- 'liquidity_strict', 'institutional_filters', etc.
  rejected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Metrics at rejection time
  stock_price NUMERIC NOT NULL,
  option_price NUMERIC NOT NULL,
  volume INTEGER NOT NULL,
  open_interest INTEGER NOT NULL,
  implied_volatility NUMERIC,
  delta NUMERIC,

  -- Optional scoring that was computed
  probability_score NUMERIC,
  risk_adjusted_score NUMERIC,
  quality_score NUMERIC,

  -- Next-day tracking (populated later by analysis script)
  next_day_price NUMERIC,
  price_change_percent NUMERIC,
  was_profitable BOOLEAN,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX idx_rejected_options_rejected_at ON rejected_options(rejected_at);
CREATE INDEX idx_rejected_options_symbol_expiration ON rejected_options(symbol, expiration);
CREATE INDEX idx_rejected_options_filter_stage ON rejected_options(filter_stage);
CREATE INDEX idx_rejected_options_rejection_reason ON rejected_options(rejection_reason);
CREATE INDEX idx_rejected_options_was_profitable ON rejected_options(was_profitable) WHERE was_profitable IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE rejected_options ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role to read/write (for backend scanner)
-- Note: This is a system-wide tracking table, not user-specific
CREATE POLICY "Service role can manage rejected_options"
  ON rejected_options
  USING (true)
  WITH CHECK (true);

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_rejected_options_updated_at
  BEFORE UPDATE ON rejected_options
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create view for easy analysis
CREATE OR REPLACE VIEW rejection_analysis AS
SELECT
  rejection_reason,
  filter_stage,
  COUNT(*) as total_rejections,
  COUNT(CASE WHEN was_profitable = true THEN 1 END) as profitable_count,
  ROUND(AVG(CASE WHEN was_profitable = true THEN 1.0 ELSE 0.0 END) * 100, 2) as profitable_rate,
  ROUND(AVG(price_change_percent), 2) as avg_price_change,
  ROUND(AVG(volume), 0) as avg_volume,
  ROUND(AVG(open_interest), 0) as avg_open_interest
FROM rejected_options
WHERE next_day_price IS NOT NULL
GROUP BY rejection_reason, filter_stage
ORDER BY profitable_rate DESC;

-- Grant select on view to authenticated users (optional - for dashboard)
-- GRANT SELECT ON rejection_analysis TO authenticated;
