-- Create positions table
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core position info
  symbol TEXT NOT NULL,
  strike NUMERIC NOT NULL,
  expiration DATE NOT NULL,
  option_type TEXT NOT NULL CHECK (option_type IN ('call', 'put')),
  contracts INTEGER NOT NULL,

  -- Entry data
  entry_price NUMERIC NOT NULL,
  entry_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  entry_stock_price NUMERIC NOT NULL,
  entry_iv NUMERIC,
  entry_delta NUMERIC,
  entry_theta NUMERIC,
  entry_vega NUMERIC,
  entry_gamma NUMERIC,

  -- Current data
  current_price NUMERIC,
  current_stock_price NUMERIC,
  current_delta NUMERIC,
  current_theta NUMERIC,

  -- P&L tracking
  unrealized_pl NUMERIC,
  unrealized_pl_percent NUMERIC,
  realized_pl NUMERIC,
  realized_pl_percent NUMERIC,

  -- Position status
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  exit_date TIMESTAMP WITH TIME ZONE,
  exit_price NUMERIC,

  -- Metadata
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id UUID REFERENCES positions(id) ON DELETE CASCADE,

  alert_type TEXT NOT NULL CHECK (alert_type IN ('profit_target', 'stop_loss', 'theta_warning', 'exit_recommended')),
  threshold_value NUMERIC,

  triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_positions_user_id ON positions(user_id);
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_positions_symbol ON positions(symbol);
CREATE INDEX idx_positions_expiration ON positions(expiration);
CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_position_id ON alerts(position_id);
CREATE INDEX idx_alerts_triggered ON alerts(triggered);

-- Enable Row Level Security
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for positions
CREATE POLICY "Users can view their own positions"
  ON positions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own positions"
  ON positions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own positions"
  ON positions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own positions"
  ON positions FOR DELETE
  USING (auth.uid() = user_id);

-- Create RLS policies for alerts
CREATE POLICY "Users can view their own alerts"
  ON alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own alerts"
  ON alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
  ON alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alerts"
  ON alerts FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at on positions
CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
