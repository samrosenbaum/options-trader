-- Drop Risk Signals Table
-- Stores composite drop risk scores from multi-signal analysis

CREATE TABLE IF NOT EXISTS drop_risk_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  drop_risk_score NUMERIC(6,2) NOT NULL,
  bias_score NUMERIC(6,2) NOT NULL,
  confidence NUMERIC(5,2) NOT NULL,
  stock_price NUMERIC(12,4),
  price_change_pct NUMERIC(6,2),
  alert_level TEXT NOT NULL DEFAULT 'watch',
  drivers JSONB NOT NULL DEFAULT '[]'::jsonb,
  signal_details JSONB NOT NULL,
  score_change NUMERIC(6,2),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by symbol and recency
CREATE INDEX IF NOT EXISTS idx_drop_risk_signals_symbol_generated
  ON drop_risk_signals(symbol, generated_at DESC);

-- Index for filtering by score
CREATE INDEX IF NOT EXISTS idx_drop_risk_signals_score
  ON drop_risk_signals(drop_risk_score DESC);

-- Index for alert level filtering
CREATE INDEX IF NOT EXISTS idx_drop_risk_signals_alert_level
  ON drop_risk_signals(alert_level, generated_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_drop_risk_signals_recent_high
  ON drop_risk_signals(generated_at DESC, drop_risk_score DESC)
  WHERE drop_risk_score >= 50;

-- Enable RLS
ALTER TABLE drop_risk_signals ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read drop risk signals
CREATE POLICY "allow authenticated read drop risk"
  ON drop_risk_signals
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE TRIGGER set_drop_risk_updated_at
  BEFORE UPDATE ON drop_risk_signals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE drop_risk_signals IS 'Multi-signal bearish risk scores for drop prediction';
COMMENT ON COLUMN drop_risk_signals.drop_risk_score IS 'Composite risk score 0-100';
COMMENT ON COLUMN drop_risk_signals.bias_score IS 'Legacy bias score from original engine';
COMMENT ON COLUMN drop_risk_signals.confidence IS 'Signal confidence 0-100';
COMMENT ON COLUMN drop_risk_signals.drivers IS 'Array of key signal drivers (e.g., ["Put skew 92nd percentile", "Block trades 3× avg"])';
COMMENT ON COLUMN drop_risk_signals.signal_details IS 'Raw signal metrics and percentiles for detail view';
COMMENT ON COLUMN drop_risk_signals.score_change IS 'Change in score vs previous scan (for intraday monitoring)';
