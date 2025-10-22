-- Add closed position tracking to rejected_options table
-- This allows tracking positions that were closed before expiration

ALTER TABLE rejected_options
ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS days_until_expiration INTEGER,
ADD COLUMN IF NOT EXISTS days_held INTEGER,
ADD COLUMN IF NOT EXISTS realized_pl NUMERIC,
ADD COLUMN IF NOT EXISTS realized_pl_percent NUMERIC;

-- Create index for querying closed positions
CREATE INDEX IF NOT EXISTS idx_rejected_options_position_id ON rejected_options(position_id);
CREATE INDEX IF NOT EXISTS idx_rejected_options_rejection_source ON rejected_options(rejection_source);

-- Update the rejection_analysis view to include closed position metrics
DROP VIEW IF EXISTS rejection_analysis;

CREATE VIEW rejection_analysis AS
SELECT
  rejection_reason,
  filter_stage,
  rejection_source,
  COUNT(*) as total_rejections,
  COUNT(CASE WHEN was_profitable = true THEN 1 END) as profitable_count,
  ROUND(
    COUNT(CASE WHEN was_profitable = true THEN 1 END)::numeric /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) as hit_rate_percent,
  ROUND(AVG(price_change_percent), 2) as avg_price_change_percent,
  ROUND(AVG(CASE WHEN was_profitable = true THEN price_change_percent END), 2) as avg_profitable_change,
  COUNT(CASE WHEN position_id IS NOT NULL THEN 1 END) as closed_positions_count,
  ROUND(AVG(CASE WHEN position_id IS NOT NULL THEN days_until_expiration END), 1) as avg_days_remaining,
  ROUND(AVG(CASE WHEN position_id IS NOT NULL THEN realized_pl END), 2) as avg_realized_pl
FROM rejected_options
WHERE rejected_at >= NOW() - INTERVAL '90 days'
GROUP BY rejection_reason, filter_stage, rejection_source
ORDER BY total_rejections DESC;
