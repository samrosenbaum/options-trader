export interface MoveAnalysisFactor {
  label: string
  detail: string
  weight: number | null
}

export interface MoveAnalysisThreshold {
  threshold: string
  baseProbability: number | null
  conviction: number | null
  summary: string
  factors: MoveAnalysisFactor[]
  historicalSupport: { horizonDays: number | null; probability: number | null } | null
}

export interface MoveAnalysis {
  expectedMovePercent: number | null
  impliedVol: number | null
  daysToExpiration: number | null
  thresholds: MoveAnalysisThreshold[]
  drivers: string[]
}

export interface SwingSignalFactor {
  name: string
  score: number
  rationale: string
  details: Record<string, unknown>
}

export interface SwingSignalNewsHeadline {
  title?: string
  summary?: string
  url?: string
  publisher?: string
  sentiment_score?: number
  sentiment_label?: string
}

export interface SwingSignalMetadata extends Record<string, unknown> {
  generated_at?: string
  lookback?: string
  interval?: string
  atr_ratio?: number
  momentum_zscore?: number
  volume_zscore?: number
  news_sample?: SwingSignalNewsHeadline[]
  market_context?: Record<string, unknown>
  summary?: string
}

export interface SwingSignalInsight {
  symbol: string
  compositeScore: number
  classification: string
  factors: SwingSignalFactor[]
  metadata: SwingSignalMetadata
}

export interface DataQualityInfo {
  quality: 'high' | 'medium' | 'low' | 'rejected'
  score: number
  issues: string[]
  warnings: string[]
  priceSource: string
  priceTimestamp: string | null
  priceAgeSeconds: number | null
}

export interface Opportunity {
  symbol: string
  optionType: string
  strike: number
  expiration: string
  premium: number
  tradeSummary?: string
  stockPrice: number
  score: number
  confidence: number
  reasoning: string[]
  patterns: string[]
  catalysts: string[]
  riskLevel: string
  potentialReturn: number
  potentialReturnAmount: number
  maxReturn: number
  maxReturnAmount: number
  maxLossPercent: number
  maxLossAmount: number
  breakeven: number
  ivRank: number
  volumeRatio: number
  probabilityOfProfit: number | null
  profitProbabilityExplanation: string
  breakevenMovePercent: number | null
  breakevenPrice: number | null
  riskRewardRatio: number | null
  shortTermRiskRewardRatio: number | null
  greeks: {
    delta: number
    gamma: number
    theta: number
    vega: number
  }
  daysToExpiration: number
  returnsAnalysis: Array<{
    move: string
    return: number
  }>
  moveAnalysis?: MoveAnalysis | null
  eventIntel?: {
    earnings_in_days?: number
    news_sentiment_label?: string
    unique_drivers?: string[]
  }
  gammaSqueezeScore?: number
  unusualFlowScore?: number
  maxPainStrike?: number
  newsImpactScore?: number
  recentNews?: Array<{
    headline: string
    summary: string
    source: string
    category: string
    sentiment: {
      score: number
      label: string
    }
    impact_score: number
  }>
  swingSignal?: SwingSignalInsight | null
  swingSignalError?: string
  _dataQuality?: DataQualityInfo
}

export interface CryptoAlert {
  symbol: string
  name: string
  current_price: number
  market_cap: number
  action: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  strategy: string
  entry_price: number
  target_price: number
  stop_loss: number
  position_size: {
    recommended_size: number
    position_amounts: Record<string, { amount: number; percentage: number }>
    risk_level: string
  }
  risk_level: string
  reasons: string[]
  urgency: number
  timestamp: string
}
