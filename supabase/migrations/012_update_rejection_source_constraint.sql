-- Update rejection_source constraint to allow 'user_closed_position'

-- Drop the old constraint
ALTER TABLE rejected_options
DROP CONSTRAINT IF EXISTS rejected_options_rejection_source_check;

-- Add new constraint with all three valid values
ALTER TABLE rejected_options
ADD CONSTRAINT rejected_options_rejection_source_check
CHECK (rejection_source IN ('user_rejected', 'scanner_rejected', 'user_closed_position'));
