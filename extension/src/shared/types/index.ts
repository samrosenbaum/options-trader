// Shared types for the Monty extension

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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
}

export interface ChatRequest {
  message: string;
  context?: RobinhoodContext;
}

export interface ChatResponse {
  reply: string;
  timestamp: Date;
}
