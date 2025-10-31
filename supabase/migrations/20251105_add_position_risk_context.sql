-- Add tracking columns for enhanced exit signal context
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS peak_unrealized_pl NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_unrealized_pl_percent NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_option_price NUMERIC,
  ADD COLUMN IF NOT EXISTS last_catalyst_review TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN positions.peak_unrealized_pl IS 'Largest unrealized profit measured in dollars';
COMMENT ON COLUMN positions.peak_unrealized_pl_percent IS 'Largest unrealized profit measured in percent';
COMMENT ON COLUMN positions.peak_option_price IS 'Highest observed option price for this position';
COMMENT ON COLUMN positions.last_catalyst_review IS 'Timestamp of the most recent binary catalyst review';
