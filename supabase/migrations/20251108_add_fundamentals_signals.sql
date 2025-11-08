-- Migration: Add fundamentals_signals table for stock buy signal detection
-- Created: 2025-11-08

-- Create fundamentals_signals table
CREATE TABLE IF NOT EXISTS public.fundamentals_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL,

    -- Overall scoring
    overall_score INTEGER NOT NULL,  -- 0-100
    quality_level TEXT NOT NULL CHECK (quality_level IN ('excellent', 'good', 'fair', 'poor')),
    recommendation TEXT NOT NULL,
    buy_reason TEXT,  -- Main reason this is a buy opportunity

    -- Price data
    current_price DECIMAL(10, 2),
    price_change_pct DECIMAL(5, 2),
    week_52_high DECIMAL(10, 2),
    week_52_low DECIMAL(10, 2),
    percent_from_52w_high DECIMAL(5, 2),
    percent_from_52w_low DECIMAL(5, 2),

    -- Component scores (0.0 to 1.0)
    health_score DECIMAL(3, 2),           -- From fundamental_health.py
    growth_score DECIMAL(3, 2),
    profitability_score DECIMAL(3, 2),
    leverage_score DECIMAL(3, 2),
    valuation_score DECIMAL(3, 2),

    -- Valuation ratios
    pe_ratio DECIMAL(8, 2),
    forward_pe DECIMAL(8, 2),
    peg_ratio DECIMAL(5, 2),
    ps_ratio DECIMAL(8, 2),
    pb_ratio DECIMAL(8, 2),
    price_to_fcf DECIMAL(8, 2),

    -- Growth metrics
    revenue_growth DECIMAL(6, 2),         -- Percentage
    earnings_growth DECIMAL(6, 2),        -- Percentage
    revenue_per_share_growth DECIMAL(6, 2),

    -- Profitability metrics
    profit_margin DECIMAL(5, 2),          -- Percentage
    operating_margin DECIMAL(5, 2),       -- Percentage
    roe DECIMAL(5, 2),                    -- Return on Equity
    roa DECIMAL(5, 2),                    -- Return on Assets
    roic DECIMAL(5, 2),                   -- Return on Invested Capital

    -- Financial health
    debt_to_equity DECIMAL(6, 2),
    current_ratio DECIMAL(5, 2),
    quick_ratio DECIMAL(5, 2),
    free_cash_flow DECIMAL(15, 2),
    operating_cash_flow DECIMAL(15, 2),

    -- Analyst data
    analyst_rating TEXT,                  -- 'buy', 'hold', 'sell'
    analyst_target_price DECIMAL(10, 2),
    target_upside_pct DECIMAL(5, 2),
    num_analysts INTEGER,
    recommendation_mean DECIMAL(3, 2),    -- 1.0=Strong Buy, 5.0=Strong Sell

    -- Earnings catalyst
    next_earnings_date DATE,
    days_to_earnings INTEGER,
    earnings_surprise_pct DECIMAL(5, 2), -- Last quarter earnings surprise

    -- Market cap and sector
    market_cap DECIMAL(15, 2),
    sector TEXT,
    industry TEXT,

    -- Volume metrics
    avg_volume BIGINT,
    current_volume BIGINT,
    volume_surge BOOLEAN DEFAULT false,

    -- Signal breakdown
    strengths TEXT[] NOT NULL,            -- Array of strength descriptions
    weaknesses TEXT[] NOT NULL,           -- Array of weakness descriptions
    catalysts TEXT[],                     -- Upcoming catalysts

    -- Risk assessment
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'moderate', 'high')),
    risk_factors TEXT[],                  -- Specific risk factors

    -- Metadata
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    signal_details JSONB,                 -- Additional context

    -- Constraints
    CONSTRAINT valid_overall_score CHECK (overall_score >= 0 AND overall_score <= 100),
    CONSTRAINT valid_component_scores CHECK (
        health_score >= 0 AND health_score <= 1 AND
        growth_score >= 0 AND growth_score <= 1 AND
        profitability_score >= 0 AND profitability_score <= 1 AND
        leverage_score >= 0 AND leverage_score <= 1 AND
        valuation_score >= 0 AND valuation_score <= 1
    )
);

-- Create indexes for performance
CREATE INDEX idx_fundamentals_signals_symbol ON public.fundamentals_signals(symbol);
CREATE INDEX idx_fundamentals_signals_score ON public.fundamentals_signals(overall_score DESC);
CREATE INDEX idx_fundamentals_signals_quality ON public.fundamentals_signals(quality_level);
CREATE INDEX idx_fundamentals_signals_generated_at ON public.fundamentals_signals(generated_at DESC);
CREATE INDEX idx_fundamentals_signals_expires_at ON public.fundamentals_signals(expires_at);
CREATE INDEX idx_fundamentals_signals_sector ON public.fundamentals_signals(sector);

-- Create composite index for common queries
CREATE INDEX idx_fundamentals_signals_active ON public.fundamentals_signals(expires_at, overall_score DESC)
    WHERE expires_at > NOW();

-- Create index for quality filtering
CREATE INDEX idx_fundamentals_signals_quality_score ON public.fundamentals_signals(quality_level, overall_score DESC)
    WHERE expires_at > NOW();

-- Enable Row Level Security
ALTER TABLE public.fundamentals_signals ENABLE ROW LEVEL SECURITY;

-- Create policy: Anyone can read (public data)
CREATE POLICY "Enable read access for all users" ON public.fundamentals_signals
    FOR SELECT
    USING (true);

-- Create policy: Only authenticated users can insert
CREATE POLICY "Enable insert for authenticated users only" ON public.fundamentals_signals
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Create policy: Only authenticated users can update
CREATE POLICY "Enable update for authenticated users only" ON public.fundamentals_signals
    FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Create policy: Only authenticated users can delete
CREATE POLICY "Enable delete for authenticated users only" ON public.fundamentals_signals
    FOR DELETE
    USING (auth.role() = 'authenticated');

-- Create function to auto-expire old signals
CREATE OR REPLACE FUNCTION public.cleanup_expired_fundamentals_signals()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete signals older than 14 days (keep 7 days expired for historical reference)
    DELETE FROM public.fundamentals_signals
    WHERE generated_at < NOW() - INTERVAL '14 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment on table and columns
COMMENT ON TABLE public.fundamentals_signals IS 'Stock fundamental analysis with buy signals based on quality, growth, and value metrics';
COMMENT ON COLUMN public.fundamentals_signals.overall_score IS 'Overall quality score (0-100)';
COMMENT ON COLUMN public.fundamentals_signals.quality_level IS 'Quality tier: excellent (80+), good (60-79), fair (40-59), poor (<40)';
COMMENT ON COLUMN public.fundamentals_signals.health_score IS 'Financial health score from fundamental_health.py (0.0-1.0)';
COMMENT ON COLUMN public.fundamentals_signals.strengths IS 'Array of key strengths for this buy signal';
COMMENT ON COLUMN public.fundamentals_signals.catalysts IS 'Upcoming catalysts (earnings, product launches, etc.)';
COMMENT ON COLUMN public.fundamentals_signals.expires_at IS 'Signal expires after 7 days (fundamentals data becomes stale)';
COMMENT ON COLUMN public.fundamentals_signals.target_upside_pct IS 'Percentage upside to analyst target price';

-- Grant permissions
GRANT SELECT ON public.fundamentals_signals TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fundamentals_signals TO authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
