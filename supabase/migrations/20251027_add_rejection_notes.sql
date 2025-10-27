-- Add user_notes field to rejected_options for manual rejection notes
ALTER TABLE rejected_options
ADD COLUMN IF NOT EXISTS user_notes TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN rejected_options.user_notes IS 'User-provided notes explaining why they rejected this opportunity';
