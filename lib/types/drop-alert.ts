/**
 * Drop Alert / Risk Monitoring Types
 */

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

export interface DropRiskResponse {
  success: boolean
  count: number
  generatedAt: string
  data: DropRiskSignal[]
  error?: string
  details?: string
  note?: string
}

export interface SignalComponent {
  name: string
  value: number
  percentile: number
  description: string
}

export interface CatalystEvent {
  type: 'earnings' | 'fed' | 'economic' | 'regulatory'
  date: string
  description: string
}
