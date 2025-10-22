-- Add rejection_source column to track user vs scanner rejections

ALTER TABLE rejected_options
ADD COLUMN IF NOT EXISTS rejection_source TEXT DEFAULT 'scanner_rejected' CHECK (rejection_source IN ('user_rejected', 'scanner_rejected'));

-- Create index for filtering by rejection source
CREATE INDEX IF NOT EXISTS idx_rejected_options_rejection_source ON rejected_options(rejection_source);

-- Drop and recreate the rejection_analysis view with the new column
DROP VIEW IF EXISTS rejection_analysis;

CREATE VIEW rejection_analysis AS
SELECT
  rejection_reason,
  filter_stage,
  rejection_source,
  COUNT(*) as total_rejections,
  COUNT(CASE WHEN was_profitable = true THEN 1 END) as profitable_count,
  ROUND(AVG(CASE WHEN was_profitable = true THEN 1.0 ELSE 0.0 END) * 100, 2) as profitable_rate,
  ROUND(AVG(price_change_percent), 2) as avg_price_change,
  ROUND(AVG(volume), 0) as avg_volume,
  ROUND(AVG(open_interest), 0) as avg_open_interest
FROM rejected_options
WHERE next_day_price IS NOT NULL
GROUP BY rejection_reason, filter_stage, rejection_source
ORDER BY profitable_rate DESC;
