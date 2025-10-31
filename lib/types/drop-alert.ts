export type DropRiskAlertLevel = 'watch' | 'elevated' | 'high' | 'extreme'

export interface DropRiskSignal {
  id: string
  symbol: string
  score: number
  biasScore: number
  confidence: number
  stockPrice: number | null
  priceChangePct: number | null
  alertLevel: DropRiskAlertLevel
  scoreChange: number | null
  generatedAt: string
  drivers: string[]
  signalDetails: Record<string, unknown>
}
