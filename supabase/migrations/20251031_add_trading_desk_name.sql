-- Add trading desk name field to user_settings table
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS trading_desk_name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.user_settings.trading_desk_name IS 'Custom name for user trading desk (e.g., "Samski Tendies Capital")';
