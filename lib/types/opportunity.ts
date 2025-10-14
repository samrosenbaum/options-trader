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

export type DirectionalBiasDirection = 'bullish' | 'bearish' | 'neutral'

export interface DirectionalSignalBreakdown {
  name: string
  direction: DirectionalBiasDirection | string
  score: number
  confidence: number
  weight?: number | null
  weighted_contribution?: number | null
  rationale?: string
}

export interface EnhancedDirectionalBias {
  direction: DirectionalBiasDirection | string
  confidence?: number
  score?: number
  recommendation?: string
  signals?: DirectionalSignalBreakdown[]
  timestamp?: string
  drivers?: string[]
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

export interface HistoricalContext {
  available: boolean
  empiricalProbability?: number
  touchProbability?: number
  finishProbability?: number
  touchConfidence?: {
    lower: number
    upper: number
  }
  finishConfidence?: {
    lower: number
    upper: number
  }
  occurrences?: number
  closeOccurrences?: number
  totalPeriods?: number
  lastOccurrence?: string
  lastCloseOccurrence?: string | null
  avgDaysToTarget?: number
  qualityScore?: number
  qualityLabel?: string
  moveRequirement?: {
    percent?: number
    amount?: number | null
    direction?: 'up' | 'down' | string
    timeframeDays?: number
  }
  historicalFrequency?: {
    occurrences?: number
    closeOccurrences?: number
    totalPeriods?: number
    touchProbability?: number
    finishProbability?: number
  }
  lastTouch?: {
    date?: string | null
    daysToTarget?: number | null
  }
  lastFinish?: {
    date?: string | null
    daysToTarget?: number | null
  }
  recentTouches?: Array<{
    date?: string | null
    daysToTarget?: number | null
  }>
  analysis?: string
  message?: string
  raw?: {
    symbol: string
    targetMovePct: number
    targetMoveAmount: number | null
    timeframeDays: number
    occurrences: number
    closeOccurrences: number
    totalPeriods: number
    empiricalProbability: number
    closeProbability: number
    touchConfidenceInterval: {
      lower: number
      upper: number
    }
    closeConfidenceInterval: {
      lower: number
      upper: number
    }
    lastOccurrence: string | null
    lastCloseOccurrence: string | null
    lastOccurrenceDaysToTarget: number | null
    lastCloseOccurrenceDaysToTarget: number | null
    avgDaysToTarget: number | null
    dataStartDate: string
    dataEndDate: string
    qualityScore: number
    qualityLabel: string
    recentOccurrences: Array<{
      date: string | null
      daysToTarget: number | null
    }>
  }
}

export type BacktestOutcome = 'win' | 'loss'

export interface BacktestValidationExample {
  date: string
  returnPct: number
  daysHeld: number
  outcome: BacktestOutcome | string
}

export interface BacktestValidation {
  patternType: string
  similarTradesFound: number
  lookbackDays: number
  winningTrades: number
  losingTrades: number
  winRate: number
  avgReturnPct: number
  medianReturnPct: number
  bestReturnPct: number
  worstReturnPct: number
  totalReturnPct: number
  sharpeRatio: number | null
  maxDrawdownPct: number
  avgDaysHeld: number
  sampleSizeQuality: 'low' | 'medium' | 'high'
  confidenceLevel: number
  patternDescription: string
  recentExamples: BacktestValidationExample[]
}

export interface PositionSizingExample {
  portfolio: number
  contracts: number
  capitalAtRisk: number
  allocationPercent: number
}

export interface PositionSizingRecommendation {
  recommendedFraction: number
  conservativeFraction: number
  aggressiveFraction: number
  kellyFraction: number
  expectedLogGrowth?: number
  expectedEdge?: number
  riskBudgetTier: 'conservative' | 'balanced' | 'aggressive' | 'capital_preservation'
  rationale: string[]
  inputs?: {
    winProbability?: number
    lossProbability?: number
    payoffRatio?: number
    volatility?: number
    scoreFactor?: number
    probabilityFactor?: number
    volatilityFactor?: number
    rewardFactor?: number
    riskLevel?: string
    costBasis?: number
    expectedRoi?: number
  }
  limits?: {
    maxPerTrade: number
    maxDrawdown95?: number
    losingStreak95?: number
  }
  capitalAllocationExamples?: PositionSizingExample[]
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
  directionalBias?: EnhancedDirectionalBias | null
  enhancedDirectionalBias?: EnhancedDirectionalBias | null
  historicalContext?: HistoricalContext
  backtestValidation?: BacktestValidation | null
  positionSizing?: PositionSizingRecommendation
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
  allocation: {
    action: 'INCREASE_POSITION' | 'DECREASE_POSITION' | 'MOVE_TO_USDC' | 'MAINTAIN_POSITION'
    suggested_change_percent: number
    target_allocation_percent: number
    current_allocation_percent: number
    usdc_reallocation_percent: number
    rationale: string[]
  }
}
