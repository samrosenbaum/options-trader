'use client'

import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import RealTimeProgress from '../components/real-time-progress'
import { MontyLoading } from '../components/monty-loading'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'
import type { PositionSizingRecommendation } from '@/lib/types/opportunity'

interface MoveAnalysisFactor {
  label: string
  detail: string
  weight: number | null
}

interface MoveAnalysisThreshold {
  threshold: string
  baseProbability: number | null
  conviction: number | null
  summary: string
  factors: MoveAnalysisFactor[]
  historicalSupport: { horizonDays: number | null; probability: number | null } | null
}

interface MoveAnalysis {
  expectedMovePercent: number | null
  impliedVol: number | null
  daysToExpiration: number | null
  thresholds: MoveAnalysisThreshold[]
  drivers: string[]
}

interface EnhancedDirectionalBias {
  direction: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  score: number
  recommendation: string
  signals: Array<{
    name: string
    weight: number
    direction: 'bullish' | 'bearish' | 'neutral'
    score: number
    confidence: number
    weighted_contribution: number
    rationale: string
  }>
  timestamp: string
}

interface SwingSignalFactor {
  name: string
  score: number
  rationale: string
  details: Record<string, unknown>
}

interface SwingSignalNewsHeadline {
  title?: string
  summary?: string
  url?: string
  publisher?: string
  sentiment_score?: number
  sentiment_label?: string
}

interface SwingSignalMetadata extends Record<string, unknown> {
  generated_at?: string
  lookback?: string
  interval?: string
  atr_ratio?: number
  summary?: string
  momentum_zscore?: number
  volume_zscore?: number
  news_sample?: SwingSignalNewsHeadline[]
  market_context?: Record<string, unknown>
}

interface SwingSignalInsight {
  symbol: string
  compositeScore: number
  classification: string
  factors: SwingSignalFactor[]
  metadata: SwingSignalMetadata
}

type OpportunitySortOption =
  | 'promising'
  | 'riskReward'
  | 'probability'
  | 'maxReturn'
  | 'safety'
  | 'expiration'

const formatFractionAsPercent = (value: number | null | undefined, digits = 1) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }

  return `${(value * 100).toFixed(digits)}%`
}

const formatDebugKey = (key: string) => {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!spaced) {
    return key
  }

  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const normalizeDebugValue = (value: unknown): string => {
  if (value === undefined) {
    return '—'
  }

  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    console.error('Failed to normalize debug value', error)
    return String(value)
  }
}

const describeFilterMode = (mode: unknown) => {
  if (typeof mode !== 'string') {
    return null
  }

  const normalized = mode.toLowerCase()
  if (normalized === 'relaxed') {
    return 'Relaxed (broader criteria)'
  }

  if (normalized === 'strict') {
    return 'Strict (institutional-grade criteria)'
  }

  return mode
}

