export interface MarketNewsItem {
  headline: string
  sentiment: number
}

export interface MarketContext {
  symbol: string
  price: number
  volume: number
  volatility: number
  news: MarketNewsItem[]
  technicals: {
    rsi?: number
    macd?: number
    trend: "bullish" | "bearish" | "neutral"
  }
}

export interface OptionGreeks {
  delta: number
  gamma: number
  theta: number
  vega: number
}

export interface OptionContract {
  symbol: string
  type: "call" | "put"
  strike: number
  expiration: string
  lastPrice: number
  bid: number
  ask: number
  volume: number
  openInterest: number
  impliedVolatility: number
  stockPrice: number
}

export interface ScanTarget {
  contract: OptionContract
  greeks: OptionGreeks
  market_data: Record<string, number>
  metadata: Record<string, unknown>
}

export interface ScanRequest {
  targets: ScanTarget[]
  market_context: Record<string, MarketContext>
  scoring_config: Record<string, unknown>
}

export interface ScoreBreakdown {
  scorer: string
  weight: number
  raw_score: number
  weighted_score: number
  reasons: string[]
  tags: string[]
}

export interface SignalScore {
  total_score: number
  breakdowns: ScoreBreakdown[]
  reasons: string[]
  tags: string[]
  metadata: Record<string, unknown>
}

export interface Signal {
  symbol: string
  contract: OptionContract
  greeks: OptionGreeks
  score: SignalScore
  confidence: number
  reasons: string[]
  tags: string[]
  generated_at: string
  metadata: Record<string, unknown>
}

export interface ScanError {
  symbol: string
  reason: string
}

export interface ScanResponse {
  signals: Signal[]
  errors: ScanError[]
}
