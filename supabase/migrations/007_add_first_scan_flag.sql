-- Add onboarding flag and user profile fields to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS has_completed_first_scan BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS user_name TEXT,
ADD COLUMN IF NOT EXISTS broker TEXT,
ADD COLUMN IF NOT EXISTS trading_strategy TEXT;

COMMENT ON COLUMN public.user_settings.has_completed_first_scan IS 'Marks whether the user has acknowledged the first scanner walkthrough.';
COMMENT ON COLUMN public.user_settings.user_name IS 'User display name for personalization.';
COMMENT ON COLUMN public.user_settings.broker IS 'User trading broker preference.';
COMMENT ON COLUMN public.user_settings.trading_strategy IS 'User preferred trading strategy.';
