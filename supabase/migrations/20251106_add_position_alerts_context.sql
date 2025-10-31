-- Add contextual insights and real-time profit alert tracking
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS contextual_insights JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_alerts JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_profit_alert_threshold NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_profit_alert_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN positions.contextual_insights IS 'Expandable cards surfaced to traders for context-aware decisions';
COMMENT ON COLUMN positions.pending_alerts IS 'Actionable alerts awaiting user acknowledgement';
COMMENT ON COLUMN positions.last_profit_alert_threshold IS 'Highest profit threshold that has generated an alert';
COMMENT ON COLUMN positions.last_profit_alert_at IS 'Timestamp of the last profit threshold alert trigger';
