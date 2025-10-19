-- Migration: Scanner Preferences persistence
CREATE TABLE IF NOT EXISTS scanner_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile TEXT NOT NULL,
  user_id UUID NULL,
  label TEXT,
  source TEXT NOT NULL DEFAULT 'house',
  preference_hash TEXT NOT NULL,
  volume_min INTEGER NOT NULL,
  volume_max INTEGER,
  min_open_interest INTEGER NOT NULL,
  volume_ratio_min NUMERIC,
  delta_min NUMERIC NOT NULL,
  delta_max NUMERIC NOT NULL,
  vega_min NUMERIC NOT NULL,
  vega_max NUMERIC NOT NULL,
  iv_rank_min NUMERIC NOT NULL,
  iv_rank_max NUMERIC NOT NULL,
  dte_min INTEGER NOT NULL,
  dte_max INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scanner_preferences_profile_user UNIQUE (profile, user_id)
);

CREATE INDEX IF NOT EXISTS idx_scanner_preferences_hash
  ON scanner_preferences(preference_hash);

CREATE INDEX IF NOT EXISTS idx_scanner_preferences_profile
  ON scanner_preferences(profile);

CREATE OR REPLACE FUNCTION update_scanner_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scanner_preferences_timestamp ON scanner_preferences;
CREATE TRIGGER trg_scanner_preferences_timestamp
  BEFORE UPDATE ON scanner_preferences
  FOR EACH ROW
  EXECUTE PROCEDURE update_scanner_preferences_timestamp();

ALTER TABLE scanner_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read house or own preferences"
  ON scanner_preferences
  FOR SELECT
  TO authenticated
  USING (
    user_id IS NULL
    OR user_id = auth.uid()
  );

CREATE POLICY "Service role manages scanner preferences"
  ON scanner_preferences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON scanner_preferences TO authenticated;
GRANT ALL ON scanner_preferences TO service_role;

COMMENT ON TABLE scanner_preferences IS 'Stores scanner preference presets for house defaults and user overrides.';
COMMENT ON COLUMN scanner_preferences.preference_hash IS 'Deterministic signature of the preference payload for cache differentiation.';
COMMENT ON COLUMN scanner_preferences.metadata IS 'Arbitrary metadata about how the preference was derived or merged.';
