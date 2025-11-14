-- Add show_next_steps_guide flag to user_settings for onboarding helper persistence
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS show_next_steps_guide BOOLEAN;

COMMENT ON COLUMN public.user_settings.show_next_steps_guide IS
  'Whether the dashboard should display the post-onboarding next steps helper.';
