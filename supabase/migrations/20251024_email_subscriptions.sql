-- Email subscriptions for analyst briefs
CREATE TABLE IF NOT EXISTS email_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,

  -- Subscription preferences
  morning_brief BOOLEAN DEFAULT true,
  nightly_brief BOOLEAN DEFAULT true,
  market_open_update BOOLEAN DEFAULT false,
  weekly_analysis BOOLEAN DEFAULT true,

  -- Metadata
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE email_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only read/update their own subscription
CREATE POLICY "Users can view their own subscription"
  ON email_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscription"
  ON email_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscription"
  ON email_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_email_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_email_subscription_timestamp
  BEFORE UPDATE ON email_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_email_subscription_timestamp();

-- Index for faster lookups
CREATE INDEX idx_email_subscriptions_user_id ON email_subscriptions(user_id);
CREATE INDEX idx_email_subscriptions_morning_brief ON email_subscriptions(morning_brief) WHERE morning_brief = true;
CREATE INDEX idx_email_subscriptions_nightly_brief ON email_subscriptions(nightly_brief) WHERE nightly_brief = true;
