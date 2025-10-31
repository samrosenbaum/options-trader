-- Create table to persist composite drop-risk signals powering the bearish radar
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

CREATE INDEX IF NOT EXISTS drop_risk_signals_symbol_idx
    ON drop_risk_signals(symbol, generated_at DESC);

CREATE INDEX IF NOT EXISTS drop_risk_signals_generated_at_idx
    ON drop_risk_signals(generated_at DESC);

ALTER TABLE drop_risk_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow authenticated read drop risk"
    ON drop_risk_signals
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE TRIGGER set_drop_risk_updated_at
    BEFORE UPDATE ON drop_risk_signals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
