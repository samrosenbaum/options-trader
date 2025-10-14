-- Add exit signal columns to positions table
ALTER TABLE positions
ADD COLUMN exit_signal TEXT DEFAULT 'hold' CHECK (exit_signal IN ('hold', 'consider', 'exit_now')),
ADD COLUMN exit_urgency_score INTEGER DEFAULT 0 CHECK (exit_urgency_score >= 0 AND exit_urgency_score <= 100),
ADD COLUMN exit_reasons JSONB DEFAULT '[]'::jsonb,
ADD COLUMN last_signal_check TIMESTAMPTZ;

-- Add index for querying positions by exit signal
CREATE INDEX idx_positions_exit_signal ON positions(exit_signal);

-- Add comment for documentation
COMMENT ON COLUMN positions.exit_signal IS 'Exit recommendation: hold (green), consider (yellow), exit_now (red)';
COMMENT ON COLUMN positions.exit_urgency_score IS 'Exit urgency score from 0-100, higher means more urgent to close';
COMMENT ON COLUMN positions.exit_reasons IS 'Array of triggered exit conditions (profit_target, stop_loss, theta_decay, probability_collapse, negative_edge)';
COMMENT ON COLUMN positions.last_signal_check IS 'Timestamp of last exit signal calculation';
