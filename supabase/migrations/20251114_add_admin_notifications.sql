-- Migration: Admin Notifications System
-- Purpose: Track user signups and product usage for admin notifications

-- Table to track user signup events
CREATE TABLE IF NOT EXISTS user_signup_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  signup_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table to track product usage events
CREATE TABLE IF NOT EXISTS user_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'login',
    'scan_run',
    'position_created',
    'position_closed',
    'watchlist_add',
    'settings_updated'
  )),
  event_data JSONB DEFAULT '{}'::jsonb,
  event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_signup_events_timestamp ON user_signup_events(signup_timestamp DESC);
CREATE INDEX idx_signup_events_notification_sent ON user_signup_events(notification_sent);
CREATE INDEX idx_activity_log_user_id ON user_activity_log(user_id);
CREATE INDEX idx_activity_log_event_type ON user_activity_log(event_type);
CREATE INDEX idx_activity_log_timestamp ON user_activity_log(event_timestamp DESC);

-- Enable RLS
ALTER TABLE user_signup_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only service role can access these admin tables
CREATE POLICY "Service role can manage signup events"
  ON user_signup_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage activity log"
  ON user_activity_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON user_signup_events TO service_role;
GRANT ALL ON user_activity_log TO service_role;

-- Function to log user activity
CREATE OR REPLACE FUNCTION log_user_activity(
  p_user_id UUID,
  p_event_type TEXT,
  p_event_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO user_activity_log (user_id, event_type, event_data)
  VALUES (p_user_id, p_event_type, p_event_data)
  RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get daily usage summary
CREATE OR REPLACE FUNCTION get_daily_usage_summary(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  metric_name TEXT,
  metric_value BIGINT,
  details JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH date_range AS (
    SELECT
      p_date::timestamp AT TIME ZONE 'UTC' AS start_time,
      (p_date::timestamp AT TIME ZONE 'UTC' + INTERVAL '1 day') AS end_time
  ),
  new_signups AS (
    SELECT
      'new_signups' AS metric_name,
      COUNT(*)::BIGINT AS metric_value,
      jsonb_build_object(
        'emails', jsonb_agg(email ORDER BY signup_timestamp)
      ) AS details
    FROM user_signup_events, date_range
    WHERE signup_timestamp >= date_range.start_time
      AND signup_timestamp < date_range.end_time
  ),
  active_users AS (
    SELECT
      'active_users' AS metric_name,
      COUNT(DISTINCT user_id)::BIGINT AS metric_value,
      '{}'::jsonb AS details
    FROM user_activity_log, date_range
    WHERE event_timestamp >= date_range.start_time
      AND event_timestamp < date_range.end_time
  ),
  scans_run AS (
    SELECT
      'scans_run' AS metric_name,
      COUNT(*)::BIGINT AS metric_value,
      jsonb_build_object(
        'unique_users', COUNT(DISTINCT user_id)
      ) AS details
    FROM user_activity_log, date_range
    WHERE event_type = 'scan_run'
      AND event_timestamp >= date_range.start_time
      AND event_timestamp < date_range.end_time
  ),
  positions_created AS (
    SELECT
      'positions_created' AS metric_name,
      COUNT(*)::BIGINT AS metric_value,
      jsonb_build_object(
        'unique_users', COUNT(DISTINCT user_id)
      ) AS details
    FROM user_activity_log, date_range
    WHERE event_type = 'position_created'
      AND event_timestamp >= date_range.start_time
      AND event_timestamp < date_range.end_time
  ),
  positions_closed AS (
    SELECT
      'positions_closed' AS metric_name,
      COUNT(*)::BIGINT AS metric_value,
      '{}'::jsonb AS details
    FROM user_activity_log, date_range
    WHERE event_type = 'position_closed'
      AND event_timestamp >= date_range.start_time
      AND event_timestamp < date_range.end_time
  ),
  total_users AS (
    SELECT
      'total_users' AS metric_name,
      COUNT(*)::BIGINT AS metric_value,
      '{}'::jsonb AS details
    FROM auth.users
    WHERE deleted_at IS NULL
  ),
  total_positions AS (
    SELECT
      'total_positions_open' AS metric_name,
      COUNT(*)::BIGINT AS metric_value,
      '{}'::jsonb AS details
    FROM positions
    WHERE status = 'open'
  )

  SELECT * FROM new_signups
  UNION ALL
  SELECT * FROM active_users
  UNION ALL
  SELECT * FROM scans_run
  UNION ALL
  SELECT * FROM positions_created
  UNION ALL
  SELECT * FROM positions_closed
  UNION ALL
  SELECT * FROM total_users
  UNION ALL
  SELECT * FROM total_positions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE user_signup_events IS
'Tracks all user signups for immediate email notifications to admin';

COMMENT ON TABLE user_activity_log IS
'Logs all significant user actions for daily usage summary and analytics';

COMMENT ON FUNCTION log_user_activity IS
'Helper function to log user activity events. Call from API endpoints.';

COMMENT ON FUNCTION get_daily_usage_summary IS
'Generates daily usage metrics for admin email summary';
