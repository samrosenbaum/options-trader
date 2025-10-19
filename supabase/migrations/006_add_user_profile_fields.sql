-- Add user profile fields to user_settings table
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS user_name TEXT,
ADD COLUMN IF NOT EXISTS broker TEXT,
ADD COLUMN IF NOT EXISTS trading_strategy TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.user_settings.user_name IS 'User display name';
COMMENT ON COLUMN public.user_settings.broker IS 'User selected brokerage (e.g., robinhood, webull, schwab, etc.)';
COMMENT ON COLUMN public.user_settings.trading_strategy IS 'User selected trading strategy (e.g., yolo, conservative, balanced, etc.)';

