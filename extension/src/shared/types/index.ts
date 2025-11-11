// Shared types for the Monty extension

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  screenshot?: string; // Base64 data URL for screenshots
}

export interface CatalystEventSummary {
  type?: string;
  name: string;
  date?: string | null;
  days_until?: number | null;
  description?: string | null;
  impact?: string | null;
  confidence?: number | null;
  source?: string | null;
  tags?: string[];
  approximate?: boolean;
}

export interface CatalystTechnicalSummary {
  trend?: string | null;
  support?: number | null;
  resistance?: number | null;
  last_price?: number | null;
  support_distance_pct?: number | null;
  resistance_distance_pct?: number | null;
  moving_averages?: Record<string, number | null> | null;
  commentary?: string[];
}

export interface CatalystSummaryPayload {
  symbol?: string;
  generated_at?: string;
  events?: CatalystEventSummary[];
  technical?: CatalystTechnicalSummary | null;
  error?: string;
}

export interface RobinhoodContext {
  ticker?: string;
  currentPrice?: number;
  optionData?: {
    strike?: number;
    expiration?: string;
    type?: 'call' | 'put';
    bid?: number;
    ask?: number;
    volume?: number;
    openInterest?: number;
    delta?: number;
    theta?: number;
    gamma?: number;
    vega?: number;
    iv?: number;
  };
  pageType?: 'stock' | 'option' | 'portfolio' | 'other';
  positions?: Position[]; // Detected positions from vision
}

export interface Position {
  ticker: string;
  type: 'stock' | 'option';
  quantity: number;
  averageCost?: number;
  currentPrice?: number;
  marketValue?: number;
  profitLoss?: number;
  profitLossPercent?: number;

  // Option-specific fields
  optionType?: 'call' | 'put';
  strike?: number;
  expiration?: string;

  // Spread/multi-leg fields
  legs?: PositionLeg[];
}

export interface PositionLeg {
  ticker: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  quantity: number;
  side: 'long' | 'short';
}

export interface ChatRequest {
  message: string;
  context?: RobinhoodContext;
  screenshot?: string; // Base64 data URL
}

export interface ChatResponse {
  reply: string;
  timestamp: Date;
  positions?: Position[]; // Extracted positions from vision analysis
}
