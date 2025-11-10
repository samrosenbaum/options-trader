export type FundamentalsQualityLevel = 'excellent' | 'good' | 'fair' | 'poor'
export type FundamentalsRiskLevel = 'low' | 'moderate' | 'high'

export interface FundamentalsSignal {
  id: string
  symbol: string
  overallScore: number
  qualityLevel: FundamentalsQualityLevel
  recommendation: string
  buyReason: string | null
  currentPrice: number | null
  priceChangePct: number | null
  week52High: number | null
  week52Low: number | null
  percentFrom52wHigh: number | null
  percentFrom52wLow: number | null
  healthScore: number | null
  growthScore: number | null
  profitabilityScore: number | null
  leverageScore: number | null
  valuationScore: number | null
  peRatio: number | null
  forwardPe: number | null
  pegRatio: number | null
  psRatio: number | null
  pbRatio: number | null
  priceToFcf: number | null
  revenueGrowth: number | null
  earningsGrowth: number | null
  revenuePerShareGrowth: number | null
  profitMargin: number | null
  operatingMargin: number | null
  roe: number | null
  roa: number | null
  roic: number | null
  debtToEquity: number | null
  currentRatio: number | null
  quickRatio: number | null
  freeCashFlow: number | null
  operatingCashFlow: number | null
  analystRating: string | null
  analystTargetPrice: number | null
  targetUpsidePct: number | null
  numAnalysts: number | null
  recommendationMean: number | null
  nextEarningsDate: string | null
  daysToEarnings: number | null
  earningsSurprisePct: number | null
  marketCap: number | null
  sector: string | null
  industry: string | null
  avgVolume: number | null
  currentVolume: number | null
  volumeSurge: boolean
  strengths: string[]
  weaknesses: string[]
  catalysts: string[]
  riskLevel: FundamentalsRiskLevel
  riskFactors: string[]
  generatedAt: string
  expiresAt: string
}
