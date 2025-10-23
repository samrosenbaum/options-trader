-- Add user_id to rejected_options for multi-user support
-- This allows each user to track their own rejected opportunities

-- Add the user_id column
ALTER TABLE rejected_options
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill existing rows with a default user (you'll need to update this with actual user IDs)
-- For now, we'll leave them NULL and let RLS handle access
-- UPDATE rejected_options SET user_id = (SELECT id FROM auth.users LIMIT 1) WHERE user_id IS NULL;

-- Create index for faster user-specific queries
CREATE INDEX IF NOT EXISTS idx_rejected_options_user_id ON rejected_options(user_id);

-- Enable Row Level Security
ALTER TABLE rejected_options ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user isolation
CREATE POLICY "Users can view their own rejected options"
  ON rejected_options FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own rejected options"
  ON rejected_options FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rejected options"
  ON rejected_options FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own rejected options"
  ON rejected_options FOR DELETE
  USING (auth.uid() = user_id);