const extractNumber = (record: Record<string, unknown> | null | undefined, key: string) => {
  if (!record) {
    return null
  }

  const value = record[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return null
}

const extractStringArray = (record: Record<string, unknown> | null | undefined, key: string) => {
  if (!record) {
    return [] as string[]
  }

  const value = record[key]
  if (!Array.isArray(value)) {
    return [] as string[]
  }

  return value
    .map((item) => (typeof item === 'string' ? item : null))
    .filter((item): item is string => Boolean(item))
}

const getRiskBudgetMeta = (tier?: PositionSizingRecommendation['riskBudgetTier'] | string | null) => {
  switch (tier) {
    case 'aggressive':
      return {
        label: 'Aggressive Risk Budget',
        className:
          'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/40',
      }
    case 'balanced':
      return {
        label: 'Balanced Risk Budget',
        className:
          'bg-sky-100 text-sky-700 border border-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:border-sky-500/40',
      }
    case 'conservative':
      return {
        label: 'Conservative Risk Budget',
        className:
          'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/40',
      }
    case 'capital_preservation':
      return {
        label: 'Capital Preservation',
        className:
          'bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800/50 dark:text-slate-200 dark:border-slate-700/50',
      }
    default:
      return {
        label: 'Risk Budget',
        className:
          'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/40 dark:text-slate-200 dark:border-slate-600/50',
      }
  }
}

interface Opportunity {
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
  positionSizing?: PositionSizingRecommendation | null
}

type FilterMode = 'strict' | 'relaxed'

interface RelaxedScanStageMetadata {
  candidates?: number
  reason?: string
  blocked?: string
}

interface RelaxedScanMetadata {
  strictMode?: boolean
  mode?: FilterMode
  available?: boolean
  candidateCount?: number
  applied?: boolean
  appliedStage?: string
  blockedReason?: string
  stages?: Record<string, RelaxedScanStageMetadata>
  selectedCount?: number
}

interface ScanMetadata {
  fallback?: boolean
  fallbackReason?: string
  fallbackDetails?: string
  cacheStale?: boolean
  cacheAgeMinutes?: number
  cacheHit?: boolean
  cacheTimestamp?: string
  dataFreshness?: Record<string, unknown>
  source?: string
  debugInfo?: Record<string, unknown>
  filterMode?: FilterMode
  relaxedScan?: RelaxedScanMetadata | null
  [key: string]: unknown
}

interface ScanApiResponse {
  success: boolean
  timestamp?: string
  opportunities?: Opportunity[]
  metadata?: ScanMetadata | (ScanMetadata & Record<string, unknown>)
  totalEvaluated?: number
  total_evaluated?: number
  error?: string
  details?: string
}

type UserSettingsRow = Database['public']['Tables']['user_settings']['Row']

interface ScannerPageProps {
  user: {
    id: string
    email?: string | null
  }
}

const DEFAULT_FETCH_TIMEOUT_MS = 120_000  // 2 minutes for cloud deployments
const ENHANCED_FETCH_TIMEOUT_MS = 150_000  // 2.5 minutes for enhanced scanner

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', 'TimeoutError'))
  }, timeoutMs)

  const { signal: externalSignal, ...rest } = init ?? {}

  if (externalSignal instanceof AbortSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      const abortListener = () => controller.abort()
      externalSignal.addEventListener('abort', abortListener, { once: true })
      controller.signal.addEventListener('abort', () => {
        externalSignal.removeEventListener('abort', abortListener)
      })
    }
  }

  try {
    return await fetch(input, { ...rest, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted && error === controller.signal.reason) {
      const timeoutError =
        error instanceof DOMException && error.name === 'TimeoutError'
          ? error
          : new DOMException('Request timed out', 'TimeoutError')
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

interface CryptoAlert {
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
  directional_bias?: EnhancedDirectionalBias | null
  allocation: {
    action: 'INCREASE_POSITION' | 'DECREASE_POSITION' | 'MOVE_TO_USDC' | 'MAINTAIN_POSITION'
    suggested_change_percent: number
    target_allocation_percent: number
    current_allocation_percent: number
    usdc_reallocation_percent: number
    rationale: string[]
  }
}

type InvestmentScenario = {
  contractCost: number
  contractsToBuy: number
  totalCost: number
  remainingCapital: number
  requiredCapital: number
  shortfall: number
  displayCost: number
  basis: 'position' | 'perContract'
  potentialReturnAmount: number
  potentialReturnAmountPerContract: number
  maxReturnAmount: number
  maxReturnAmountPerContract: number
  maxLossAmount: number
  maxLossAmountPerContract: number
  scenarios: Array<{
    move: string
    return: number
    profit: number
    totalValue: number
  }>
}

function ProfitLossSlider({
  opportunity,
  contractsToTrade = 1
}: {
  opportunity: Opportunity
  contractsToTrade?: number
}) {
  const [stockPricePercent, setStockPricePercent] = useState(0)

  // Safely extract values with fallbacks
  const stockPrice = typeof opportunity.stockPrice === 'number' && opportunity.stockPrice > 0 ? opportunity.stockPrice : 0
  const strike = typeof opportunity.strike === 'number' && opportunity.strike > 0 ? opportunity.strike : 0
  const premiumPerContract =
    typeof opportunity.premium === 'number' && opportunity.premium > 0 ? opportunity.premium : 0
  const premiumPerShare = premiumPerContract / 100
  const optionType = opportunity.optionType
  const breakevenPrice = opportunity.breakevenPrice || (
    optionType === 'call' ? strike + premiumPerShare : strike - premiumPerShare
  )

  // Calculate the range for the slider (±50% or ±2x expected move, whichever is larger)
  const expectedMove = opportunity.moveAnalysis?.expectedMovePercent || 20
  const maxRange = Math.max(50, expectedMove * 2)

  // Calculate target stock price based on slider percentage
  const targetStockPrice = stockPrice * (1 + stockPricePercent / 100)
  const dollarMove = targetStockPrice - stockPrice

  // Calculate option value at target price
  let optionValue = 0
  if (optionType === 'call') {
    optionValue = Math.max(0, targetStockPrice - strike)
  } else {
    optionValue = Math.max(0, strike - targetStockPrice)
  }

  // Calculate P/L with safety checks
  const costBasis = premiumPerContract * contractsToTrade
  const currentValue = optionValue * 100 * contractsToTrade
  const profitLoss = currentValue - costBasis
  const profitLossPercent = costBasis > 0 ? (profitLoss / costBasis) * 100 : 0

  // Determine color based on profit/loss
  const getColor = () => {
    if (profitLoss > 0) return 'text-emerald-600'
    if (profitLoss < 0) return 'text-red-600'
    return 'text-slate-600'
  }

  const getBgColor = () => {
    if (profitLoss > 0) return 'bg-emerald-100 dark:bg-emerald-900/30'
    if (profitLoss < 0) return 'bg-red-100 dark:bg-red-900/30'
    return 'bg-slate-100 dark:bg-slate-800'
  }

  // Calculate breakeven percentage with safety check
  const breakevenPercent = stockPrice > 0 ? ((breakevenPrice - stockPrice) / stockPrice) * 100 : 0

  return (
    <div className="bg-white dark:bg-slate-700 rounded-xl p-5 mb-4 border-2 border-slate-200 dark:border-slate-600">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h5 className="font-semibold text-slate-900 dark:text-white">Interactive Profit/Loss Explorer</h5>
          <button
            onClick={() => setStockPricePercent(0)}
            className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-500"
          >
            Reset
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Move the slider to explore how stock price changes affect your profit/loss
        </p>
      </div>

      {/* Slider */}
      <div className="relative mb-6">
        <input
          type="range"
          min={-maxRange}
          max={maxRange}
          step={0.5}
          value={stockPricePercent}
          onChange={(e) => setStockPricePercent(parseFloat(e.target.value))}
          className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer slider"
          style={{
            background: `linear-gradient(to right,
              #ef4444 0%,
              #f59e0b ${((breakevenPercent + maxRange) / (maxRange * 2)) * 100}%,
              #10b981 ${((breakevenPercent + maxRange) / (maxRange * 2)) * 100}%,
              #10b981 100%)`
          }}
        />

        {/* Breakeven marker */}
        <div
          className="absolute top-0 w-0.5 h-2 bg-slate-900 dark:bg-white"
          style={{
            left: `${((breakevenPercent + maxRange) / (maxRange * 2)) * 100}%`,
            transform: 'translateX(-50%)'
          }}
        />
        <div
          className="absolute -bottom-5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap"
          style={{
            left: `${((breakevenPercent + maxRange) / (maxRange * 2)) * 100}%`,
            transform: 'translateX(-50%)'
          }}
        >
          BE
        </div>
      </div>

      {/* Results */}
      <div className={`${getBgColor()} rounded-lg p-4 space-y-3`}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Stock Price Move</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              {stockPricePercent >= 0 ? '+' : ''}{stockPricePercent.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              ${stockPrice.toFixed(2)} → ${targetStockPrice.toFixed(2)} ({dollarMove >= 0 ? '+' : ''}${dollarMove.toFixed(2)})
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Profit/Loss</div>
            <div className={`text-lg font-bold ${getColor()}`}>
              {profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(2)}
            </div>
            <div className={`text-xs ${getColor()}`}>
              {profitLossPercent >= 0 ? '+' : ''}{profitLossPercent.toFixed(1)}% return
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-300 dark:border-slate-600">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400">Option Value</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              ${optionValue.toFixed(2)}/share (${currentValue.toFixed(2)} total)
            </span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-slate-600 dark:text-slate-400">Cost Basis</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              ${costBasis.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper function to render opportunity cards - extracted to avoid JSX bracket complexity
const renderOpportunityCard = (
  opp: Opportunity,
  investmentAmount: number,
  calculateInvestmentScenario: (opp: Opportunity, amount: number) => InvestmentScenario,
  formatCurrency: (amount: number) => string,
  safeToFixed: (value: number | null | undefined, decimals?: number) => string | null,
  extras: {
    isExpanded: boolean
    onToggle: () => void
    riskBadgeClass: string | null
    scoreBadgeClass: string
    breakevenRequirement: string | null
    riskRewardExplanation: string | null
    greeksExplanation: string[]
    moveThesis: ReactNode
  }
) => {
  const scenario = calculateInvestmentScenario(opp, investmentAmount)
  const isPerContractView = scenario.basis === 'perContract'
  const potentialReturnDisplay = isPerContractView
    ? scenario.potentialReturnAmountPerContract
    : scenario.potentialReturnAmount
  const maxReturnDisplay = isPerContractView
    ? scenario.maxReturnAmountPerContract
    : scenario.maxReturnAmount
  const maxLossDisplay = isPerContractView
    ? scenario.maxLossAmountPerContract
    : scenario.maxLossAmount
  const maxLossPercentDisplay = Math.abs(opp.maxLossPercent ?? 0)

  const positionSizing = opp.positionSizing ?? null
  const hasPositionSizing = Boolean(positionSizing)
  const riskBudgetMeta = getRiskBudgetMeta(positionSizing?.riskBudgetTier)
  const recommendedFractionDisplay = formatFractionAsPercent(positionSizing?.recommendedFraction ?? null)
  const conservativeFractionDisplay = formatFractionAsPercent(positionSizing?.conservativeFraction ?? null)
  const aggressiveFractionDisplay = formatFractionAsPercent(positionSizing?.aggressiveFraction ?? null)
  const kellyFractionDisplay = formatFractionAsPercent(positionSizing?.kellyFraction ?? null)
  const expectedLogGrowthDisplay = formatFractionAsPercent(positionSizing?.expectedLogGrowth ?? null, 2)
  const expectedEdgeDisplay = formatFractionAsPercent(positionSizing?.expectedEdge ?? null, 1)
  const maxPerTradeDisplay = formatFractionAsPercent(positionSizing?.limits?.maxPerTrade ?? null)
  const maxDrawdownDisplay = formatFractionAsPercent(positionSizing?.limits?.maxDrawdown95 ?? null, 1)
  const recommendedFractionLabel = recommendedFractionDisplay !== '—' ? recommendedFractionDisplay : null
  const maxPerTradeLabel = maxPerTradeDisplay !== '—' ? maxPerTradeDisplay : null
  const losingStreak95 = positionSizing?.limits?.losingStreak95 ?? null
  const capitalExamples = positionSizing?.capitalAllocationExamples ?? []
  const sizingRationales = positionSizing?.rationale ?? []

  const {
    isExpanded,
    onToggle,
    riskBadgeClass,
    scoreBadgeClass,
    riskRewardExplanation,
    greeksExplanation,
    moveThesis,
  } = extras

  const normalizedRiskLabel = opp.riskLevel
    ? opp.riskLevel.charAt(0).toUpperCase() + opp.riskLevel.slice(1)
    : null

  return (
    <div
      key={`${opp.symbol}-${opp.strike}-${opp.expiration}-${opp.optionType}`}
      className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 hover:shadow-lg transition-all"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{opp.symbol}</div>
            <div className="px-3 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-lg text-sm font-bold">
              {opp.optionType.toUpperCase()}
            </div>
            <div className="px-3 py-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-lg text-sm font-medium">
              ${opp.strike}
            </div>
            {(opp.enhancedDirectionalBias || opp.directionalBias) && (() => {
              const bias = opp.enhancedDirectionalBias || opp.directionalBias
              const direction = bias?.direction || 'neutral'
              const confidence = bias?.confidence || 0
              const directionColors = {
                bullish: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
                bearish: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
                neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }
              const colorClass = directionColors[direction as keyof typeof directionColors] || directionColors.neutral
              return (
                <div className={`px-3 py-1 rounded-lg text-sm font-bold border ${colorClass}`}>
                  {direction.toUpperCase()} {confidence > 0 && `(${confidence.toFixed(0)}%)`}
                </div>
              )
            })()}
            {normalizedRiskLabel && riskBadgeClass && (
              <span className={`px-3 py-1 rounded-lg text-xs font-semibold border ${riskBadgeClass}`}>
                {normalizedRiskLabel}
              </span>
            )}
            {typeof opp.score === 'number' && Number.isFinite(opp.score) && (
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${scoreBadgeClass}`}>
                Score {opp.score.toFixed(0)}
              </span>
            )}
            {positionSizing && (positionSizing.recommendedFraction === 0 || (positionSizing.recommendedFraction && positionSizing.recommendedFraction < 0.01)) && (
              <span className="px-3 py-1 rounded-lg text-xs font-bold border-2 border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
                ⚠️ HIGH RISK
              </span>
            )}
          </div>

          <div className="flex items-center gap-5 text-sm text-slate-600 dark:text-slate-400 flex-wrap">
            <span>Stock: ${opp.stockPrice.toFixed(2)}</span>
            <span>Premium: ${opp.premium.toFixed(2)}</span>
            <span>Exp: {opp.expiration}</span>
            {hasPositionSizing && recommendedFractionLabel && (
              <span className="px-3 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/40">
                Risk {recommendedFractionLabel} of portfolio
              </span>
            )}
            {hasPositionSizing && maxPerTradeLabel && (
              <span className="px-3 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/5 dark:text-emerald-200 dark:border-emerald-500/30">
                Cap {maxPerTradeLabel}
              </span>
            )}
          </div>
        </div>

        <div className="text-right space-y-1 ml-4">
          <div className="text-3xl font-bold text-slate-900 dark:text-white">
            ${opp.premium.toFixed(2)}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Premium</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Potential Return</div>
          <div className="text-lg font-semibold text-emerald-600">{opp.potentialReturn.toFixed(1)}%</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">≈ {formatCurrency(potentialReturnDisplay)}</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Max Return</div>
          <div className="text-lg font-semibold text-emerald-600">{opp.maxReturn.toFixed(1)}%</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">≈ {formatCurrency(maxReturnDisplay)}</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Max Loss</div>
          <div className="text-lg font-semibold text-red-600">{maxLossPercentDisplay.toFixed(1)}%</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">≈ {formatCurrency(maxLossDisplay)}</div>
          {opp.riskRewardRatio && opp.riskRewardRatio >= 3 && (
            <div className="mt-1 inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-medium">
              <span>R:R {opp.riskRewardRatio.toFixed(1)}:1</span>
            </div>
          )}
        </div>
      </div>

      {hasPositionSizing && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-800/40 dark:bg-emerald-900/20">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h4 className="text-base font-semibold text-emerald-900 dark:text-emerald-100">Institutional Position Sizing</h4>
              <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
                Kelly sizing blended with volatility and drawdown controls to protect the book while leaning into edge.
              </p>
            </div>
            <div
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wide ${riskBudgetMeta.className}`}
            >
              {riskBudgetMeta.label}
            </div>
          </div>

          {positionSizing && (positionSizing.recommendedFraction === 0 || (positionSizing.recommendedFraction && positionSizing.recommendedFraction < 0.01)) && (
            <div className="mb-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700/50 dark:bg-amber-900/20">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h5 className="font-semibold text-amber-900 dark:text-amber-200 mb-1">Position Not Recommended</h5>
                  <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                    While this opportunity appears attractive, Kelly criterion analysis shows negative expected edge. The risk-adjusted mathematics suggest passing on this trade to preserve capital.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-emerald-200/60 bg-white/70 p-4 dark:border-emerald-800/50 dark:bg-slate-900/60">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                Recommended Allocation
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{recommendedFractionDisplay}</div>
              {expectedLogGrowthDisplay !== '—' && (
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Expected log growth {expectedLogGrowthDisplay}</div>
              )}
            </div>

            <div className="rounded-lg border border-emerald-200/60 bg-white/70 p-4 dark:border-emerald-800/50 dark:bg-slate-900/60">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300">
                Conservative Risk-Off
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{conservativeFractionDisplay}</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Deploy during headline or regime stress</div>
            </div>

            <div className="rounded-lg border border-emerald-200/60 bg-white/70 p-4 dark:border-emerald-800/50 dark:bg-slate-900/60">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                Aggressive Upside
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{aggressiveFractionDisplay}</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Hard cap {maxPerTradeDisplay}</div>
            </div>

            <div className="rounded-lg border border-emerald-200/60 bg-white/70 p-4 dark:border-emerald-800/50 dark:bg-slate-900/60">
              <div className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-300">
                Raw Kelly Fraction
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{kellyFractionDisplay}</div>
              {expectedEdgeDisplay !== '—' && (
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Net edge {expectedEdgeDisplay}</div>
              )}
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-3 text-xs font-medium text-emerald-900/80 dark:text-emerald-100/80">
            <span>Per-trade cap {maxPerTradeDisplay}</span>
            {maxDrawdownDisplay !== '—' && <span>95% drawdown limit {maxDrawdownDisplay}</span>}
            {typeof losingStreak95 === 'number' && Number.isFinite(losingStreak95) && (
              <span>Calibrated for {losingStreak95}-trade losing streak</span>
            )}
          </div>

          {capitalExamples.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Portfolio Impact Examples
              </div>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                {capitalExamples.map(example => (
                  <div
                    key={example.portfolio}
                    className="rounded-lg border border-emerald-200/40 bg-white/60 p-3 dark:border-emerald-800/40 dark:bg-slate-900/40"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      ${example.portfolio.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">Portfolio size</div>
                    <div className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-300">
                      {formatFractionAsPercent(example.allocationPercent)}
                    </div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      ≈ {example.contracts} contract{example.contracts === 1 ? '' : 's'} at {formatCurrency(example.capitalAtRisk)} risk
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sizingRationales.length > 0 && (
            <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
              {sizingRationales.map((reason, index) => (
                <li key={`${reason}-${index}`} className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-300" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {isExpanded ? 'Hide advanced analysis' : 'View advanced analysis'}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-6 space-y-6">
          <ProfitLossSlider opportunity={opp} />

          {riskRewardExplanation && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="font-semibold uppercase tracking-wide text-[11px] text-amber-700 dark:text-amber-200">
                Risk/Reward Context
              </div>
              <p className="mt-2 leading-relaxed">{riskRewardExplanation}</p>
            </div>
          )}

          {greeksExplanation.length > 0 && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100">
              <div className="font-semibold uppercase tracking-wide text-[11px] text-indigo-700 dark:text-indigo-200">
                Greeks Breakdown
              </div>
              <ul className="mt-2 space-y-2">
                {greeksExplanation.map((item, index) => (
                  <li key={index} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {moveThesis && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-100">
              {moveThesis}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ScannerPage({ user }: ScannerPageProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [totalEvaluated, setTotalEvaluated] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [lastSuccessfulUpdate, setLastSuccessfulUpdate] = useState<Date | null>(null)
  const [investmentAmountInput, setInvestmentAmountInput] = useState('1000')
  const investmentAmount = useMemo(() => {
    if (investmentAmountInput.trim() === '') {
      return null
    }

    const parsed = Number(investmentAmountInput)
    return Number.isFinite(parsed) ? parsed : null
  }, [investmentAmountInput])
  const [activeTab, setActiveTab] = useState<'options' | 'crypto'>('options')
  const [cryptoAlerts, setCryptoAlerts] = useState<CryptoAlert[]>([])
  const [cryptoLoading, setCryptoLoading] = useState(false)
  const [sortOption, setSortOption] = useState<OpportunitySortOption>('promising')
  const [isStaleData, setIsStaleData] = useState(false)
  const [scanMetadata, setScanMetadata] = useState<ScanMetadata | null>(null)
  const [scanMode, setScanMode] = useState<FilterMode>('strict')
  const [relaxedScanMeta, setRelaxedScanMeta] = useState<RelaxedScanMetadata | null>(null)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})
  const previousTabRef = useRef<'options' | 'crypto' | null>(null)
  const opportunitiesRef = useRef<Opportunity[]>([])
  const scanModeRef = useRef<FilterMode>('strict')
  const [userPortfolioConstraints, setUserPortfolioConstraints] = useState<{
    portfolioSize: number | null
    dailyContractBudget: number | null
  }>({
    portfolioSize: null,
    dailyContractBudget: null,
  })
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [prefilledInvestment, setPrefilledInvestment] = useState(false)

  const toggleCard = (cardId: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId],
    }))
  }

  useEffect(() => {
    let isMounted = true

    const loadSettings = async () => {
      if (!user?.id) {
        if (isMounted) {
          setSettingsLoaded(true)
        }
        return
      }

      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('user_settings')
          .select('portfolio_size, daily_contract_budget')
          .eq('user_id', user.id)
          .maybeSingle<UserSettingsRow>()

        if (!isMounted) {
          return
        }

        if (error && error.code !== 'PGRST116') {
          console.error('Failed to load user settings for scanner', error)
        }

        if (data) {
          const portfolioSize =
            data.portfolio_size !== null && data.portfolio_size !== undefined
              ? Number(data.portfolio_size)
              : null
          const dailyBudget =
            data.daily_contract_budget !== null && data.daily_contract_budget !== undefined
              ? Number(data.daily_contract_budget)
              : null
          setUserPortfolioConstraints({
            portfolioSize:
              portfolioSize !== null && Number.isFinite(portfolioSize) ? portfolioSize : null,
            dailyContractBudget:
              dailyBudget !== null && Number.isFinite(dailyBudget) ? dailyBudget : null,
          })
        } else {
          setUserPortfolioConstraints({
            portfolioSize: null,
            dailyContractBudget: null,
          })
        }
      } catch (settingsError) {
        if (isMounted) {
          console.error('Error fetching user settings for scanner', settingsError)
        }
      } finally {
        if (isMounted) {
          setSettingsLoaded(true)
        }
      }
    }

    loadSettings()

    return () => {
      isMounted = false
    }
  }, [user?.id])

  useEffect(() => {
    if (!settingsLoaded || prefilledInvestment) {
      return
    }

    const size = userPortfolioConstraints.portfolioSize
    if (typeof size === 'number' && Number.isFinite(size) && size > 0) {
      setInvestmentAmountInput(String(size))
    }

    setPrefilledInvestment(true)
  }, [settingsLoaded, prefilledInvestment, userPortfolioConstraints.portfolioSize])

  const extractFreshnessField = (field: string): unknown => {
    if (!scanMetadata || !scanMetadata.dataFreshness || typeof scanMetadata.dataFreshness !== 'object') {
      return null
    }
    const record = scanMetadata.dataFreshness as Record<string, unknown>
    return field in record ? record[field] : null
  }

  const fallbackActive = scanMetadata?.fallback === true
  const staleCacheActive = !fallbackActive && scanMetadata?.cacheStale === true
  const fallbackReason = typeof scanMetadata?.fallbackReason === 'string' ? scanMetadata.fallbackReason : null
  const fallbackDetails = typeof scanMetadata?.fallbackDetails === 'string' ? scanMetadata.fallbackDetails : null
  const fallbackDebugInfo =
    fallbackActive &&
    scanMetadata?.debugInfo &&
    typeof scanMetadata.debugInfo === 'object' &&
    scanMetadata.debugInfo !== null
      ? (scanMetadata.debugInfo as Record<string, unknown>)
      : null
  const fallbackIsNoResults = fallbackActive && fallbackReason === 'no_enhanced_results'
  const fallbackSearchMetadata = useMemo(() => {
    if (!fallbackIsNoResults || !fallbackDebugInfo) {
      return null
    }

    const metadataCandidate = fallbackDebugInfo.sanitizedMetadata
    if (!metadataCandidate || typeof metadataCandidate !== 'object') {
      return null
    }

    return metadataCandidate as Record<string, unknown>
  }, [fallbackDebugInfo, fallbackIsNoResults])
  const fallbackSearchSummary = useMemo(() => {
    if (!fallbackIsNoResults) {
      return {
        description: null as string | null,
        entries: [] as Array<{ label: string; value: string }>,
      }
    }

    const metadata = fallbackSearchMetadata
    const entries: Array<{ label: string; value: string }> = []

    const filterModeRaw =
      (metadata && typeof metadata['filterMode'] === 'string' ? (metadata['filterMode'] as string) : null) ??
      (typeof fallbackDebugInfo?.['filterMode'] === 'string' ? (fallbackDebugInfo['filterMode'] as string) : null)
    const filterModeDescription = describeFilterMode(filterModeRaw)
    if (filterModeDescription) {
      entries.push({ label: 'Filter mode', value: filterModeDescription })
    }

    const symbolList = extractStringArray(metadata ?? null, 'symbols')
    const symbolLimit = extractNumber(metadata ?? null, 'symbolLimit')
    const symbolDisplay = (() => {
      if (symbolList.length === 0) {
        return null
      }
      const displayList = symbolList.slice(0, 8)
      const remainder = symbolList.length - displayList.length
      const formatted = displayList.join(', ')
      return remainder > 0 ? `${formatted} +${remainder} more` : formatted
    })()
    if (symbolDisplay) {
      const suffix =
        typeof symbolLimit === 'number' && symbolLimit > symbolList.length
          ? ` (limited to ${symbolLimit.toLocaleString()})`
          : ''
      entries.push({
        label: `Symbols scanned${suffix}`,
        value: symbolDisplay,
      })
    } else if (typeof symbolLimit === 'number') {
      entries.push({ label: 'Symbol limit', value: symbolLimit.toLocaleString() })
    }

    const totalEvaluated =
      extractNumber(fallbackDebugInfo ?? null, 'totalEvaluated') ?? extractNumber(metadata ?? null, 'totalEvaluated')
    if (typeof totalEvaluated === 'number') {
      entries.push({ label: 'Options evaluated', value: totalEvaluated.toLocaleString() })
    }

    const rawCandidates = extractNumber(fallbackDebugInfo ?? null, 'rawOpportunityCount')
    if (typeof rawCandidates === 'number' && rawCandidates > 0) {
      entries.push({
        label: 'Candidates before quality checks',
        value: rawCandidates.toLocaleString(),
      })
    }

    const sanitizedCandidates =
      extractNumber(fallbackDebugInfo ?? null, 'sanitizedOpportunityCount') ??
      extractNumber(metadata ?? null, 'opportunityCount') ??
      0
    entries.push({
      label: 'Qualified opportunities',
      value:
        sanitizedCandidates > 0
          ? sanitizedCandidates.toLocaleString()
          : '0 (none cleared the institutional-grade thresholds)',
    })

    const normalizedMode = typeof filterModeRaw === 'string' ? filterModeRaw.toLowerCase() : null
    const evaluatedText =
      typeof totalEvaluated === 'number' && totalEvaluated > 0
        ? `scanned ${totalEvaluated.toLocaleString()} options`
        : 'completed an institutional scan'
    const symbolText =
      symbolList.length > 0
        ? ` across ${symbolList.length.toLocaleString()} symbol${symbolList.length === 1 ? '' : 's'}`
        : ''
    const filterText = (() => {
      if (normalizedMode === 'relaxed') {
        return ' with relaxed filters applied'
      }
      if (normalizedMode === 'strict') {
        return ' with strict institutional-grade filters'
      }
      return ''
    })()

    const description = `We ${evaluatedText}${symbolText}${filterText}, but none met the institutional-grade criteria.`

    return {
      description,
      entries,
    }
  }, [fallbackDebugInfo, fallbackIsNoResults, fallbackSearchMetadata])
  const metadataSource = typeof scanMetadata?.source === 'string' ? scanMetadata.source.toLowerCase() : null
  // Always use enhanced scanner for options
  const enhancedModeActive = activeTab === 'options'
  const enhancedResponseDetected =
    enhancedModeActive &&
    (scanMetadata?.enhancedScanner === true ||
      scanMetadata?.institutionalGrade === true ||
      (metadataSource !== null && metadataSource.includes('enhanced')))
  const showEnhancedStatus = enhancedModeActive && !fallbackActive
  const cacheAgeDescription = formatAgeDescription(
    typeof scanMetadata?.cacheAgeMinutes === 'number' ? scanMetadata.cacheAgeMinutes : (extractFreshnessField('cacheAgeMinutes') as number | null | undefined),
  )
  const cacheTimestampRaw = (() => {
    if (typeof scanMetadata?.cacheTimestamp === 'string') {
      return scanMetadata.cacheTimestamp
    }
    const extracted = extractFreshnessField('cacheTimestamp')
    return typeof extracted === 'string' ? extracted : null
  })()
  const cacheTimestamp = (() => {
    if (!cacheTimestampRaw) {
      return null
    }
    const parsed = new Date(cacheTimestampRaw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  })()

  const isRelaxedMode = scanMode === 'relaxed'
  const relaxedSuggestionAvailable =
    scanMode === 'strict' &&
    relaxedScanMeta?.strictMode === true &&
    relaxedScanMeta?.available === true &&
    relaxedScanMeta?.applied !== true
  const relaxedCandidateCount =
    typeof relaxedScanMeta?.candidateCount === 'number' && Number.isFinite(relaxedScanMeta.candidateCount)
      ? relaxedScanMeta.candidateCount
      : null
  const relaxedStageSummaries = useMemo(() => {
    if (!relaxedScanMeta?.stages || typeof relaxedScanMeta.stages !== 'object') {
      return [] as Array<{ stage: string; candidates: number | null; reason: string | null; blocked: string | null }>
    }

    return Object.entries(relaxedScanMeta.stages)
      .map(([stageKey, stageValue]) => {
        if (!stageValue || typeof stageValue !== 'object') {
          return null
        }

        const normalizedStage = (() => {
          switch (stageKey) {
            case 'liquidity':
              return 'Liquidity filters'
            case 'quality':
              return 'Quality thresholds'
            case 'topVolume':
              return 'Top volume safety net'
            default:
              return stageKey.charAt(0).toUpperCase() + stageKey.slice(1)
          }
        })()

        const stageMeta = stageValue as RelaxedScanStageMetadata
        const candidates =
          typeof stageMeta.candidates === 'number' && Number.isFinite(stageMeta.candidates)
            ? stageMeta.candidates
            : null
        const reason = typeof stageMeta.reason === 'string' ? stageMeta.reason : null
        const blocked = typeof stageMeta.blocked === 'string' ? stageMeta.blocked : null

        if (candidates === null && !reason && !blocked) {
          return null
        }

        return { stage: normalizedStage, candidates, reason, blocked }
      })
      .filter((entry): entry is { stage: string; candidates: number | null; reason: string | null; blocked: string | null } => Boolean(entry))
  }, [relaxedScanMeta])
  const relaxedAppliedStage = typeof relaxedScanMeta?.appliedStage === 'string' ? relaxedScanMeta.appliedStage : null
  const relaxedAppliedDescription = (() => {
    switch (relaxedAppliedStage) {
      case 'liquidity':
        return 'adaptive liquidity filters'
      case 'quality':
        return 'relaxed quality thresholds'
      case 'topVolume':
        return 'the top-volume safety net'
      default:
        return null
    }
  })()

  const handleScanPayload = useCallback((payload: ScanApiResponse, options?: { forcedStale?: boolean }) => {
    if (!payload || typeof payload !== 'object' || payload.success !== true) {
      return false
    }

    const metadata: ScanMetadata | null =
      payload.metadata && typeof payload.metadata === 'object'
        ? (payload.metadata as ScanMetadata)
        : null

    setScanMetadata(metadata)

    if (metadata && typeof metadata.filterMode === 'string') {
      const normalizedMode = metadata.filterMode.toLowerCase()
      if (normalizedMode === 'relaxed' || normalizedMode === 'strict') {
        scanModeRef.current = normalizedMode as FilterMode
        setScanMode(normalizedMode as FilterMode)
      }
    }

    const relaxedMetadata =
      metadata && typeof metadata.relaxedScan === 'object' && metadata.relaxedScan !== null
        ? (metadata.relaxedScan as RelaxedScanMetadata)
        : null
    setRelaxedScanMeta(relaxedMetadata)

    const usedFallback = metadata?.fallback === true
    const staleCache = metadata?.cacheStale === true

    const evaluatedFromApi =
      typeof payload.totalEvaluated === 'number'
        ? payload.totalEvaluated
        : typeof payload.total_evaluated === 'number'
          ? payload.total_evaluated
          : Array.isArray(payload.opportunities)
            ? payload.opportunities.length
            : 0

    const shouldMarkStale = options?.forcedStale === true || usedFallback || staleCache

    if (Array.isArray(payload.opportunities) && payload.opportunities.length > 0) {
      setOpportunities(payload.opportunities)
      opportunitiesRef.current = payload.opportunities
      setTotalEvaluated(evaluatedFromApi)
      setLastSuccessfulUpdate(new Date())
      setIsStaleData(shouldMarkStale)
    } else if (opportunitiesRef.current.length === 0) {
      setOpportunities([])
      opportunitiesRef.current = []
      setTotalEvaluated(evaluatedFromApi)
      setIsStaleData(shouldMarkStale)
    } else {
      setIsStaleData(true)
      console.warn('Scan returned no results - keeping previous data visible')
    }

    return true
  }, [])

  const attemptFallbackFetch = useCallback(
    async (reason: string, details?: string) => {
      try {
        const params = new URLSearchParams({ mode: 'fallback', reason })
        if (details && details.trim().length > 0) {
          params.set('details', details)
        }

        const response = await fetch(`/api/scan-python?${params.toString()}`)
        if (!response.ok) {
          console.error('Fallback scan request failed with status', response.status)
          return false
        }

        const data = (await response.json()) as ScanApiResponse
        const handled = handleScanPayload(data, { forcedStale: true })
        if (!handled) {
          console.warn('Fallback scan response did not include usable opportunities')
        }
        return handled
      } catch (fallbackError) {
        console.error('Error fetching fallback opportunities:', fallbackError)
        return false
      }
    },
    [handleScanPayload],
  )

  const fetchOpportunities = useCallback(async (modeOverride?: FilterMode) => {
    const effectiveMode: FilterMode = modeOverride ?? scanModeRef.current
    if (modeOverride && modeOverride !== scanModeRef.current) {
      scanModeRef.current = modeOverride
      setScanMode(modeOverride)
    }

    try {
      setIsLoading(true)

      // Always use institutional-grade enhanced scanner
      const endpointBase = '/api/scan-enhanced'
      const endpoint =
        effectiveMode === 'relaxed'
          ? `${endpointBase}?filterMode=relaxed`
          : `${endpointBase}?filterMode=strict`
      const timeoutMs = ENHANCED_FETCH_TIMEOUT_MS
      const resolvedPortfolioSize = Number.isFinite(userPortfolioConstraints.portfolioSize ?? NaN)
        ? userPortfolioConstraints.portfolioSize
        : Number.isFinite(investmentAmount ?? NaN)
          ? investmentAmount
          : null
      const resolvedDailyBudget = Number.isFinite(userPortfolioConstraints.dailyContractBudget ?? NaN)
        ? userPortfolioConstraints.dailyContractBudget
        : null

      const payload = {
        portfolioSize: resolvedPortfolioSize,
        dailyContractBudget: resolvedDailyBudget,
      }

      const response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        timeoutMs,
      )

      if (!response.ok) {
        console.error('Scan request failed with status', response.status)
        const fallbackHandled = await attemptFallbackFetch('http_error', `Received status ${response.status}`)
        if (!fallbackHandled) {
          setScanMetadata(null)
          if (opportunitiesRef.current.length === 0) {
            setOpportunities([])
          } else {
            setIsStaleData(true)
          }
        }
        return
      }

      const data = (await response.json()) as ScanApiResponse

      const handled = handleScanPayload(data)
      if (!handled) {
        const fallbackHandled = await attemptFallbackFetch(
          'invalid_payload',
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : undefined,
        )

        if (!fallbackHandled) {
          setScanMetadata(null)
        }
      }
    } catch (error) {
      console.error('Error fetching opportunities:', error)
      const fallbackHandled = await attemptFallbackFetch(
        'network_error',
        error instanceof Error ? error.message : undefined,
      )

      if (!fallbackHandled) {
        // On error, keep existing data and mark as stale
        if (opportunitiesRef.current.length > 0) {
          setIsStaleData(true)
        }
      }
    } finally {
      setIsLoading(false)
    }
  }, [attemptFallbackFetch, handleScanPayload, investmentAmount, userPortfolioConstraints])

  const fetchCryptoAlerts = useCallback(async () => {
    try {
      setCryptoLoading(true)
      const response = await fetch('/api/crypto-scan')
      const data = await response.json()
      if (data.success) {
        setCryptoAlerts(data.trading_alerts || [])
      }
    } catch (error) {
      console.error('Error fetching crypto alerts:', error)
    } finally {
      setCryptoLoading(false)
    }
  }, [])

  const isMarketOpen = () => {
    const now = new Date()

    // Convert to Eastern Time
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const day = etTime.getDay() // 0 = Sunday, 6 = Saturday
    const hour = etTime.getHours()
    const minute = etTime.getMinutes()

    // Market is closed on weekends
    if (day === 0 || day === 6) return false

    // Market hours: 9:30 AM - 4:00 PM ET
    const marketOpen = 9.5 // 9:30 AM
    const marketClose = 16 // 4:00 PM
    const currentTime = hour + minute / 60

    return currentTime >= marketOpen && currentTime < marketClose
  }

  useEffect(() => {
    if (!settingsLoaded) {
      return
    }

    fetchOpportunities()
    // Auto-refresh disabled - user must manually refresh to avoid API overuse
  }, [fetchOpportunities, settingsLoaded])

  useEffect(() => {
    opportunitiesRef.current = opportunities
  }, [opportunities])

  useEffect(() => {
    if (activeTab === 'crypto' && previousTabRef.current !== 'crypto') {
      fetchCryptoAlerts()
    }
    previousTabRef.current = activeTab
  }, [activeTab, fetchCryptoAlerts])

  useEffect(() => {
    setExpandedCards({})
  }, [opportunities])

  const sortedOpportunities = useMemo(() => {
    if (opportunities.length === 0) {
      return opportunities
    }

    console.log(`Sorting ${opportunities.length} opportunities by: ${sortOption}`)
    const ranked = [...opportunities]
    const toNumber = (value: number | null | undefined, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback

    const comparePromising = (a: Opportunity, b: Opportunity) => {
      const scoreDiff = toNumber(b.score, -Infinity) - toNumber(a.score, -Infinity)
      if (scoreDiff !== 0) return scoreDiff

      const riskDiff = toNumber(b.riskRewardRatio, -Infinity) - toNumber(a.riskRewardRatio, -Infinity)
      if (riskDiff !== 0) return riskDiff

      const probDiff =
        toNumber(b.probabilityOfProfit, -Infinity) - toNumber(a.probabilityOfProfit, -Infinity)
      if (probDiff !== 0) return probDiff

      return toNumber(b.potentialReturn, -Infinity) - toNumber(a.potentialReturn, -Infinity)
    }

    const compareRiskReward = (a: Opportunity, b: Opportunity) => {
      const diff = toNumber(b.riskRewardRatio, -Infinity) - toNumber(a.riskRewardRatio, -Infinity)
      if (diff !== 0) return diff
      return comparePromising(a, b)
    }

    const compareProbability = (a: Opportunity, b: Opportunity) => {
      const diff =
        toNumber(b.probabilityOfProfit, -Infinity) - toNumber(a.probabilityOfProfit, -Infinity)
      if (diff !== 0) return diff
      return comparePromising(a, b)
    }

    const compareMaxReturn = (a: Opportunity, b: Opportunity) => {
      const diff = toNumber(b.maxReturn, -Infinity) - toNumber(a.maxReturn, -Infinity)
      if (diff !== 0) return diff
      return comparePromising(a, b)
    }

    const compareSafety = (a: Opportunity, b: Opportunity) => {
      const diff = toNumber(a.maxLossPercent, Infinity) - toNumber(b.maxLossPercent, Infinity)
      if (diff !== 0) return diff
      return comparePromising(a, b)
    }

    const compareExpiration = (a: Opportunity, b: Opportunity) => {
      const diff = toNumber(a.daysToExpiration, Infinity) - toNumber(b.daysToExpiration, Infinity)
      if (diff !== 0) return diff
      return comparePromising(a, b)
    }

    const comparatorMap: Record<OpportunitySortOption, (a: Opportunity, b: Opportunity) => number> = {
      promising: comparePromising,
      riskReward: compareRiskReward,
      probability: compareProbability,
      maxReturn: compareMaxReturn,
      safety: compareSafety,
      expiration: compareExpiration,
    }

    const comparator = comparatorMap[sortOption] ?? comparePromising
    ranked.sort(comparator)

    // Debug: Check sorting results
    if (ranked.length > 0) {
      console.log('After sorting by', sortOption, '- Top 3:')
      ranked.slice(0, 3).forEach((opp, i) => {
        console.log(`  ${i + 1}. ${opp.symbol} - Score: ${opp.score}, RR: ${opp.riskRewardRatio}, Prob: ${opp.probabilityOfProfit}, MaxRet: ${opp.maxReturn}, MaxLoss%: ${opp.maxLossPercent}, DTE: ${opp.daysToExpiration}`)
      })
    }

    return ranked
  }, [opportunities, sortOption])

  const availableSortOptions: Array<{ value: OpportunitySortOption; label: string }> = [
    { value: 'promising', label: 'Most Promising' },
    { value: 'riskReward', label: 'Highest Asymmetry' },
    { value: 'probability', label: 'Highest Win Rate' },
    { value: 'maxReturn', label: 'Highest Max Return' },
    { value: 'safety', label: 'Lowest Risk' },
    { value: 'expiration', label: 'Soonest Expiration' },
  ]

  const getRiskColor = (riskLevel?: string | null) => {
    const normalized = typeof riskLevel === 'string' ? riskLevel.toLowerCase() : ''
    switch (normalized) {
      case 'low':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'medium':
        return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'high':
        return 'bg-red-50 text-red-700 border-red-200'
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200'
    }
  }

  const getScoreColor = (score: number | null | undefined) => {
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return 'bg-slate-400 text-white'
    }
    if (score >= 90) return 'bg-red-500 text-white'
    if (score >= 80) return 'bg-orange-500 text-white'
    if (score >= 70) return 'bg-amber-500 text-white'
    return 'bg-slate-500 text-white'
  }

  const formatAllocationAction = (action: CryptoAlert['allocation']['action']) => {
    switch (action) {
      case 'INCREASE_POSITION':
        return 'Increase Position'
      case 'DECREASE_POSITION':
        return 'Decrease Position'
      case 'MOVE_TO_USDC':
        return 'Shift into USDC'
      default:
        return 'Maintain Position'
    }
  }

  const getAllocationBadgeClasses = (action: CryptoAlert['allocation']['action']) => {
    switch (action) {
      case 'INCREASE_POSITION':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
      case 'DECREASE_POSITION':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
      case 'MOVE_TO_USDC':
        return 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300'
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  function formatAgeDescription(minutes?: number | null) {
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) {
      return null
    }

    if (minutes < 60) {
      const rounded = Math.max(1, Math.round(minutes))
      return `${rounded} minute${rounded === 1 ? '' : 's'}`
    }

    if (minutes < 1440) {
      const hours = Math.round((minutes / 60) * 10) / 10
      const display = Number.isInteger(hours) ? hours.toString() : hours.toFixed(1)
      return `${display} hour${Math.abs(hours - 1) < 1e-9 ? '' : 's'}`
    }

    const days = Math.round((minutes / 1440) * 10) / 10
    const display = Number.isInteger(days) ? days.toString() : days.toFixed(1)
    return `${display} day${Math.abs(days - 1) < 1e-9 ? '' : 's'}`
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const formatPercent = (value: number | null | undefined, digits = 0) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—'
    }
    return `${value.toFixed(digits)}%`
  }

  const safeToFixed = (value: number | null | undefined, digits = 1) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return null
    }
    return value.toFixed(digits)
  }

  const formatSwingClassification = (classification?: string | null) => {
    if (!classification) {
      return null
    }

    const normalized = classification.toLowerCase()
    const mapping: Record<string, string> = {
      elevated_swing_risk: 'Elevated swing risk',
      watchlist: 'On watchlist',
      calm: 'Calm regime',
    }

    if (mapping[normalized]) {
      return mapping[normalized]
    }

    return classification
      .split('_')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ')
  }

  const getSwingBadgeClass = (classification?: string | null) => {
    switch (classification) {
      case 'elevated_swing_risk':
        return 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/40'
      case 'watchlist':
        return 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/40'
      case 'calm':
        return 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/40'
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/40 dark:text-slate-200 dark:border-slate-600/50'
    }
  }

  const formatDetailValue = (value: unknown): string => {
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return value.toLocaleString()
      }
      if (Math.abs(value) >= 100) {
        return value.toFixed(1)
      }
      if (Math.abs(value) >= 1) {
        return value.toFixed(2)
      }
      return value.toFixed(3)
    }

    if (typeof value === 'string') {
      return value.replace(/_/g, ' ')
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => formatDetailValue(item))
        .filter(Boolean)
        .join(', ')
    }

    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .map(([key, val]) => `${key}: ${formatDetailValue(val)}`)
        .join(', ')
    }

    return ''
  }

  const formatBreakevenRequirement = (opp: Opportunity) => {
    const move = opp.breakevenMovePercent
    if (move === null || !Number.isFinite(move)) {
      return null
    }

    if (move <= 0) {
      return 'Already beyond breakeven'
    }

    const direction = opp.optionType === 'put' ? 'drop' : 'gain'
    return `Needs ${Math.abs(move).toFixed(1)}% ${direction} to breakeven`
  }

  const getTradeLogic = (opp: Opportunity) => {
    const isCall = opp.optionType === 'call'
    const daysToExp = opp.daysToExpiration
    const price = Math.max(opp.stockPrice, 0)
    const strike = opp.strike
    const ivRank = opp.ivRank
    const eventIntel = opp.eventIntel || {}

    let logic = ""
    
    // Basic trade direction
    if (isCall) {
      logic += `This is a CALL option betting that ${opp.symbol} will go UP. `
    } else {
      logic += `This is a PUT option betting that ${opp.symbol} will go DOWN. `
    }
    
    // Strike analysis
    const relativeDiff = price > 0 ? Math.abs(price - strike) / price : 0
    if (relativeDiff < 0.01) {
      logic += 'The strike price is essentially at-the-money, so even small moves in the underlying can swing this trade. '
    } else if (isCall) {
      const diffPct = price > 0 ? ((price - strike) / price) * 100 : 0
      if (diffPct > 0) {
        logic += `The strike is ${Math.abs(diffPct).toFixed(1)}% below the stock price, giving this call intrinsic value from the start. `
      } else {
        const neededMove = Math.abs(diffPct)
        logic += `The strike is ${neededMove.toFixed(1)}% above the stock price, so the shares need roughly a ${neededMove.toFixed(1)}% rally to move in-the-money. `
      }
    } else {
      const diffPct = price > 0 ? ((strike - price) / price) * 100 : 0
      if (diffPct > 0) {
        logic += `The strike is ${Math.abs(diffPct).toFixed(1)}% above the stock price, meaning this put already carries intrinsic value from the recent downside move. `
      } else {
        const neededDrop = Math.abs(diffPct)
        logic += `The strike is ${neededDrop.toFixed(1)}% below the stock price, so the underlying would need to drop about ${neededDrop.toFixed(1)}% for the put to move in-the-money. `
      }
    }
    
    // Time analysis
    if (daysToExp <= 7) {
      logic += `With only ${daysToExp} days until expiration, this is a short-term trade that requires quick price movement. `
    } else if (daysToExp <= 30) {
      logic += `With ${daysToExp} days until expiration, this gives a reasonable timeframe for the expected move to play out. `
    } else {
      logic += `With ${daysToExp} days until expiration, this provides plenty of time for the trade thesis to develop. `
    }
    
    // IV analysis
    if (ivRank < 30) {
      logic += `The implied volatility is relatively low (${ivRank.toFixed(0)}% rank), meaning options are cheap and volatility could expand, boosting option prices. `
    } else if (ivRank > 70) {
      logic += `The implied volatility is high (${ivRank.toFixed(0)}% rank), meaning options are expensive but could benefit from volatility contraction. `
    } else {
      logic += `The implied volatility is moderate (${ivRank.toFixed(0)}% rank), providing a balanced environment for the trade. `
    }
    
    // Pattern-specific logic
    if (opp.gammaSqueezeScore && opp.gammaSqueezeScore > 0) {
      logic += `The high gamma squeeze score suggests potential for explosive upside if the stock breaks through key resistance levels. `
    }
    
    if (opp.unusualFlowScore && opp.unusualFlowScore > 0) {
      logic += `Unusual options activity indicates smart money positioning, potentially signaling an upcoming move. `
    }

    if (typeof eventIntel.earnings_in_days === 'number') {
      if (eventIntel.earnings_in_days >= 0) {
        logic += `Upcoming earnings in ${Math.round(eventIntel.earnings_in_days)} days could be a key catalyst for volatility. `
      } else if (eventIntel.earnings_in_days < 0 && eventIntel.earnings_in_days > -7) {
        logic += `The stock is still reacting to a fresh earnings release from ${Math.abs(Math.round(eventIntel.earnings_in_days))} days ago. `
      }
    }

    if (typeof eventIntel.news_sentiment_label === 'string') {
      const sentimentLabel = String(eventIntel.news_sentiment_label).replace('_', ' ')
      if (['bullish', 'very bullish', 'bearish', 'very bearish'].includes(sentimentLabel.toLowerCase())) {
        logic += `News flow is ${sentimentLabel.toLowerCase()}, reinforcing the directional bias behind this trade. `
      }
    }

    const drivers = opp.moveAnalysis?.drivers?.length
      ? opp.moveAnalysis.drivers
      : Array.isArray(eventIntel.unique_drivers)
        ? eventIntel.unique_drivers
        : []
    if (drivers.length > 0) {
      logic += `Primary drivers include ${drivers.join(', ')}. `
    }

    return logic
  }

  const getGreeksExplanation = (opp: Opportunity) => {
    const explanations = []
    const greeks = opp.greeks
    
    // Delta explanation
    const deltaPercent = (greeks.delta * 100).toFixed(1)
    if (Math.abs(greeks.delta) > 0.5) {
      explanations.push(`Delta of ${deltaPercent}% means this option will move significantly with stock price changes - expect big swings in option value.`)
    } else if (Math.abs(greeks.delta) > 0.3) {
      explanations.push(`Delta of ${deltaPercent}% provides good sensitivity to stock moves while maintaining reasonable premium cost.`)
    } else {
      explanations.push(`Delta of ${deltaPercent}% means the option is less sensitive to small stock moves but cheaper to own.`)
    }
    
    // Gamma explanation
    if (greeks.gamma > 0.02) {
      explanations.push(`High gamma of ${greeks.gamma.toFixed(3)} means the option's sensitivity to stock price changes will increase dramatically as the stock moves in your favor.`)
    } else if (greeks.gamma > 0.01) {
      explanations.push(`Moderate gamma of ${greeks.gamma.toFixed(3)} provides good acceleration as the stock moves in your direction.`)
    } else {
      explanations.push(`Lower gamma of ${greeks.gamma.toFixed(3)} means more linear price movement relative to the stock.`)
    }
    
    // Theta explanation (time decay)
    const thetaDaily = greeks.theta
    if (Math.abs(thetaDaily) > 0.5) {
      explanations.push(`High theta decay of ${thetaDaily.toFixed(2)} per day means this option loses significant value each day - time is working against you.`)
    } else if (Math.abs(thetaDaily) > 0.2) {
      explanations.push(`Moderate theta decay of ${thetaDaily.toFixed(2)} per day means reasonable time decay that won't destroy the trade quickly.`)
    } else {
      explanations.push(`Low theta decay of ${thetaDaily.toFixed(2)} per day means time decay is minimal, giving you more time for the trade to work.`)
    }
    
    // Vega explanation (volatility sensitivity)
    if (greeks.vega > 0.2) {
      explanations.push(`High vega of ${greeks.vega.toFixed(2)} means this option is very sensitive to volatility changes - a volatility spike could significantly boost option value.`)
    } else if (greeks.vega > 0.1) {
      explanations.push(`Moderate vega of ${greeks.vega.toFixed(2)} provides good exposure to volatility expansion while managing premium cost.`)
    } else {
      explanations.push(`Lower vega of ${greeks.vega.toFixed(2)} means the option is less affected by volatility changes, focusing more on directional moves.`)
    }
    
    return explanations
  }

  const renderMoveThesis = (opp: Opportunity) => {
    const thesisPoints = (opp.reasoning || []).filter(Boolean)
    const catalysts = (opp.catalysts || []).filter(Boolean)
    const patterns = (opp.patterns || []).filter(Boolean)
    const moveAnalysis = opp.moveAnalysis
    const tradeLogic = getTradeLogic(opp)

    const swingSignal = opp.swingSignal
    const swingSignalError = opp.swingSignalError

    const swingInsights = (() => {
      if (!swingSignal && !swingSignalError) {
        return null
      }

      const classificationLabel = formatSwingClassification(swingSignal?.classification)
      const compositeScore = typeof swingSignal?.compositeScore === 'number' ? swingSignal.compositeScore : null

      const metadata = swingSignal?.metadata ?? {}
      const atrRatio = typeof metadata.atr_ratio === 'number' ? metadata.atr_ratio : null
      const momentumZ = typeof metadata.momentum_zscore === 'number' ? metadata.momentum_zscore : null
      const volumeZ = typeof metadata.volume_zscore === 'number' ? metadata.volume_zscore : null

      const metrics: Array<{ label: string; value: string }> = [
        {
          label: 'Composite Score',
          value: compositeScore !== null ? compositeScore.toFixed(1) : '—',
        },
        {
          label: 'ATR Expansion',
          value: atrRatio !== null ? `${atrRatio.toFixed(2)}x baseline` : '—',
        },
        {
          label: 'Momentum Z-Score',
          value: momentumZ !== null ? `${momentumZ.toFixed(2)}σ` : '—',
        },
        {
          label: 'Volume Z-Score',
          value: volumeZ !== null ? `${volumeZ.toFixed(2)}σ` : '—',
        },
      ]

      if (metadata.market_context && typeof metadata.market_context === 'object') {
        const context = metadata.market_context as Record<string, unknown>
        const vixRatio = typeof context.vix_ratio === 'number' ? context.vix_ratio : null
        const spyReturn = typeof context.spy_return_5d === 'number' ? context.spy_return_5d : null
        if (vixRatio !== null) {
          metrics.push({ label: 'VIX vs 20d', value: `${(vixRatio * 100).toFixed(0)}%` })
        }
        if (spyReturn !== null) {
          metrics.push({ label: 'SPY 5d', value: `${(spyReturn * 100).toFixed(1)}%` })
        }
      }

      const factors = swingSignal?.factors ?? []
      const sortedFactors = [...factors].sort((a, b) => {
        const scoreA = typeof a.score === 'number' ? a.score : -Infinity
        const scoreB = typeof b.score === 'number' ? b.score : -Infinity
        return scoreB - scoreA
      })

      const newsSample: SwingSignalNewsHeadline[] = []
      if (Array.isArray(metadata.news_sample)) {
        metadata.news_sample.forEach((headline) => {
          newsSample.push(headline)
        })
      }

      return (
        <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h5 className="font-medium text-indigo-900 dark:text-indigo-100">Multi-Factor Swing Signal</h5>
              <p className="text-xs text-indigo-700/80 dark:text-indigo-200/80">
                Blends volatility, momentum, volume, news sentiment, and market regime to gauge move potential.
              </p>
            </div>
            {classificationLabel && (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getSwingBadgeClass(swingSignal?.classification)}`}>
                {classificationLabel}
              </span>
            )}
          </div>

          {swingSignalError && !swingSignal && (
            <div className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
              Unable to compute swing signal: {swingSignalError}
            </div>
          )}

          {swingSignal && (
            <>
              {/* Swing Signal Summary */}
              {swingSignal.metadata?.summary && (
                <div className="mb-4 bg-white/70 dark:bg-slate-900/60 border border-indigo-100/60 dark:border-indigo-900/40 rounded-xl px-4 py-3">
                  <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {swingSignal.metadata.summary}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {metrics.map((metric) => (
                  <div key={metric.label} className="bg-white/60 dark:bg-slate-900/60 rounded-xl px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-indigo-600 dark:text-indigo-300 font-semibold">
                      {metric.label}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{metric.value}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {sortedFactors.map((factor) => {
                  const detailEntries = Object.entries(factor.details ?? {}).filter(([label, value]) =>
                    label !== 'headlines' && value !== null && value !== undefined && formatDetailValue(value) !== ''
                  )
                  return (
                    <div
                      key={factor.name}
                      className="bg-white/70 dark:bg-slate-900/60 border border-indigo-100/60 dark:border-indigo-900/40 rounded-xl px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">{factor.name}</div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{factor.rationale}</p>
                        </div>
                        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-200 bg-indigo-100/80 dark:bg-indigo-800/50 rounded-full px-2 py-1">
                          {safeToFixed(factor.score, 1) ?? '—'}
                        </span>
                      </div>
                      {detailEntries.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {detailEntries.map(([label, value]) => (
                            <span
                              key={label}
                              className="inline-flex items-center gap-1 rounded-full bg-indigo-100/70 dark:bg-indigo-800/40 text-[11px] text-indigo-700 dark:text-indigo-200 px-2 py-1"
                            >
                              <span className="font-medium">{label.replace(/_/g, ' ')}:</span>
                              <span>{formatDetailValue(value)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {newsSample.length > 0 && (
                <div className="bg-white/70 dark:bg-slate-900/60 border border-indigo-100/60 dark:border-indigo-900/40 rounded-xl px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-indigo-600 dark:text-indigo-300 font-semibold mb-2">
                    Recent catalysts sampled
                  </div>
                  <div className="space-y-2">
                    {newsSample.slice(0, 3).map((headline, index) => (
                      <div key={index} className="text-xs text-slate-700 dark:text-slate-200">
                        <div className="font-medium text-slate-900 dark:text-white">{headline?.title || 'Headline unavailable'}</div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          {headline?.publisher && <span>{headline.publisher}</span>}
                          {typeof headline?.sentiment_label === 'string' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100/70 dark:bg-indigo-800/40 text-indigo-700 dark:text-indigo-200">
                              Sentiment: {headline.sentiment_label.replace(/_/g, ' ')}
                              {typeof headline?.sentiment_score === 'number' && (
                                <span>({headline.sentiment_score.toFixed(2)})</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )
    })()

    return (
      <div className="space-y-4">
        {swingInsights}

        {tradeLogic && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
            <h5 className="font-medium text-slate-900 dark:text-white mb-2">Trade Logic</h5>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{tradeLogic}</p>
          </div>
        )}

        {thesisPoints.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
            <h5 className="font-medium text-slate-900 dark:text-white mb-2">Why This Setup Works</h5>
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 list-disc list-inside">
              {thesisPoints.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {moveAnalysis && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
            <h5 className="font-medium text-slate-900 dark:text-white mb-3">Expected Move Analysis</h5>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Expected Move</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {formatPercent(moveAnalysis.expectedMovePercent, 1)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Implied Volatility</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {formatPercent(moveAnalysis.impliedVol, 1)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Days to Expiration</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {moveAnalysis.daysToExpiration ?? opp.daysToExpiration}
                </div>
              </div>
            </div>

            {moveAnalysis.thresholds?.length ? (
              <div className="space-y-2">
                {moveAnalysis.thresholds.map((threshold, index) => (
                  <div
                    key={index}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl bg-white/60 dark:bg-slate-900/60 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">{threshold.threshold}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">{threshold.summary}</div>
                    </div>
                    <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                      {threshold.baseProbability !== null && (
                        <div>Base: {formatPercent(threshold.baseProbability, 1)}</div>
                      )}
                      {threshold.conviction !== null && (
                        <div>Conviction: {threshold.conviction.toFixed(1)} / 5</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {(catalysts.length > 0 || patterns.length > 0) && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
            <h5 className="font-medium text-slate-900 dark:text-white mb-2">Supporting Signals</h5>
            <div className="flex flex-wrap gap-2">
              {patterns.map((pattern, index) => (
                <span key={`pattern-${index}`} className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-xs font-medium rounded-xl">
                  {pattern}
                </span>
              ))}
              {catalysts.map((catalyst, index) => (
                <span key={`catalyst-${index}`} className="px-3 py-1 bg-emerald-200/80 dark:bg-emerald-900/40 text-xs font-medium text-emerald-900 dark:text-emerald-100 rounded-xl">
                  {catalyst}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const getRiskRewardExplanation = (opp: Opportunity) => {
    const sanitizeNumber = (value: number | null | undefined, fallback: number) => {
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback
    }

    const maxReturn = sanitizeNumber(opp.maxReturn, 0)
    // For long options, max loss is always 100% of premium paid
    const maxLossPercent = sanitizeNumber(opp.maxLossPercent, 100)
    const premiumPerContract = sanitizeNumber(opp.premium, 0)
    const maxLossAmount = sanitizeNumber(opp.maxLossAmount, premiumPerContract)
    const potentialReturn = sanitizeNumber(opp.potentialReturn, 0)
    const daysToExp = sanitizeNumber(opp.daysToExpiration, 0)

    let explanation = `This trade offers a potential return of ${potentialReturn.toFixed(1)}% on a 10% stock move, with a maximum possible return of ${maxReturn.toFixed(1)}%. `

    // Risk assessment
    if (maxLossPercent < 100) {
      explanation += `Your maximum loss is limited to ${maxLossPercent.toFixed(1)}% of your investment (${formatCurrency(maxLossAmount)} per contract). `
    } else {
      explanation += `Your maximum loss is ${maxLossPercent.toFixed(1)}% of your investment (${formatCurrency(maxLossAmount)} per contract). `
    }

    // Risk/Reward ratio
    const lossBasis = Math.max(Math.abs(maxLossPercent), 1)
    const computedShortTermRatio = lossBasis !== 0 ? potentialReturn / lossBasis : 0
    const computedAsymmetryRatio = lossBasis !== 0 ? maxReturn / lossBasis : 0
    const shortTermRatio = sanitizeNumber(opp.shortTermRiskRewardRatio, sanitizeNumber(computedShortTermRatio, 0))
    const asymmetryRatio = sanitizeNumber(opp.riskRewardRatio, sanitizeNumber(computedAsymmetryRatio, 0))
    if (shortTermRatio > 5) {
      explanation += `This creates an excellent near-term risk/reward ratio of ${shortTermRatio.toFixed(1)}:1 on a 10% move, meaning you could make ${shortTermRatio.toFixed(1)}x more than you could lose. `
    } else if (shortTermRatio > 2) {
      explanation += `This creates a good risk/reward ratio of ${shortTermRatio.toFixed(1)}:1, providing favorable odds even on a modest move. `
    } else {
      explanation += `This creates a risk/reward ratio of ${shortTermRatio.toFixed(1)}:1 on the first 10% move. `
    }

    if (asymmetryRatio >= 3) {
      explanation += `The max payoff is ${asymmetryRatio.toFixed(1)}x larger than the capital at risk, giving this setup major asymmetric upside if the stock really runs. `
    } else if (asymmetryRatio >= 1.5) {
      explanation += `There's still ${asymmetryRatio.toFixed(1)}x more upside than downside if the bigger move plays out. `
    }
    
    // Time considerations
    if (daysToExp <= 7) {
      explanation += `With only ${daysToExp} days left, this is a high-conviction trade that needs to work quickly. The short timeframe amplifies both profit potential and time decay risk.`
    } else if (daysToExp <= 30) {
      explanation += `With ${daysToExp} days until expiration, you have a reasonable timeframe for the trade to develop while managing time decay.`
    } else {
      explanation += `With ${daysToExp} days until expiration, you have plenty of time for the trade thesis to play out with lower time decay pressure.`
    }
    
    return explanation
  }

  const calculateInvestmentScenario = (opp: Opportunity, amount: number): InvestmentScenario => {
    const premiumPerContract = opp.premium || 0
    const contractCost = Math.max(premiumPerContract, 0)

    // Calculate per-contract returns with proper null/undefined handling
    const potentialReturnPercent = typeof opp.potentialReturn === 'number' && Number.isFinite(opp.potentialReturn) ? opp.potentialReturn : 0
    const maxReturnPercent = typeof opp.maxReturn === 'number' && Number.isFinite(opp.maxReturn) ? opp.maxReturn : 0

    const perContractPotentialReturn = (typeof opp.potentialReturnAmount === 'number' && Number.isFinite(opp.potentialReturnAmount))
      ? opp.potentialReturnAmount
      : (potentialReturnPercent / 100) * contractCost

    const perContractMaxReturn = (typeof opp.maxReturnAmount === 'number' && Number.isFinite(opp.maxReturnAmount))
      ? opp.maxReturnAmount
      : (maxReturnPercent / 100) * contractCost

    const perContractMaxLoss = (typeof opp.maxLossAmount === 'number' && Number.isFinite(opp.maxLossAmount))
      ? opp.maxLossAmount
      : contractCost

    if (contractCost <= 0) {
      return {
        contractCost: 0,
        contractsToBuy: 0,
        totalCost: 0,
        remainingCapital: amount,
        requiredCapital: 0,
        shortfall: 0,
        displayCost: 0,
        basis: 'perContract',
        potentialReturnAmount: 0,
        potentialReturnAmountPerContract: 0,
        maxReturnAmount: 0,
        maxReturnAmountPerContract: 0,
        maxLossAmount: 0,
        maxLossAmountPerContract: 0,
        scenarios: [],
      }
    }

    const contractsToBuy = Math.max(Math.floor(amount / contractCost), 0)
    const totalCost = contractsToBuy * contractCost
    const remainingCapital = Math.max(amount - totalCost, 0)
    const basis: InvestmentScenario['basis'] = contractsToBuy > 0 ? 'position' : 'perContract'
    const displayCost = contractsToBuy > 0 ? totalCost : contractCost
    const requiredCapital = contractCost
    const shortfall = contractsToBuy > 0 ? 0 : Math.max(requiredCapital - amount, 0)

    const potentialReturnAmount = basis === 'position'
      ? perContractPotentialReturn * contractsToBuy
      : perContractPotentialReturn

    const maxReturnAmount = basis === 'position'
      ? perContractMaxReturn * contractsToBuy
      : perContractMaxReturn

    const maxLossAmount = basis === 'position'
      ? perContractMaxLoss * contractsToBuy
      : perContractMaxLoss

    const scenarioBase = basis === 'position' ? totalCost : contractCost

    const scenarios = (opp.returnsAnalysis || []).map((scenario) => {
      const percentReturn = typeof scenario?.return === 'number' && Number.isFinite(scenario.return) ? scenario.return : 0
      const profit = scenarioBase * (percentReturn / 100)
      return {
        move: scenario?.move || '',
        return: percentReturn,
        profit,
        totalValue: scenarioBase + profit,
      }
    })

    return {
      contractCost,
      contractsToBuy,
      totalCost,
      remainingCapital,
      requiredCapital,
      shortfall,
      displayCost,
      basis,
      potentialReturnAmount,
      potentialReturnAmountPerContract: perContractPotentialReturn,
      maxReturnAmount,
      maxReturnAmountPerContract: perContractMaxReturn,
      maxLossAmount,
      maxLossAmountPerContract: perContractMaxLoss,
      scenarios,
    }
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D]">
      {/* Scanner Controls - Robinhood-inspired dark design */}
      <div className="border-b border-zinc-800 bg-black shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between flex-wrap gap-6">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Tab Navigation */}
              <div className="flex items-center bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                <button
                  onClick={() => setActiveTab('options')}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    activeTab === 'options'
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Options
                </button>
                <button
                  onClick={() => setActiveTab('crypto')}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    activeTab === 'crypto'
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Crypto
                </button>
              </div>

              <div className="flex items-center gap-2 bg-zinc-900 px-4 py-2.5 rounded-lg border border-zinc-800">
                <span className="text-sm font-semibold text-emerald-500">$</span>
                <input
                  type="number"
                  value={investmentAmountInput}
                  onChange={(e) => setInvestmentAmountInput(e.target.value)}
                  className="w-28 text-base font-bold bg-transparent text-white focus:outline-none placeholder-zinc-500"
                  min="100"
                  max="100000"
                  step="100"
                />
              </div>

              <button
                onClick={() =>
                  activeTab === 'options' ? fetchOpportunities() : fetchCryptoAlerts()
                }
                disabled={activeTab === 'options' ? isLoading : cryptoLoading}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(activeTab === 'options' ? isLoading : cryptoLoading) ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white dark:border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                    Scanning...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Scan
                  </>
                )}
              </button>
              </div>
            </div>

          <div className="mt-4 flex items-center gap-4 flex-wrap text-sm">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold border ${
              isMarketOpen()
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isMarketOpen() ? 'bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50' : 'bg-zinc-600'
              }`}></div>
              {isMarketOpen() ? 'Market Open' : 'Market Closed'}
            </div>
            {lastSuccessfulUpdate && (
              <div className="text-zinc-400">
                Last scan: {lastSuccessfulUpdate.toLocaleTimeString()}
                {isStaleData && (
                  <span className="ml-2 px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs rounded-md font-semibold">
                    Cached
                  </span>
                )}
              </div>
            )}
            {showEnhancedStatus && (
              <div className="w-full mt-3">
                <div
                  className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                    enhancedResponseDetected
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-sky-500/30 bg-sky-500/10 text-sky-100'
                  }`}
                >
                  <svg className="mt-1 h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6l7 4v4c0 3-3 5-7 8-4-3-7-5-7-8v-4l7-4z" />
                  </svg>
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {enhancedResponseDetected ? 'Institutional scanner active' : 'Requesting institutional-grade analysis'}
                    </p>
                    <p
                      className={`text-sm leading-relaxed ${
                        enhancedResponseDetected ? 'text-emerald-100/80' : 'text-sky-100/80'
                      }`}
                    >
                      {enhancedResponseDetected
                        ? 'Results include enhanced probability calibration, advanced Greeks, and risk-adjusted filtering.'
                        : 'This institutional mode runs advanced modeling and can take up to 60 seconds to complete.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'options' && (fallbackActive || staleCacheActive) && (
              <div className="w-full mt-3 space-y-2">
                {fallbackActive && (
                  fallbackIsNoResults ? (
                    <div className="rounded-2xl border border-slate-300/70 bg-white/80 px-5 py-5 text-left text-slate-900 shadow-sm dark:border-slate-500/50 dark:bg-slate-800/60 dark:text-slate-100">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/10 text-slate-700 dark:bg-slate-700/60 dark:text-slate-100">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1016.65 16.65z" />
                          </svg>
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Institutional scan complete</p>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No institutional-grade matches yet</h3>
                          </div>
                          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                            {fallbackSearchSummary.description ??
                              'We completed the institutional-grade scan but no opportunities satisfied the risk and quality thresholds. The criteria are working as intended.'}
                          </p>
                          {fallbackDetails && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">Details: {fallbackDetails}</p>
                          )}
                          {fallbackSearchSummary.entries.length > 0 && (
                            <dl className="mt-2 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                              {fallbackSearchSummary.entries.map(({ label, value }) => (
                                <div key={label} className="space-y-1">
                                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500/80 dark:text-slate-300/80">
                                    {label}
                                  </dt>
                                  <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-100">
                      <svg className="mt-1 h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="space-y-1">
                        <p className="font-semibold">Fallback recommendations</p>
                        <p className="text-sm leading-relaxed text-amber-100/80">
                          Live scanning failed{fallbackReason ? ` (${fallbackReason})` : ''}, so we are surfacing the diagnostic details we captured from the scanner run.
                          Expect pricing and probabilities to deviate from current market conditions until a fresh scan succeeds.
                        </p>
                        {fallbackDetails && (
                          <p className="text-xs text-amber-100/70">Details: {fallbackDetails}</p>
                        )}
                        {fallbackDebugInfo && Object.keys(fallbackDebugInfo).length > 0 && (
                          <div className="mt-2 space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                              Debug information
                            </p>
                            <dl className="space-y-2">
                              {Object.entries(fallbackDebugInfo).map(([key, value]) => {
                                const normalized = normalizeDebugValue(value)
                                const isMultiline = typeof normalized === 'string' && /\n/.test(normalized)
                                return (
                                  <div key={key} className="space-y-1">
                                    <dt className="text-[10px] font-medium uppercase tracking-wide text-amber-200/70">
                                      {formatDebugKey(key)}
                                    </dt>
                                    <dd>
                                      {isMultiline ? (
                                        <pre className="max-h-48 overflow-auto rounded-md border border-amber-500/20 bg-amber-500/10 p-2 font-mono text-[11px] leading-relaxed text-amber-100/90 whitespace-pre-wrap break-words">
                                          {normalized}
                                        </pre>
                                      ) : (
                                        <span className="font-mono text-[12px] text-amber-100/90 break-words">
                                          {normalized}
                                        </span>
                                      )}
                                    </dd>
                                  </div>
                                )
                              })}
                            </dl>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
                {staleCacheActive && (
                  <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-yellow-100">
                    <svg className="mt-1 h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
                    </svg>
                    <div className="space-y-1">
                      <p className="font-semibold">Using cached market data</p>
                      <p className="text-sm leading-relaxed text-yellow-100/80">
                        Live data sources were unavailable, so these results come from cached quotes
                        {cacheAgeDescription ? ` that are roughly ${cacheAgeDescription} old` : ''}. Please confirm pricing before trading.
                      </p>
                      {cacheTimestamp && (
                        <p className="text-xs text-yellow-100/70">Last cache update: {cacheTimestamp.toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
                </div>
                </div>
              </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Scan Progress */}
        <RealTimeProgress
          isScanning={isLoading || cryptoLoading}
          scanType={activeTab}
          onScanComplete={(results) => {
            console.log('Scan completed with results:', results)
          }}
        />

        {/* Loading State - Monty the Money Printer Piggy! */}
        {isLoading && <MontyLoading />}

        {/* Stats Cards - Robinhood-inspired dark design (hidden while loading) */}
        {!isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
            <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 hover:border-zinc-700 transition-colors">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Scanned</p>
                <p className="text-2xl font-bold text-white">{totalEvaluated}</p>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 hover:border-emerald-500/30 transition-colors">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Found</p>
                <p className="text-2xl font-bold text-emerald-400">{opportunities.length}</p>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 hover:border-red-500/30 transition-colors">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">High Score</p>
                <p className="text-2xl font-bold text-red-400">{opportunities.filter(o => o.score >= 90).length}</p>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 hover:border-orange-500/30 transition-colors">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Volume</p>
                <p className="text-2xl font-bold text-orange-400">{opportunities.filter(o => o.volumeRatio > 2).length}</p>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 hover:border-blue-500/30 transition-colors">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Catalysts</p>
                <p className="text-2xl font-bold text-blue-400">{opportunities.filter(o => o.catalysts && o.catalysts.length > 0).length}</p>
              </div>
            </div>
          </div>
        )}

        {isRelaxedMode && !isLoading && !fallbackActive && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-left text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-200">
                  Relaxed Filters Active
                </p>
                <p className="text-sm leading-relaxed">
                  {relaxedAppliedDescription
                    ? `We widened the ${relaxedAppliedDescription} to surface additional setups.`
                    : 'We widened the filters to surface additional setups.'}
                  {relaxedCandidateCount !== null
                    ? ` Up to ${relaxedCandidateCount.toLocaleString()} candidates satisfied the relaxed criteria.`
                    : ''}
                </p>
                {relaxedStageSummaries.length > 0 && (
                  <ul className="space-y-1 text-xs leading-relaxed text-amber-800 dark:text-amber-100/80">
                    {relaxedStageSummaries.map(({ stage, candidates, reason, blocked }, index) => {
                      const candidateLabel =
                        typeof candidates === 'number'
                          ? ` (${candidates.toLocaleString()} candidate${candidates === 1 ? '' : 's'})`
                          : ''
                      const blockedLabel =
                        blocked === 'stale_snapshot'
                          ? ' — blocked until a fresh market snapshot is available'
                          : blocked
                            ? ` — ${blocked.replace(/_/g, ' ')}`
                            : ''
                      return (
                        <li key={`${stage}-${index}`} className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                          <span className="font-medium">{stage}:</span>
                          <span>
                            {reason || 'Available under relaxed criteria'}
                            {candidateLabel}
                            {blockedLabel}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center justify-start">
                <button
                  onClick={() => fetchOpportunities('strict')}
                  className="inline-flex items-center rounded-full border border-amber-400/60 bg-white px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100 dark:border-amber-500/60 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-500/20"
                >
                  Return to Strict Filters
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && opportunities.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No strong opportunities found</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {totalEvaluated > 0
                ? `Scanned ${totalEvaluated.toLocaleString()} options but found 0 strong opportunities meeting our criteria.`
                : "The scanner is currently running but hasn't found any high-scoring opportunities yet."}
            </p>
            {relaxedSuggestionAvailable && (
              <div className="mx-auto mb-6 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-left text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-200">
                  Relax filters to review more setups
                </p>
                <p className="mt-2 text-sm leading-relaxed">
                  {relaxedCandidateCount !== null
                    ? `Our strict criteria filtered out ${relaxedCandidateCount.toLocaleString()} candidates that meet the relaxed thresholds.`
                    : 'Our strict criteria filtered out additional candidates that meet the relaxed thresholds.'}
                </p>
                {relaxedStageSummaries.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs leading-relaxed text-amber-800 dark:text-amber-100/80">
                    {relaxedStageSummaries.map(({ stage, candidates, reason, blocked }, index) => {
                      const candidateLabel =
                        typeof candidates === 'number'
                          ? ` (${candidates.toLocaleString()} candidate${candidates === 1 ? '' : 's'})`
                          : ''
                      const blockedLabel =
                        blocked === 'stale_snapshot'
                          ? ' — waiting for a fresh market snapshot'
                          : blocked
                            ? ` — ${blocked.replace(/_/g, ' ')}`
                            : ''
                      return (
                        <li key={`${stage}-${index}`}>
                          <span className="font-medium">{stage}:</span>{' '}
                          <span>
                            {reason || 'Available under relaxed filters'}
                            {candidateLabel}
                            {blockedLabel}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {relaxedSuggestionAvailable && (
                <button
                  onClick={() => fetchOpportunities('relaxed')}
                  className="w-full px-6 py-3 rounded-2xl bg-amber-500 text-white font-medium shadow-sm transition hover:bg-amber-400 dark:bg-amber-400 dark:text-slate-900 dark:hover:bg-amber-300 sm:w-auto"
                >
                  Widen Filters
                </button>
              )}
              <button
                onClick={() => (relaxedSuggestionAvailable ? fetchOpportunities('strict') : fetchOpportunities())}
                className="w-full px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-medium hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors sm:w-auto"
              >
                {relaxedSuggestionAvailable ? 'Rescan with Strict Filters' : 'Scan Again'}
              </button>
            </div>
          </div>
        )}

        {/* Opportunities Grid - Fabric-inspired card design */}
        {!isLoading && opportunities.length > 0 && (
          <div className="space-y-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                  Trading Opportunities
                </h2>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {sortedOpportunities.length} opportunities found
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="opportunity-sort"
                  className="text-sm font-medium text-slate-600 dark:text-slate-300"
                >
                  Sort by
                </label>
                <select
                  id="opportunity-sort"
                  value={sortOption}
                  onChange={(event) => {
                    const newSort = event.target.value as OpportunitySortOption
                    console.log('Sort changed to:', newSort)
                    setSortOption(newSort)
                  }}
                  className="rounded-2xl border-2 border-slate-900 dark:border-white bg-white px-4 py-2 text-sm font-medium text-slate-900 dark:text-white shadow-sm transition-all hover:shadow-md focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:bg-slate-800 dark:focus:border-white dark:focus:ring-white/20 cursor-pointer"
                >
                  {availableSortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ({sortedOpportunities.length} shown)
                </span>
              </div>
            </div>

            <div className="space-y-5">
              {sortedOpportunities.map((opp) => {
                const cardId = `${opp.symbol}-${opp.strike}-${opp.expiration}-${opp.optionType}`
                const riskBadgeClass = opp.riskLevel ? getRiskColor(opp.riskLevel) : null
                const extras = {
                  isExpanded: expandedCards[cardId] ?? false,
                  onToggle: () => toggleCard(cardId),
                  riskBadgeClass,
                  scoreBadgeClass: getScoreColor(opp.score),
                  breakevenRequirement: formatBreakevenRequirement(opp),
                  riskRewardExplanation: getRiskRewardExplanation(opp),
                  greeksExplanation: getGreeksExplanation(opp),
                  moveThesis: renderMoveThesis(opp),
                }

                return renderOpportunityCard(
                  opp,
                  investmentAmount ?? 0,
                  calculateInvestmentScenario,
                  formatCurrency,
                  safeToFixed,
                  extras,
                )
              })}
            </div>
          </div>
        )}

        {/* Crypto Alerts Section */}
        {activeTab === 'crypto' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                Crypto Market Alerts
              </h2>
              <button
                onClick={fetchCryptoAlerts}
                disabled={cryptoLoading}
                className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-medium hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                {cryptoLoading ? 'Scanning...' : 'Scan Crypto'}
              </button>
            </div>

            {cryptoLoading && (
              <div className="text-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-slate-300 border-t-slate-900 rounded-full mx-auto mb-4"></div>
                <p className="text-slate-600 dark:text-slate-400">
                  Scanning crypto markets for optimal entry points...
                </p>
              </div>
            )}

            {!cryptoLoading && cryptoAlerts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-slate-600 dark:text-slate-400">
                  No crypto alerts available. Click &ldquo;Scan Crypto&rdquo; to analyze current market conditions.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cryptoAlerts.map((alert, index) => (
                <div
                  key={index}
                  className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 hover:shadow-lg transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      {alert.symbol}
                    </h3>
                    <span className={`px-3 py-1 rounded-lg text-sm font-bold ${
                      alert.action === 'BUY'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                        : alert.action === 'SELL'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {alert.action}
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Price:</span>
                      <span className="font-medium">${alert.current_price.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Confidence:</span>
                      <span className="font-bold text-emerald-600">{alert.confidence}/10</span>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400 block mb-1">Strategy:</span>
                      <p className="text-sm text-slate-900 dark:text-white">{alert.strategy}</p>
                    </div>
                    {alert.allocation && (
                      <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-slate-600 dark:text-slate-400 text-sm">Portfolio Move</span>
                          <span
                            className={`px-3 py-1 rounded-lg text-xs font-semibold ${getAllocationBadgeClasses(alert.allocation.action)}`}
                          >
                            {formatAllocationAction(alert.allocation.action)}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                          <div className="flex justify-between">
                            <span>Suggested change:</span>
                            <span className="font-medium">
                              {alert.allocation.suggested_change_percent >= 0 ? '+' : ''}
                              {alert.allocation.suggested_change_percent.toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Target allocation:</span>
                            <span className="font-medium">
                              {alert.allocation.target_allocation_percent.toFixed(2)}%
                            </span>
                          </div>
                          {alert.allocation.usdc_reallocation_percent > 0 && (
                            <div className="text-xs text-slate-600 dark:text-slate-400">
                              Move {alert.allocation.usdc_reallocation_percent.toFixed(2)}% into USDC to preserve capital.
                            </div>
                          )}
                        </div>
                        {alert.allocation.rationale.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400 list-disc list-inside">
                            {alert.allocation.rationale.slice(0, 3).map((reason, rationaleIndex) => (
                              <li key={rationaleIndex}>{reason}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
