-- Fix overly permissive RLS policy on rejected_options
-- Drop the old "Service role can manage rejected_options" policy that allows USING (true)

-- Drop the old overly permissive policy
DROP POLICY IF EXISTS "Service role can manage rejected_options" ON rejected_options;

-- Ensure the user-specific policies exist (should have been created in migration 011)
-- These are idempotent, so safe to run again

DO $$
BEGIN
  -- Drop and recreate policies to ensure they're correct
  DROP POLICY IF EXISTS "Users can view their own rejected options" ON rejected_options;
  DROP POLICY IF EXISTS "Users can insert their own rejected options" ON rejected_options;
  DROP POLICY IF EXISTS "Users can update their own rejected options" ON rejected_options;
  DROP POLICY IF EXISTS "Users can delete their own rejected options" ON rejected_options;

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
END $$;
