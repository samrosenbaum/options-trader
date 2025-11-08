-- Migration: Add bearish_signals table for enhanced signal detection
-- Created: 2025-11-07

-- Create bearish_signals table
CREATE TABLE IF NOT EXISTS public.bearish_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL,

    -- Scoring
    total_score INTEGER NOT NULL,
    max_score INTEGER NOT NULL DEFAULT 27,
    recommendation TEXT NOT NULL,

    -- Price data
    current_price DECIMAL(10, 2),
    price_change_pct DECIMAL(5, 2),

    -- Key metrics
    put_call_ratio DECIMAL(5, 2),
    put_call_zscore DECIMAL(5, 2),
    confidence INTEGER NOT NULL,  -- 0-100

    -- Alert level (for UI display)
    alert_level TEXT NOT NULL CHECK (alert_level IN ('watch', 'moderate', 'high', 'extreme')),

    -- Recommended strikes
    recommended_strikes JSONB,  -- Array of strike prices
    expected_roi TEXT,

    -- Enhanced indicators
    dark_pool_bearish BOOLEAN DEFAULT false,
    gamma_exposure DECIMAL(15, 2),
    short_interest_pct DECIMAL(5, 2),

    -- Signal details
    signals JSONB NOT NULL,  -- Array of BearishSignal objects
    drivers TEXT[] NOT NULL,  -- Human-readable driver descriptions

    -- Metadata
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    signal_details JSONB,  -- Additional context

    -- Indexes
    CONSTRAINT valid_score CHECK (total_score >= 0 AND total_score <= max_score),
    CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 100)
);

-- Create indexes for performance
CREATE INDEX idx_bearish_signals_symbol ON public.bearish_signals(symbol);
CREATE INDEX idx_bearish_signals_score ON public.bearish_signals(total_score DESC);
CREATE INDEX idx_bearish_signals_generated_at ON public.bearish_signals(generated_at DESC);
CREATE INDEX idx_bearish_signals_expires_at ON public.bearish_signals(expires_at);
CREATE INDEX idx_bearish_signals_alert_level ON public.bearish_signals(alert_level);

-- Create composite index for common queries
CREATE INDEX idx_bearish_signals_active ON public.bearish_signals(expires_at, total_score DESC)
    WHERE expires_at > NOW();

-- Enable Row Level Security
ALTER TABLE public.bearish_signals ENABLE ROW LEVEL SECURITY;

-- Create policy: Anyone can read (public data)
CREATE POLICY "Enable read access for all users" ON public.bearish_signals
    FOR SELECT
    USING (true);

-- Create policy: Only authenticated users can insert
CREATE POLICY "Enable insert for authenticated users only" ON public.bearish_signals
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Create policy: Only authenticated users can update
CREATE POLICY "Enable update for authenticated users only" ON public.bearish_signals
    FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Create policy: Only authenticated users can delete
CREATE POLICY "Enable delete for authenticated users only" ON public.bearish_signals
    FOR DELETE
    USING (auth.role() = 'authenticated');

-- Create function to auto-expire old signals
CREATE OR REPLACE FUNCTION public.cleanup_expired_bearish_signals()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete signals older than 48 hours (keep 24h expired for historical reference)
    DELETE FROM public.bearish_signals
    WHERE generated_at < NOW() - INTERVAL '48 hours';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment on table and columns
COMMENT ON TABLE public.bearish_signals IS 'Enhanced bearish signal detection with 90% confidence framework';
COMMENT ON COLUMN public.bearish_signals.total_score IS 'Bearish score (0-27 points)';
COMMENT ON COLUMN public.bearish_signals.put_call_zscore IS 'Z-score of P/C ratio vs historical baseline';
COMMENT ON COLUMN public.bearish_signals.dark_pool_bearish IS 'True if elevated dark pool selling detected';
COMMENT ON COLUMN public.bearish_signals.gamma_exposure IS 'Net gamma exposure (negative = volatility amplifier)';
COMMENT ON COLUMN public.bearish_signals.drivers IS 'Human-readable descriptions of key drivers';
COMMENT ON COLUMN public.bearish_signals.expires_at IS 'Signal expires after 24 hours (options data stale)';

-- Grant permissions
GRANT SELECT ON public.bearish_signals TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bearish_signals TO authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
