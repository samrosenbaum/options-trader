export interface OptionContract {
  id: string
  symbol: string
  strike: number
  expiration: string
  type: "call" | "put"
  action: "buy" | "sell"
  premium: number
  bid: number
  ask: number
  volume: number
  openInterest: number
  impliedVolatility: number
  delta: number
  gamma: number
  theta: number
  vega: number
  breakeven: number
  maxProfit: number
  maxLoss: number
  probability: number
  recommendation: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell"
  reasoning: string
  confidence: number
}

export interface NewsItem {
  id: string
  headline: string
  source: string
  timestamp: string
  sentiment: "bullish" | "bearish" | "neutral"
  sentimentScore: number
  symbols: string[]
  url: string
  summary: string
}

export interface MarketData {
  symbol: string
  price: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
  open: number
  previousClose: number
}

export interface TradeRecommendation {
  id: string
  option: OptionContract
  marketData: MarketData
  newsContext: NewsItem[]
  score: number
  riskLevel: "low" | "medium" | "high"
  timeframe: "short" | "medium" | "long"
  catalysts: string[]
}
