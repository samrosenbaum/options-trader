-- Migration: Cached Scan Results for Fast Serving
-- Purpose: Store pre-computed scanner results to serve instantly without backend timeout

-- Table to store complete scan results
CREATE TABLE IF NOT EXISTS cached_scan_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL DEFAULT gen_random_uuid(),
  scan_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  filter_mode TEXT NOT NULL CHECK (filter_mode IN ('strict', 'relaxed')),

  -- The actual opportunity data (JSON)
  opportunities JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Scan metadata
  total_evaluated INTEGER NOT NULL DEFAULT 0,
  symbols_scanned TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  scan_duration_seconds NUMERIC,

  -- Metadata about the analysis
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Index for fast retrieval
  CONSTRAINT unique_latest_scan UNIQUE (filter_mode, scan_timestamp)
);

-- Index for fast lookup of latest scans by filter mode
CREATE INDEX idx_cached_scans_mode_timestamp
ON cached_scan_results(filter_mode, scan_timestamp DESC);

-- Index for cleaning up old scans
CREATE INDEX idx_cached_scans_timestamp
ON cached_scan_results(scan_timestamp DESC);

-- Function to get latest scan for a given filter mode
CREATE OR REPLACE FUNCTION get_latest_scan(p_filter_mode TEXT DEFAULT 'strict')
RETURNS TABLE (
  id UUID,
  scan_id UUID,
  scan_timestamp TIMESTAMP WITH TIME ZONE,
  filter_mode TEXT,
  opportunities JSONB,
  total_evaluated INTEGER,
  symbols_scanned TEXT[],
  scan_duration_seconds NUMERIC,
  metadata JSONB,
  age_minutes NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    csr.id,
    csr.scan_id,
    csr.scan_timestamp,
    csr.filter_mode,
    csr.opportunities,
    csr.total_evaluated,
    csr.symbols_scanned,
    csr.scan_duration_seconds,
    csr.metadata,
    EXTRACT(EPOCH FROM (NOW() - csr.scan_timestamp)) / 60 AS age_minutes
  FROM cached_scan_results csr
  WHERE csr.filter_mode = p_filter_mode
  ORDER BY csr.scan_timestamp DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to cleanup old scans (keep last 100 per filter mode)
CREATE OR REPLACE FUNCTION cleanup_old_scans()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH scans_to_keep AS (
    SELECT id
    FROM cached_scan_results
    WHERE filter_mode = 'strict'
    ORDER BY scan_timestamp DESC
    LIMIT 100
  ), scans_to_delete AS (
    SELECT id
    FROM cached_scan_results
    WHERE filter_mode = 'strict'
    AND id NOT IN (SELECT id FROM scans_to_keep)
  )
  DELETE FROM cached_scan_results
  WHERE id IN (SELECT id FROM scans_to_delete);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies (optional - if you want user-specific caching)
ALTER TABLE cached_scan_results ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read cached scans
CREATE POLICY "Authenticated users can read cached scans"
  ON cached_scan_results
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only service role can insert/update cached scans
CREATE POLICY "Service role can insert cached scans"
  ON cached_scan_results
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update cached scans"
  ON cached_scan_results
  FOR UPDATE
  TO service_role
  USING (true);

-- Grant permissions
GRANT SELECT ON cached_scan_results TO authenticated;
GRANT ALL ON cached_scan_results TO service_role;

-- Comment for documentation
COMMENT ON TABLE cached_scan_results IS
'Stores pre-computed scanner results for instant serving. Background worker populates this table every 10 minutes with full analysis. User-facing API reads from this table to avoid timeout issues.';

COMMENT ON COLUMN cached_scan_results.opportunities IS
'Full array of opportunity objects with all analysis (historical patterns, backtesting, Greeks, etc.)';

COMMENT ON COLUMN cached_scan_results.metadata IS
'Additional scan metadata including enhanced statistics, filter info, and performance metrics';
