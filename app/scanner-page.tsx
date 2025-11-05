'use client'

import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import RealTimeProgress from '../components/real-time-progress'
import { MontyLoading } from '../components/monty-loading'
import { MarketHoursBanner } from '../components/market-hours-banner'
import FirstScanIntro from '../components/onboarding/FirstScanIntro'
import WelcomeSetup from '../components/onboarding/WelcomeSetup'
import { TradeChat } from '@/components/trade-chat'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'
import type { PositionSizingRecommendation } from '@/lib/types/opportunity'
import { useWatchlist } from '@/components/watchlist-context'
import { CustomScannerFilters, type CustomFilterCriteria } from '@/components/custom-scanner-filters'
import { useScanContext } from '@/contexts/scan-context'
import { ScanSearch, CheckCircle2, Clock, RotateCw, ArrowRight, ChevronRight } from 'lucide-react'

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

interface EnhancedBacktestResult {
  winRate: number
  avgReturn: number
  sharpeRatio: number
  maxDrawdown: number
  similarTradesFound: number
  summary: string
  confidence: 'high' | 'medium' | 'low'
}

interface EnhancedHistoricalResult {
  requiredMove: number
  historicalFrequency: number
  recentExamples: Array<{ date: string; move: string; achieved: boolean }>
  direction: 'up' | 'down'
  summary: string
  confidence: 'high' | 'medium' | 'low'
}

type OpportunitySortOption =
  | 'promising'
  | 'riskReward'
  | 'probability'
  | 'maxReturn'
  | 'safety'
  | 'expiration'
  | 'kellyFraction'

const FIRST_SCAN_COMPLETED_KEY = 'scanner:firstScanComplete'

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

const normalizeSymbolList = (symbols: string[]) => {
  const seen = new Set<string>()
  const normalized: string[] = []

  symbols.forEach((symbol) => {
    const cleaned = symbol.trim().toUpperCase()
    if (!cleaned || seen.has(cleaned)) {
      return
    }
    seen.add(cleaned)
    normalized.push(cleaned)
  })

  return normalized
}

const renderSymbolChips = (symbols: string[], limit = 12, variant: 'scanned' | 'requested' | 'upcoming' | 'outstanding' = 'scanned'): ReactNode => {
  if (!symbols.length) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No symbols available.</p>
  }

  const displaySymbols = symbols.slice(0, limit)
  const remainder = Math.max(symbols.length - displaySymbols.length, 0)

  // Define variant-specific styles
  const variantStyles = {
    scanned: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-300/50 text-emerald-700 dark:from-emerald-500/20 dark:to-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300',
    requested: 'bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-300/50 text-blue-700 dark:from-blue-500/20 dark:to-blue-500/10 dark:border-blue-500/30 dark:text-blue-300',
    upcoming: 'bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-300/50 text-purple-700 dark:from-purple-500/20 dark:to-purple-500/10 dark:border-purple-500/30 dark:text-purple-300',
    outstanding: 'bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-300/50 text-amber-700 dark:from-amber-500/20 dark:to-amber-500/10 dark:border-amber-500/30 dark:text-amber-300',
  }

  return (
    <div className="flex flex-wrap gap-2">
      {displaySymbols.map(symbol => (
        <span
          key={symbol}
          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition-all hover:shadow-md hover:scale-105 ${variantStyles[variant]}`}
        >
          {symbol}
        </span>
      ))}
      {remainder > 0 && (
        <span className="inline-flex items-center rounded-lg border border-slate-300/50 bg-gradient-to-br from-slate-100 to-slate-200/50 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-600/50 dark:from-slate-700/50 dark:to-slate-700/30 dark:text-slate-300">
          +{remainder} more
        </span>
      )}
    </div>
  )
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
  bid: number
  ask: number
  volume: number
  openInterest: number
  impliedVolatility: number
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
  _fallback?: boolean
  _fallbackReason?: string
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

interface RotationStateMetadata {
  mode?: string
  position?: number
  order?: string[]
  seed?: number
  [key: string]: unknown
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
  rotationState?: RotationStateMetadata | Record<string, unknown> | null
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
            <div className="text-xs text-slate-700 dark:text-slate-200 mb-1">Stock Price Move</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              {stockPricePercent >= 0 ? '+' : ''}{stockPricePercent.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300">
              ${stockPrice.toFixed(2)} → ${targetStockPrice.toFixed(2)} ({dollarMove >= 0 ? '+' : ''}${dollarMove.toFixed(2)})
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-700 dark:text-slate-200 mb-1">Profit/Loss</div>
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
            <span className="text-slate-700 dark:text-slate-200">Option Value</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              ${optionValue.toFixed(2)}/share (${currentValue.toFixed(2)} total)
            </span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-slate-700 dark:text-slate-200">Cost Basis</span>
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
      onAddToWatchlist: () => void
      isOnWatchlist: boolean
      onRejectOpportunity: () => void
      isRejected: boolean
      onOpenChat: () => void
      loadingBacktest: boolean
      enhancedBacktest: EnhancedBacktestResult | null
      onRunBacktest: () => void
      loadingHistorical: boolean
      enhancedHistorical: EnhancedHistoricalResult | null
      onRunHistorical: () => void
    }
  ) => {
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
      onAddToWatchlist,
      isOnWatchlist: isAlreadyOnWatchlist,
      onRejectOpportunity,
      isRejected: isAlreadyRejected,
      onOpenChat,
      loadingBacktest,
      enhancedBacktest,
      onRunBacktest,
      loadingHistorical,
      enhancedHistorical,
      onRunHistorical,
    } = extras

  const normalizedRiskLabel = opp.riskLevel
    ? opp.riskLevel.charAt(0).toUpperCase() + opp.riskLevel.slice(1)
    : null

  return (
    <div
      key={`${opp.symbol}-${opp.strike}-${opp.expiration}-${opp.optionType}`}
      className="modern-card p-6"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="space-y-4 flex-1">
          {/* Critical Trade Info - Prominent at Top */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="space-y-0.5">
                <div className="text-3xl font-bold metallic-accent">{opp.symbol}</div>
                {(() => {
                  // Simple company name mapping - can be expanded or fetched from API later
                  const companyNames: Record<string, string> = {
                    'AAPL': 'Apple Inc.',
                    'MSFT': 'Microsoft Corporation',
                    'GOOGL': 'Alphabet Inc.',
                    'GOOG': 'Alphabet Inc.',
                    'AMZN': 'Amazon.com Inc.',
                    'NVDA': 'NVIDIA Corporation',
                    'TSLA': 'Tesla Inc.',
                    'META': 'Meta Platforms Inc.',
                    'BRK.B': 'Berkshire Hathaway Inc.',
                    'V': 'Visa Inc.',
                    'JPM': 'JPMorgan Chase & Co.',
                    'WMT': 'Walmart Inc.',
                    'MA': 'Mastercard Inc.',
                    'PG': 'Procter & Gamble Co.',
                    'XOM': 'Exxon Mobil Corporation',
                    'JNJ': 'Johnson & Johnson',
                    'CVX': 'Chevron Corporation',
                    'HD': 'The Home Depot Inc.',
                    'BAC': 'Bank of America Corp.',
                    'ABBV': 'AbbVie Inc.',
                    'PFE': 'Pfizer Inc.',
                    'KO': 'The Coca-Cola Company',
                    'COST': 'Costco Wholesale Corp.',
                    'AVGO': 'Broadcom Inc.',
                    'MRK': 'Merck & Co. Inc.',
                    'PEP': 'PepsiCo Inc.',
                    'TMO': 'Thermo Fisher Scientific',
                    'CSCO': 'Cisco Systems Inc.',
                    'AMD': 'Advanced Micro Devices',
                    'NFLX': 'Netflix Inc.',
                    'ADBE': 'Adobe Inc.',
                    'NKE': 'Nike Inc.',
                    'INTC': 'Intel Corporation',
                    'DIS': 'The Walt Disney Company',
                    'CRM': 'Salesforce Inc.',
                    'ORCL': 'Oracle Corporation',
                    'QCOM': 'Qualcomm Inc.',
                    'COIN': 'Coinbase Global Inc.',
                    'UBER': 'Uber Technologies Inc.',
                    'LYFT': 'Lyft Inc.',
                    'SNAP': 'Snap Inc.',
                    'SPOT': 'Spotify Technology',
                    'SQ': 'Block Inc.',
                    'PYPL': 'PayPal Holdings Inc.',
                    'SHOP': 'Shopify Inc.',
                    'ABNB': 'Airbnb Inc.',
                    'RBLX': 'Roblox Corporation',
                    'PLTR': 'Palantir Technologies',
                    'SNOW': 'Snowflake Inc.',
                    'DKNG': 'DraftKings Inc.',
                    'SPY': 'S&P 500 ETF',
                    'QQQ': 'Nasdaq-100 ETF',
                    'IWM': 'Russell 2000 ETF',
                    'DIA': 'Dow Jones ETF',
                  }
                  const companyName = companyNames[opp.symbol]
                  if (companyName) {
                    return <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">{companyName}</div>
                  }
                  return null
                })()}
              </div>
              <div className="text-2xl font-bold text-white">${opp.strike}</div>
              <div className="px-3 py-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-lg text-base font-bold">
                {opp.optionType.toUpperCase()}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 dark:text-slate-500">Contract Premium:</span>
                <span className="font-mono font-semibold text-white text-base">
                  ${opp.premium.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 dark:text-slate-500">Expires:</span>
                <span className="font-semibold text-white">
                  {opp.expiration}
                  {(() => {
                    const daysUntilExp = Math.ceil((new Date(opp.expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    if (daysUntilExp > 0) {
                      return <span className="ml-1.5 text-slate-400">({daysUntilExp}d)</span>
                    }
                    return null
                  })()}
                </span>
              </div>
              {opp.breakevenPrice && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 dark:text-slate-500">Breakeven:</span>
                  <span className="font-mono font-semibold text-white">
                    ${opp.breakevenPrice.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Secondary Badges */}
          <div className="flex items-center gap-2 flex-wrap">
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
              const confidencePercent = confidence <= 1 ? confidence * 100 : confidence
              return (
                <div className={`px-3 py-1 rounded-lg text-xs font-bold border ${colorClass}`}>
                  {direction.toUpperCase()} {confidence > 0 && `(${confidencePercent.toFixed(0)}%)`}
                </div>
              )
            })()}
            {opp.volumeRatio && opp.volumeRatio >= 2 && (
              <div className="px-3 py-1 rounded-lg text-xs font-bold border bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800" title={`Volume is ${opp.volumeRatio.toFixed(1)}x normal - unusual options activity detected`}>
                🔥 UOA {opp.volumeRatio.toFixed(1)}x
              </div>
            )}
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
            {'enhancedScore' in opp && typeof (opp as Record<string, unknown>).enhancedScore === 'number' && (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-blue-500 to-purple-500 text-white border border-blue-600 dark:border-purple-600 shadow-sm" title={`Enhanced Score: ${((opp as Record<string, unknown>).enhancedScore as number).toFixed(1)}/100
Technical: ${((opp as Record<string, unknown>).technicalScore as number | undefined)?.toFixed(1) || 'N/A'}
Probability: ${((opp as Record<string, unknown>).probabilityScore as number | undefined)?.toFixed(1) || 'N/A'}
Risk/Reward: ${((opp as Record<string, unknown>).riskRewardScore as number | undefined)?.toFixed(1) || 'N/A'}
Liquidity: ${((opp as Record<string, unknown>).liquidityScore as number | undefined)?.toFixed(1) || 'N/A'}`}>
                ⭐ Enhanced {((opp as Record<string, unknown>).enhancedScore as number).toFixed(0)}
              </span>
            )}
            {'strategyType' in opp && (
              <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${(opp as Record<string, unknown>).strategyType === 'directional' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800'}`}>
                {String((opp as Record<string, unknown>).strategyType).toUpperCase()}
              </span>
            )}
            {positionSizing && (positionSizing.recommendedFraction === 0 || (positionSizing.recommendedFraction && positionSizing.recommendedFraction < 0.01)) && (
              <span className="px-3 py-1 rounded-lg text-xs font-bold border-2 border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
                ⚠️ HIGH RISK
              </span>
            )}
            {opp._fallback && (
              <span className="px-3 py-1 rounded-lg text-xs font-bold border-2 border-blue-400 bg-blue-100 text-blue-800 dark:border-blue-600 dark:bg-blue-900/40 dark:text-blue-300" title={opp._fallbackReason || "Close to passing filters"}>
                ℹ️ FALLBACK
              </span>
            )}
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

          {/* Monty's Takeaway - Quant Insights */}
          {(() => {
            const bias = opp.enhancedDirectionalBias || opp.directionalBias
            const direction = bias?.direction || 'neutral'
            const moveDirection = opp.optionType === 'call' ? 'up' : 'down'
            const breakevenMove = opp.breakevenPrice
              ? ((opp.optionType === 'call'
                  ? (opp.breakevenPrice - opp.stockPrice) / opp.stockPrice
                  : (opp.stockPrice - opp.breakevenPrice) / opp.stockPrice) * 100)
              : 0
            const premiumPerContract = opp.premium

            // Quant metrics
            const delta = opp.greeks?.delta || 0
            const leverage = delta !== 0 ? (opp.stockPrice / (opp.premium / 100)) * Math.abs(delta) : 0
            const profitPerDollarMove = Math.abs(delta) * 100 // Delta * 100 shares
            const volOIRatio = opp.openInterest ? opp.volume / opp.openInterest : 0
            const daysToExp = Math.ceil((new Date(opp.expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            const thetaDaily = opp.greeks?.theta || 0
            const thetaCost = Math.abs(thetaDaily) * 100 // Per contract daily decay

            // Generate insights
            const insights = []

            // Leverage insight
            if (leverage > 0) {
              insights.push(`${leverage.toFixed(1)}x leverage - you'll make ~$${profitPerDollarMove.toFixed(0)} for every $1 the stock moves ${moveDirection}`)
            }

            // Volume/positioning insight
            if (volOIRatio >= 1) {
              insights.push(`Heavy institutional flow today (${volOIRatio.toFixed(1)}x volume/OI ratio) - smart money is actively positioning`)
            } else if (volOIRatio >= 0.5) {
              insights.push(`Healthy volume suggests growing interest in this strike`)
            } else if (volOIRatio > 0) {
              insights.push(`Light volume - position carefully, spreads may be wide`)
            }

            // Time decay insight
            if (thetaCost > 10 && daysToExp < 14) {
              insights.push(`Burning $${thetaCost.toFixed(0)}/day in theta - time is expensive here`)
            } else if (thetaCost > 5) {
              insights.push(`Theta decay: $${thetaCost.toFixed(0)}/day`)
            }

            // IV/volatility insight (if available)
            if (opp.impliedVolatility && opp.impliedVolatility > 0.5) {
              insights.push(`High IV (${(opp.impliedVolatility * 100).toFixed(0)}%) - market expects big swings`)
            } else if (opp.impliedVolatility && opp.impliedVolatility < 0.2) {
              insights.push(`Low IV (${(opp.impliedVolatility * 100).toFixed(0)}%) - cheap premium but expecting quiet action`)
            }

            return (
              <>
                <div className="rounded-lg bg-blue-500/10 dark:bg-blue-500/5 p-3 text-sm border border-blue-500/20">
                  <p className="font-semibold text-blue-400 dark:text-blue-300 mb-1.5">Monty's takeaway</p>
                  <ul className="text-slate-200 dark:text-slate-300 leading-relaxed space-y-1">
                    {insights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-blue-400 dark:text-blue-300 mt-0.5">•</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Simplified Metric Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="rounded-md border border-border/60 bg-muted/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stock Price</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">${opp.stockPrice.toFixed(2)}</p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-muted/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Premium/Share</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">${(opp.premium / 100).toFixed(2)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">${premiumPerContract.toFixed(2)} per contract (100 shares)</p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-muted/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Breakeven Move</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{Math.abs(breakevenMove).toFixed(1)}% {moveDirection}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Needs ${opp.breakevenPrice?.toFixed(2) || 'N/A'}</p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-muted/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Volume / Open Interest</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {opp.volume ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(opp.volume) : 'N/A'}
                      {' / '}
                      {opp.openInterest ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(opp.openInterest) : 'N/A'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {opp.openInterest ? (() => {
                        const ratio = opp.volume / opp.openInterest
                        const volume = opp.volume
                        if (ratio >= 1) return 'Heavy flow today'
                        if (ratio >= 0.5) return 'Healthy activity'
                        if (volume >= 500) return 'Moderate volume'
                        return 'Light volume'
                      })() : 'Contracts traded today'}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-muted/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Risk per Contract</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">${premiumPerContract.toFixed(2)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Max loss if trade fails</p>
                  </div>
                </div>
              </>
            )
          })()}
        </div>

        {/* Action Buttons - Top Right */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onOpenChat}
            className="inline-flex items-center gap-2 rounded-full border-2 border-transparent bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2 text-sm font-bold uppercase tracking-wide text-white shadow-lg transition-all hover:shadow-xl hover:scale-105 dark:from-blue-500 dark:to-purple-500"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Ask Monty
          </button>

          <button
            type="button"
            onClick={onAddToWatchlist}
            disabled={isAlreadyOnWatchlist}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide shadow-sm transition-colors ${
              isAlreadyOnWatchlist
                ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 cursor-not-allowed'
                : 'border border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 dark:border-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700'
            }`}
          >
            {isAlreadyOnWatchlist ? (
              <>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                On Watchlist
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add to Watchlist
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onRejectOpportunity}
            disabled={isAlreadyRejected}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide shadow-sm transition-colors ${
              isAlreadyRejected
                ? 'border border-slate-300 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
                : 'border border-red-400 bg-white text-red-600 hover:bg-red-50 dark:border-red-600 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-slate-700'
            }`}
          >
            {isAlreadyRejected ? (
              <>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Rejected
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Reject
              </>
            )}
          </button>
        </div>
      </div>

      {/* See Data Behind This - Collapsible Advanced Details */}
      <div className="mt-4">
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600/50 transition-colors"
            >
              {isExpanded ? 'Hide full data' : 'See data behind this'}
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : 'rotate-0'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

          {isExpanded && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 space-y-4">
              <div>
                <h5 className="text-sm font-semibold text-foreground mb-3">Greeks in plain English</h5>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {opp.greeks && (
                    <>
                      <div className="rounded-md border border-border/60 bg-background p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delta</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                          {opp.greeks.delta?.toFixed(2) || 'N/A'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">How much the option moves if the stock changes by $1.</p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-background p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gamma</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                          {opp.greeks.gamma?.toFixed(3) || 'N/A'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">How quickly delta itself can change as the stock moves.</p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-background p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Theta</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                          {opp.greeks.theta?.toFixed(2) || 'N/A'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Daily time decay — what you pay to hold the contract.</p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-background p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vega</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                          {opp.greeks.vega?.toFixed(2) || 'N/A'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Sensitivity to volatility. Higher vega likes bigger swings.</p>
                      </div>
                      <div className="rounded-md border border-border/60 bg-background p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">IV</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                          {opp.impliedVolatility ? (opp.impliedVolatility * 100).toFixed(1) + '%' : 'N/A'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Implied volatility shows what the market expects for movement.</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {greeksExplanation && (
                <div className="rounded-md bg-background p-4 text-sm text-muted-foreground">
                  {greeksExplanation}
                </div>
              )}
            </div>
          )}
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
                  {positionSizing.expectedEdge !== undefined && positionSizing.expectedEdge < 0 ? (
                    <>
                      <h5 className="font-semibold text-amber-900 dark:text-amber-200 mb-1">Position Not Recommended</h5>
                      <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                        Kelly criterion analysis shows negative expected edge ({(positionSizing.expectedEdge * 100).toFixed(1)}%). The probability-adjusted mathematics suggest passing on this trade to preserve capital.
                      </p>
                    </>
                  ) : (
                    <>
                      <h5 className="font-semibold text-amber-900 dark:text-amber-200 mb-1">Very Small Position Size</h5>
                      <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                        Risk controls (volatility dampening, drawdown limits) have reduced this position to &lt;1% allocation despite positive edge. Consider carefully whether the setup justifies the tight sizing.
                      </p>
                    </>
                  )}
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

      <div className="mt-6 flex justify-end items-center gap-3">
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
            {!enhancedBacktest && (
              <section className="rounded-2xl border-2 border-dashed border-purple-300 bg-purple-50/40 p-5 text-center dark:border-purple-700 dark:bg-purple-900/10">
                <h4 className="text-base font-semibold text-purple-900 dark:text-purple-100">🎯 365-Day Backtest Available</h4>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  See how similar trades performed over the past year. Get win rate, average return, and confidence metrics.
                </p>
                <button
                  type="button"
                  onClick={onRunBacktest}
                  disabled={loadingBacktest}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {loadingBacktest ? 'Running backtest…' : '🔍 Run 365-Day Backtest'}
                </button>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Takes about 5–10 seconds</p>
              </section>
            )}

            {enhancedBacktest && (
              <section className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-purple-50/60 p-5 dark:border-purple-800 dark:from-purple-950/40 dark:via-slate-900 dark:to-purple-950/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-purple-900 dark:text-purple-100">🎯 365-Day Backtest Results</h4>
                    <p className="mt-2 text-sm text-purple-800 dark:text-purple-200 leading-relaxed">{enhancedBacktest.summary}</p>
                  </div>
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold ${
                      enhancedBacktest.confidence === 'high'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : enhancedBacktest.confidence === 'medium'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                    }`}
                  >
                    {enhancedBacktest.confidence.toUpperCase()} CONFIDENCE
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-purple-200 bg-white/80 p-4 text-left shadow-sm dark:border-purple-800 dark:bg-slate-900/60">
                    <div className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-300">Win Rate</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{enhancedBacktest.winRate.toFixed(0)}%</div>
                  </div>
                  <div className="rounded-xl border border-purple-200 bg-white/80 p-4 text-left shadow-sm dark:border-purple-800 dark:bg-slate-900/60">
                    <div className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-300">Avg Return</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                      {enhancedBacktest.avgReturn >= 0 ? '+' : ''}{enhancedBacktest.avgReturn.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-xl border border-purple-200 bg-white/80 p-4 text-left shadow-sm dark:border-purple-800 dark:bg-slate-900/60">
                    <div className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-300">Sharpe Ratio</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{enhancedBacktest.sharpeRatio.toFixed(2)}</div>
                  </div>
                  <div className="rounded-xl border border-purple-200 bg-white/80 p-4 text-left shadow-sm dark:border-purple-800 dark:bg-slate-900/60">
                    <div className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-300">Sample Size</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{enhancedBacktest.similarTradesFound}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">similar trades</div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={onRunBacktest}
                    disabled={loadingBacktest}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-purple-500 px-4 py-2 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-50 disabled:cursor-not-allowed dark:border-purple-400 dark:text-purple-200 dark:hover:bg-purple-900/30"
                  >
                    {loadingBacktest ? 'Refreshing…' : 'Refresh Backtest'}
                  </button>
                </div>
              </section>
            )}

            {!enhancedHistorical && (
              <section className="rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/40 p-5 text-center dark:border-blue-700 dark:bg-blue-950/10">
                <h4 className="text-base font-semibold text-blue-900 dark:text-blue-100">📊 Historical Price Patterns Available</h4>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Analyze how often similar price moves have occurred historically and review the most recent examples.
                </p>
                <button
                  type="button"
                  onClick={onRunHistorical}
                  disabled={loadingHistorical}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {loadingHistorical ? 'Analyzing history…' : '📈 Analyze Historical Patterns'}
                </button>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Takes about 3–5 seconds</p>
              </section>
            )}

            {enhancedHistorical && (
              <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-blue-50/60 p-5 dark:border-blue-800 dark:from-blue-950/40 dark:via-slate-900 dark:to-blue-950/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-blue-900 dark:text-blue-100">📊 Historical Pattern Analysis</h4>
                    <p className="mt-2 text-sm text-blue-800 dark:text-blue-200 leading-relaxed">{enhancedHistorical.summary}</p>
                  </div>
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold ${
                      enhancedHistorical.confidence === 'high'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : enhancedHistorical.confidence === 'medium'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                    }`}
                  >
                    {enhancedHistorical.confidence.toUpperCase()} CONFIDENCE
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-blue-200 bg-white/80 p-4 shadow-sm dark:border-blue-800 dark:bg-slate-900/60">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">Required Move</div>
                    <div className={`mt-1 text-2xl font-bold ${enhancedHistorical.direction === 'up' ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                      {enhancedHistorical.direction === 'up' ? '↗' : '↘'} {enhancedHistorical.requiredMove.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-white/80 p-4 shadow-sm dark:border-blue-800 dark:bg-slate-900/60">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">Historical Frequency</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{enhancedHistorical.historicalFrequency.toFixed(0)}%</div>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-white/80 p-4 shadow-sm dark:border-blue-800 dark:bg-slate-900/60">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">Recent Examples</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{enhancedHistorical.recentExamples.length}</div>
                  </div>
                </div>

                {enhancedHistorical.recentExamples.length > 0 && (
                  <div className="mt-4 rounded-xl border border-blue-100 bg-white/70 p-4 dark:border-blue-800 dark:bg-slate-900/60">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">Most Recent Occurrences</div>
                    <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                      {enhancedHistorical.recentExamples.slice(0, 3).map((example, index) => (
                        <li key={`${example.date}-${index}`} className="flex items-center justify-between">
                          <span>{new Date(example.date).toLocaleDateString()}</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ Hit {example.move} target</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={onRunHistorical}
                    disabled={loadingHistorical}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-500 px-4 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed dark:border-blue-400 dark:text-blue-200 dark:hover:bg-blue-900/30"
                  >
                    {loadingHistorical ? 'Refreshing…' : 'Refresh Historical Study'}
                  </button>
                </div>
              </section>
            )}

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
  const { addItem: addToWatchlist, isOnWatchlist } = useWatchlist()
  const { setScanResults } = useScanContext()
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [totalEvaluated, setTotalEvaluated] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [lastSuccessfulUpdate, setLastSuccessfulUpdate] = useState<Date | null>(null)
  const [investmentAmountInput, setInvestmentAmountInput] = useState('1000')
  const investmentAmount = useMemo(() => {
    if (investmentAmountInput.trim() === '') {
      return null
    }

    const parsed = Number(investmentAmountInput)
    return Number.isFinite(parsed) ? parsed : null
  }, [investmentAmountInput])
  const [sortOption, setSortOption] = useState<OpportunitySortOption>('promising')
  const [isStaleData, setIsStaleData] = useState(false)
  const [scanMetadata, setScanMetadata] = useState<ScanMetadata | null>(null)
  const [scanMode, setScanMode] = useState<FilterMode>('strict')
  const [relaxedScanMeta, setRelaxedScanMeta] = useState<RelaxedScanMetadata | null>(null)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})
  const [enhancedBacktests, setEnhancedBacktests] = useState<Record<string, EnhancedBacktestResult | null>>({})
  const [loadingBacktests, setLoadingBacktests] = useState<Record<string, boolean>>({})
  const [enhancedHistoricals, setEnhancedHistoricals] = useState<Record<string, EnhancedHistoricalResult | null>>({})
  const [loadingHistoricals, setLoadingHistoricals] = useState<Record<string, boolean>>({})
  const [showNotRecommended, setShowNotRecommended] = useState(false)
  const [chatOpportunity, setChatOpportunity] = useState<Opportunity | null>(null)
  const [rejectedOpportunities, setRejectedOpportunities] = useState<Set<string>>(new Set())
  const [rejectingOpportunity, setRejectingOpportunity] = useState<Opportunity | null>(null)
  const [rejectionNotes, setRejectionNotes] = useState('')
  const [hasCompletedFirstScan, setHasCompletedFirstScan] = useState<boolean | null>(null)
  const [isFirstScanIntroOpen, setIsFirstScanIntroOpen] = useState(false)
  const [isWelcomeSetupOpen, setIsWelcomeSetupOpen] = useState(false)
  const [targetSymbolInput, setTargetSymbolInput] = useState('')
  const [hotScanMode, setHotScanMode] = useState(false)
  const [earningsScanMode, setEarningsScanMode] = useState(false)
  const [volumeSurgeMode, setVolumeSurgeMode] = useState(false)
  const [layupsScanMode, setLayupsScanMode] = useState(false)
  const [uoaScanMode, setUoaScanMode] = useState(false)
  const opportunitiesRef = useRef<Opportunity[]>([])
  const scanModeRef = useRef<FilterMode>('strict')
  const userSettingsRef = useRef<UserSettingsRow | null>(null)
  const [userPortfolioConstraints, setUserPortfolioConstraints] = useState<{
    portfolioSize: number | null
    dailyContractBudget: number | null
  }>({
    portfolioSize: null,
    dailyContractBudget: null,
  })
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [prefilledInvestment, setPrefilledInvestment] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [customCriteria, setCustomCriteria] = useState<CustomFilterCriteria>({})

  // First scan tracking helpers
  const getLocalFirstScan = useCallback(() => {
    if (typeof window === 'undefined') {
      return false
    }

    try {
      return window.localStorage.getItem(FIRST_SCAN_COMPLETED_KEY) === 'true'
    } catch (storageError) {
      console.warn('Failed to read first scan completion flag from local storage', storageError)
      return false
    }
  }, [])

  const persistLocalFirstScan = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(FIRST_SCAN_COMPLETED_KEY, 'true')
    } catch (storageError) {
      console.warn('Failed to persist first scan completion flag locally', storageError)
    }
  }, [])

  const markFirstScanComplete = useCallback(async () => {
    persistLocalFirstScan()
    setHasCompletedFirstScan(true)

    if (!user?.id) {
      return
    }

    try {
      const supabase = createClient()
      await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            has_completed_first_scan: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .select()
        .maybeSingle<UserSettingsRow>()
    } catch (persistError) {
      console.error('Failed to persist first scan completion to Supabase', persistError)
    }
  }, [persistLocalFirstScan, user?.id])

  const dismissFirstScanIntro = useCallback(() => {
    setIsFirstScanIntroOpen(false)
    setHasCompletedFirstScan(true) // Update state immediately to prevent re-showing
    void markFirstScanComplete()
  }, [markFirstScanComplete])

  const handleWelcomeComplete = useCallback(async (data: {
    userName: string
    portfolioSize: number
    dailyBudget: number
  }) => {
    setIsWelcomeSetupOpen(false)

    // Update local state immediately
    setUserPortfolioConstraints({
      portfolioSize: data.portfolioSize,
      dailyContractBudget: data.dailyBudget,
    })

    // Update ref to prevent modal from showing again
    userSettingsRef.current = {
      ...userSettingsRef.current,
      user_name: data.userName,
      portfolio_size: data.portfolioSize,
      daily_contract_budget: data.dailyBudget,
    } as UserSettingsRow

    // Save to Supabase
    if (user?.id) {
      try {
        const response = await fetch('/api/user-settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_name: data.userName,
            portfolio_size: data.portfolioSize,
            daily_contract_budget: data.dailyBudget,
          }),
        })

        if (!response.ok) {
          console.error('Failed to save welcome setup data')
        } else {
          console.log('Welcome setup saved successfully')
        }
      } catch (error) {
        console.error('Error saving welcome setup data:', error)
      }
    }
  }, [user?.id])

  // Custom filtering logic
  const filteredOpportunities = useMemo(() => {
    // If no filters are set, return all opportunities
    const hasAnyFilter = Object.values(customCriteria).some(v => v !== undefined && v !== null)
    if (!hasAnyFilter) {
      return opportunities
    }

    // Apply custom filters
    return opportunities.filter((opp) => {
      // Volume filters
      if (customCriteria.minVolume && opp.volume < customCriteria.minVolume) return false
      if (customCriteria.minOpenInterest && opp.openInterest < customCriteria.minOpenInterest) return false

      // Spread filter
      if (customCriteria.maxSpreadPercent && opp.premium > 0) {
        const spread = (opp.ask - opp.bid) / (opp.premium / 100)
        if (spread > customCriteria.maxSpreadPercent) return false
      }

      // Delta filters
      if (customCriteria.minDelta && Math.abs(opp.greeks.delta) < customCriteria.minDelta) return false
      if (customCriteria.maxDelta && Math.abs(opp.greeks.delta) > customCriteria.maxDelta) return false

      // IV filters
      if (customCriteria.minIV && opp.impliedVolatility < customCriteria.minIV) return false
      if (customCriteria.maxIV && opp.impliedVolatility > customCriteria.maxIV) return false

      // DTE filters
      if (customCriteria.minDTE && opp.daysToExpiration < customCriteria.minDTE) return false
      if (customCriteria.maxDTE && opp.daysToExpiration > customCriteria.maxDTE) return false

      // Option type filter
      if (customCriteria.optionType && opp.optionType !== customCriteria.optionType) return false

      // Strike filters
      if (customCriteria.minStrike && opp.strike < customCriteria.minStrike) return false
      if (customCriteria.maxStrike && opp.strike > customCriteria.maxStrike) return false

      // Premium filters (premium is in dollars, not cents)
      const premiumInDollars = opp.premium / 100
      if (customCriteria.minPremium && premiumInDollars < customCriteria.minPremium) return false
      if (customCriteria.maxPremium && premiumInDollars > customCriteria.maxPremium) return false

      return true
    })
  }, [opportunities, customCriteria])

  const toggleCard = (cardId: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId],
    }))
  }

  const runBacktestEnhancement = useCallback(async (opp: Opportunity) => {
    const cardId = `${opp.symbol}-${opp.strike}-${opp.expiration}-${opp.optionType}`
    setLoadingBacktests(prev => ({
      ...prev,
      [cardId]: true,
    }))

    try {
      const response = await fetch('/api/enhance/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: opp.symbol,
          optionType: opp.optionType,
          strike: opp.strike,
          stockPrice: opp.stockPrice,
          premium: opp.premium,
          daysToExpiration: opp.daysToExpiration,
          impliedVolatility: opp.moveAnalysis?.impliedVol ?? null,
        }),
      })

      if (!response.ok) {
        throw new Error(`Backtest request failed with status ${response.status}`)
      }

      const data = await response.json()
      if (data?.success && data.backtest) {
        setEnhancedBacktests(prev => ({
          ...prev,
          [cardId]: data.backtest as EnhancedBacktestResult,
        }))
      }
    } catch (error) {
      console.error('Backtest enhancement failed:', error)
    } finally {
      setLoadingBacktests(prev => ({
        ...prev,
        [cardId]: false,
      }))
    }
  }, [])

  const runHistoricalEnhancement = useCallback(async (opp: Opportunity) => {
    const cardId = `${opp.symbol}-${opp.strike}-${opp.expiration}-${opp.optionType}`
    setLoadingHistoricals(prev => ({
      ...prev,
      [cardId]: true,
    }))

    try {
      const response = await fetch('/api/enhance/historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: opp.symbol,
          optionType: opp.optionType,
          strike: opp.strike,
          stockPrice: opp.stockPrice,
          premium: opp.premium,
          expiration: opp.expiration,
        }),
      })

      if (!response.ok) {
        throw new Error(`Historical request failed with status ${response.status}`)
      }

      const data = await response.json()
      if (data?.success && data.historical) {
        setEnhancedHistoricals(prev => ({
          ...prev,
          [cardId]: data.historical as EnhancedHistoricalResult,
        }))
      }
    } catch (error) {
      console.error('Historical enhancement failed:', error)
    } finally {
      setLoadingHistoricals(prev => ({
        ...prev,
        [cardId]: false,
      }))
    }
  }, [])

  const openRejectModal = useCallback((opp: Opportunity) => {
    setRejectingOpportunity(opp)
    setRejectionNotes('')
  }, [])

  const confirmRejectOpportunity = useCallback(async () => {
    if (!rejectingOpportunity) return

    const opp = rejectingOpportunity
    const cardId = `${opp.symbol}-${opp.strike}-${opp.expiration}-${opp.optionType}`

    // Add to rejected set
    setRejectedOpportunities(prev => new Set(prev).add(cardId))

    // Send to backend for tracking
    try {
      await fetch('/api/rejection-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'log',
          symbol: opp.symbol,
          strike: opp.strike,
          expiration: opp.expiration,
          optionType: opp.optionType,
          stockPrice: opp.stockPrice,
          premium: opp.premium,
          volume: opp.volume,
          openInterest: opp.openInterest,
          impliedVolatility: opp.impliedVolatility,
          delta: opp.greeks.delta,
          rejectionReason: 'user_manual_rejection',
          filterStage: 'user_review',
          rejectionSource: 'user_rejected',
          userNotes: rejectionNotes.trim() || null,
          scores: {
            probability_score: opp.probabilityOfProfit,
            risk_adjusted_score: opp.riskRewardRatio,
            quality_score: opp.score,
          }
        }),
      })
    } catch (error) {
      console.error('Failed to log rejection:', error)
    }

    // Close modal
    setRejectingOpportunity(null)
    setRejectionNotes('')
  }, [rejectingOpportunity, rejectionNotes])

  useEffect(() => {
    let isMounted = true

    const loadSettings = async () => {
      if (!user?.id) {
        if (isMounted) {
          // No user - check localStorage for first scan flag
          const localFirstScan = getLocalFirstScan()
          setHasCompletedFirstScan(localFirstScan)
          setSettingsLoaded(true)
        }
        return
      }

      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('user_settings')
          .select('portfolio_size, daily_contract_budget, has_completed_first_scan, user_name')
          .eq('user_id', user.id)
          .maybeSingle<UserSettingsRow>()

        if (!isMounted) {
          return
        }

        if (error && error.code !== 'PGRST116') {
          console.error('Failed to load user settings for scanner', error)
        }

        if (data) {
          userSettingsRef.current = data
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

          // Check if user needs welcome setup (no user_name means new user)
          const needsSetup = !data.user_name || data.user_name.trim() === ''
          if (needsSetup) {
            setIsWelcomeSetupOpen(true)
          }

          // Check first scan flag from database, fallback to localStorage
          const remoteFirstScan = data.has_completed_first_scan
          if (remoteFirstScan === null || remoteFirstScan === undefined) {
            const localFirstScan = getLocalFirstScan()
            setHasCompletedFirstScan(localFirstScan)
          } else {
            const completed = remoteFirstScan === true
            setHasCompletedFirstScan(completed)
            if (completed) {
              persistLocalFirstScan()
            }
          }
        } else {
          userSettingsRef.current = null
          setUserPortfolioConstraints({
            portfolioSize: null,
            dailyContractBudget: null,
          })
          // No user settings - new user needs setup
          setIsWelcomeSetupOpen(true)
          // No user settings - check localStorage
          const localFirstScan = getLocalFirstScan()
          setHasCompletedFirstScan(localFirstScan)
        }
      } catch (settingsError) {
        if (isMounted) {
          console.error('Error fetching user settings for scanner', settingsError)
          // On error, fallback to localStorage
          const localFirstScan = getLocalFirstScan()
          setHasCompletedFirstScan(localFirstScan)
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
  }, [getLocalFirstScan, persistLocalFirstScan, user?.id])

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

  // Update scan context for Monty chat
  useEffect(() => {
    // Determine active scan type
    let scanType: string | undefined
    if (hotScanMode) scanType = 'Top Movers'
    else if (earningsScanMode) scanType = 'Earnings'
    else if (volumeSurgeMode) scanType = 'Volume Surge'
    else if (layupsScanMode) scanType = 'Layups'
    else if (uoaScanMode) scanType = 'Unusual Options Activity'

    setScanResults(opportunities, scanType)
  }, [opportunities, hotScanMode, earningsScanMode, volumeSurgeMode, layupsScanMode, uoaScanMode, setScanResults])

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
  const enhancedModeActive = true
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

  const symbolUniverseStatus = useMemo(() => {
    const scanned = normalizeSymbolList(extractStringArray(scanMetadata ?? null, 'symbols'))
    const requested = normalizeSymbolList(extractStringArray(scanMetadata ?? null, 'requestedSymbols'))
    const scannedSet = new Set<string>(scanned)
    const outstanding = requested.filter(symbol => !scannedSet.has(symbol))

    let rotationInfo: {
      modeLabel: string | null
      total: number | null
      upcoming: string[]
      remainingCount: number | null
    } | null = null

    const rotationRaw = scanMetadata?.rotationState
    if (rotationRaw && typeof rotationRaw === 'object') {
      const record = rotationRaw as Record<string, unknown>
      const orderRaw = Array.isArray(record['order']) ? (record['order'] as unknown[]) : []
      const normalizedOrder = normalizeSymbolList(
        orderRaw
          .map(item => (typeof item === 'string' ? item : null))
          .filter((item): item is string => Boolean(item)),
      )

      if (normalizedOrder.length > 0) {
        const rawPosition =
          typeof record['position'] === 'number' && Number.isFinite(record['position'] as number)
            ? (record['position'] as number)
            : 0
        const sanitizedPosition = ((Math.floor(rawPosition) % normalizedOrder.length) + normalizedOrder.length) % normalizedOrder.length
        const lookahead = Math.min(normalizedOrder.length, 12)
        const upcoming: string[] = []
        for (let index = 0; index < lookahead; index += 1) {
          const pointer = (sanitizedPosition + index) % normalizedOrder.length
          upcoming.push(normalizedOrder[pointer])
        }

        const modeRaw = typeof record['mode'] === 'string' ? (record['mode'] as string).toLowerCase() : null
        const modeLabel = (() => {
          if (!modeRaw) {
            return null
          }
          if (modeRaw === 'random') {
            return 'Random rotation'
          }
          if (modeRaw === 'round_robin') {
            return 'Round robin'
          }
          return modeRaw.charAt(0).toUpperCase() + modeRaw.slice(1)
        })()

        const remainingCount = normalizedOrder.length > 0
          ? Math.max(normalizedOrder.length - requested.length, 0)
          : null

        rotationInfo = {
          modeLabel,
          total: normalizedOrder.length,
          upcoming,
          remainingCount,
        }
      }
    }

    return {
      scanned,
      requested,
      outstanding,
      rotation: rotationInfo,
    }
  }, [scanMetadata])

  const estimatedUniverseSize = useMemo(() => {
    const relaxedSelected = scanMetadata?.relaxedScan?.selectedCount
    if (typeof relaxedSelected === 'number' && Number.isFinite(relaxedSelected) && relaxedSelected > 0) {
      return relaxedSelected
    }

    const rotationRaw = scanMetadata?.rotationState
    if (rotationRaw && typeof rotationRaw === 'object') {
      const record = rotationRaw as Record<string, unknown>

      const orderRaw = Array.isArray(record['order']) ? record['order'] : null
      if (orderRaw) {
        const normalizedOrder = normalizeSymbolList(
          orderRaw
            .map(item => (typeof item === 'string' ? item : null))
            .filter((item): item is string => Boolean(item)),
        )
        if (normalizedOrder.length > 0) {
          return normalizedOrder.length
        }
      }

      const candidateCountRaw = record['candidateCount']
      if (typeof candidateCountRaw === 'number' && Number.isFinite(candidateCountRaw) && candidateCountRaw > 0) {
        return candidateCountRaw
      }

      const universeSizeRaw = record['universeSize']
      if (typeof universeSizeRaw === 'number' && Number.isFinite(universeSizeRaw) && universeSizeRaw > 0) {
        return universeSizeRaw
      }
    }

    if (typeof totalEvaluated === 'number' && Number.isFinite(totalEvaluated) && totalEvaluated > 0) {
      return totalEvaluated
    }

    return null
  }, [scanMetadata, totalEvaluated])

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

      // Parse target symbols if provided
      const targetSymbols = targetSymbolInput
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0)

      const payload = {
        portfolioSize: resolvedPortfolioSize,
        dailyContractBudget: resolvedDailyBudget,
        ...(targetSymbols.length > 0 ? { symbols: targetSymbols } : {}),
        ...(hotScanMode ? { hotScan: true } : {}),
        ...(earningsScanMode ? { earningsScan: true } : {}),
        ...(volumeSurgeMode ? { volumeSurgeMode: true } : {}),
        ...(layupsScanMode ? { layupsScan: true } : {}),
        ...(uoaScanMode ? { uoaScan: true } : {}),
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

      // Show first scan intro AFTER successful scan with results (only once)
      if (hasCompletedFirstScan === false && opportunitiesRef.current.length > 0 && !isFirstScanIntroOpen) {
        // Use a small delay to let the UI update with results first
        setTimeout(() => {
          setIsFirstScanIntroOpen(true)
        }, 500)
      }
    }
  }, [attemptFallbackFetch, earningsScanMode, handleScanPayload, hasCompletedFirstScan, hotScanMode, investmentAmount, isFirstScanIntroOpen, layupsScanMode, targetSymbolInput, uoaScanMode, userPortfolioConstraints, volumeSurgeMode])


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

  // DISABLED: Auto-scan on page load removed to prevent:
  // 1. Wasting API calls on every page load
  // 2. Circular loop with FirstScanIntro modal
  // 3. Users must manually click "Scan" button to run a scan
  // useEffect(() => {
  //   if (!settingsLoaded) {
  //     return
  //   }
  //
  //   fetchOpportunities()
  //   // Auto-refresh disabled - user must manually refresh to avoid API overuse
  // }, [fetchOpportunities, settingsLoaded])

  useEffect(() => {
    opportunitiesRef.current = opportunities
  }, [opportunities])


  useEffect(() => {
    setExpandedCards({})
  }, [opportunities])

  const sortedOpportunities = useMemo(() => {
    if (filteredOpportunities.length === 0) {
      return filteredOpportunities
    }

    console.log(`Sorting ${filteredOpportunities.length} opportunities by: ${sortOption}`)
    const ranked = [...filteredOpportunities]
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

    const compareRawKelly = (a: Opportunity, b: Opportunity) => {
      const diff =
        toNumber(b.positionSizing?.kellyFraction, -Infinity) -
        toNumber(a.positionSizing?.kellyFraction, -Infinity)
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
      kellyFraction: compareRawKelly,
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
  }, [filteredOpportunities, sortOption])

  // Split opportunities into recommended vs not-recommended
  const { recommendedOpportunities, notRecommendedOpportunities } = useMemo(() => {
    const recommended: Opportunity[] = []
    const notRecommended: Opportunity[] = []

    sortedOpportunities.forEach(opp => {
      const positionSizing = opp.positionSizing
      const isNotRecommended =
        positionSizing &&
        (positionSizing.recommendedFraction === 0 || positionSizing.riskBudgetTier === 'capital_preservation')

      if (isNotRecommended) {
        notRecommended.push(opp)
      } else {
        recommended.push(opp)
      }
    })

    return { recommendedOpportunities: recommended, notRecommendedOpportunities: notRecommended }
  }, [sortedOpportunities])

  const availableSortOptions: Array<{ value: OpportunitySortOption; label: string }> = [
    { value: 'promising', label: 'Most Promising' },
    { value: 'riskReward', label: 'Highest Asymmetry' },
    { value: 'probability', label: 'Highest Win Rate' },
    { value: 'maxReturn', label: 'Highest Max Return' },
    { value: 'safety', label: 'Lowest Risk' },
    { value: 'expiration', label: 'Soonest Expiration' },
    { value: 'kellyFraction', label: 'Highest Raw Kelly Fraction' },
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
    <div className="relative min-h-screen overflow-hidden bg-[#05070E] text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute bottom-[-18rem] left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[26rem] w-[26rem] rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.75),transparent_60%)]" />
      </div>

      {/* Scanner Controls - redesigned glass header */}
      <div className="border-b border-white/10 bg-white/5 shadow-[0_30px_120px_-60px_rgba(16,185,129,0.55)] backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="space-y-4">
            {/* Scan Type Title */}
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Scan Type</h2>

            {/* Scan Type Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <button
                onClick={() => setHotScanMode(!hotScanMode)}
                className={`rounded-xl p-4 text-sm font-semibold transition-all duration-200 ${
                  hotScanMode
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40'
                    : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700'
                }`}
              >
                Top Movers
              </button>

              <button
                onClick={() => setEarningsScanMode(!earningsScanMode)}
                className={`rounded-xl p-4 text-sm font-semibold transition-all duration-200 ${
                  earningsScanMode
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40'
                    : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700'
                }`}
              >
                Earnings
              </button>

              <button
                onClick={() => setVolumeSurgeMode(!volumeSurgeMode)}
                className={`rounded-xl p-4 text-sm font-semibold transition-all duration-200 ${
                  volumeSurgeMode
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40'
                    : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700'
                }`}
              >
                Volume Surge
              </button>

              <button
                onClick={() => setLayupsScanMode(!layupsScanMode)}
                className={`rounded-xl p-4 text-sm font-semibold transition-all duration-200 ${
                  layupsScanMode
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40'
                    : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700'
                }`}
              >
                Layups
              </button>

              <button
                onClick={() => setUoaScanMode(!uoaScanMode)}
                className={`rounded-xl p-4 text-sm font-semibold transition-all duration-200 ${
                  uoaScanMode
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40'
                    : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700'
                }`}
              >
                UOA
              </button>
            </div>

            {/* Target Symbol Search */}
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/40 px-5 py-2 shadow-inner shadow-emerald-500/10 max-w-sm">
              <svg className="h-5 w-5 text-emerald-300" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
              <input
                type="text"
                value={targetSymbolInput}
                onChange={(e) => setTargetSymbolInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && targetSymbolInput.trim()) {
                    e.preventDefault()
                    void fetchOpportunities()
                  }
                }}
                className="flex-1 bg-transparent text-sm font-semibold text-white placeholder:text-emerald-200/50 focus:outline-none uppercase"
                placeholder="Search symbols (TSLA, AAPL)"
                title="Enter ticker symbols (comma-separated) and press Enter to scan"
              />
              {targetSymbolInput && (
                <button
                  onClick={() => setTargetSymbolInput('')}
                  className="text-emerald-200/50 hover:text-emerald-200 transition-colors"
                  title="Clear symbols"
                >
                  <svg className="h-4 w-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                    <path d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              )}
            </div>

            {/* Run Scan Button */}
            <button
              onClick={() => fetchOpportunities()}
              disabled={isLoading}
              className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 px-8 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/40 transition-all duration-200 hover:shadow-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-white/25 transition-transform duration-500 group-hover:translate-x-0" />
              <span className="relative flex items-center gap-2">
                {isLoading ? (
                  <>
                    <div className="h-4 w-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                    <span>Scanning…</span>
                  </>
                ) : (
                  <span>Run Scan</span>
                )}
              </span>
            </button>
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
            {(fallbackActive || staleCacheActive) && (
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
        {/* Market Hours Banner - Show when market is closed (always visible, even during scans) */}
        <MarketHoursBanner />

        {/* Custom Filters Panel */}
        {showFilters && !isLoading && (
          <div className="my-6">
            <CustomScannerFilters
              criteria={customCriteria}
              onChange={setCustomCriteria}
              matchCount={filteredOpportunities.length}
              totalCount={opportunities.length}
            />
          </div>
        )}

        {/* Scan Status Banner - DISABLED (no cron jobs, on-demand scanning only) */}
        {/* {activeTab === 'options' && !isLoading && <ScanStatusBanner mode={scanMode} />} */}

        {/* Loading State - Monty the Money Printer Piggy! */}
        {isLoading && <MontyLoading />}

        {/* Scan Duration Warning */}
        {isLoading && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-6 py-4 dark:border-blue-800 dark:bg-blue-900/30">
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                  Advanced Analysis in Progress
                </h3>
                <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">
                  Monty is analyzing thousands of options contracts with institutional-grade probabilities and risk models.
                  This comprehensive analysis typically takes <span className="font-semibold">1-2 minutes</span>.
                  Don&apos;t worry - we&apos;re working hard to find you the best opportunities!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Scan Progress */}
        <RealTimeProgress
          isScanning={isLoading}
          scanType="options"
          filterMode={scanMode}
          estimatedUniverse={estimatedUniverseSize}
          lastTotalEvaluated={
            Number.isFinite(totalEvaluated) && totalEvaluated > 0
              ? totalEvaluated
              : null
          }
          lastCompletedAt={lastSuccessfulUpdate}
        />

        {/* Filters Button - Only show when there are results */}
        {!isLoading && filteredOpportunities.length > 0 && (
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-widest transition-all duration-200 border ${
                showFilters
                  ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 text-slate-950 shadow-lg shadow-emerald-500/40 border-emerald-400'
                  : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              <span>Filters</span>
            </button>
          </div>
        )}

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
                <p className="text-2xl font-bold text-emerald-400">{filteredOpportunities.length}</p>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 hover:border-red-500/30 transition-colors">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">High Score</p>
                <p className="text-2xl font-bold text-red-400">{filteredOpportunities.filter(o => o.score >= 90).length}</p>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 hover:border-orange-500/30 transition-colors">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Volume</p>
                <p className="text-2xl font-bold text-orange-400">{filteredOpportunities.filter(o => o.volumeRatio > 2).length}</p>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 hover:border-blue-500/30 transition-colors">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Catalysts</p>
                <p className="text-2xl font-bold text-blue-400">{filteredOpportunities.filter(o => o.catalysts && o.catalysts.length > 0).length}</p>
              </div>
            </div>
          </div>
        )}

        {!isLoading &&
          (symbolUniverseStatus.scanned.length > 0 ||
            symbolUniverseStatus.requested.length > 0 ||
            (symbolUniverseStatus.rotation?.upcoming.length ?? 0) > 0) && (
            <div className="mb-8 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/50 px-6 py-6 shadow-lg dark:border-slate-700 dark:from-slate-900/90 dark:to-slate-900/40">
              {/* Header Section */}
              <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-md">
                    <ScanSearch className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Scan Universe</h3>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                      Track coverage and rotation status
                    </p>
                  </div>
                </div>
                {symbolUniverseStatus.rotation?.modeLabel && (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
                    <RotateCw className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {symbolUniverseStatus.rotation.modeLabel}
                      </div>
                      {typeof symbolUniverseStatus.rotation.total === 'number' && symbolUniverseStatus.rotation.total > 0 && (
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {symbolUniverseStatus.rotation.total.toLocaleString()} symbols
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Main Content Grid */}
              <div className="grid gap-5 lg:grid-cols-2">
                {/* Left Column - Scanned & Requested */}
                <div className="space-y-5">
                  {symbolUniverseStatus.scanned.length > 0 && (
                    <div className="rounded-xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="flex-1">
                          <div className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                            Scanned This Run
                          </div>
                          <div className="text-lg font-bold text-emerald-900 dark:text-emerald-300">
                            {symbolUniverseStatus.scanned.length}
                          </div>
                        </div>
                      </div>
                      <div>{renderSymbolChips(symbolUniverseStatus.scanned, 18, 'scanned')}</div>
                    </div>
                  )}

                  {symbolUniverseStatus.requested.length > 0 && (
                    <div className="rounded-xl border border-blue-200/60 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20">
                          <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <div className="text-xs font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
                            Requested Batch
                          </div>
                          <div className="text-lg font-bold text-blue-900 dark:text-blue-300">
                            {symbolUniverseStatus.requested.length}
                          </div>
                        </div>
                      </div>
                      <div>{renderSymbolChips(symbolUniverseStatus.requested, 18, 'requested')}</div>
                    </div>
                  )}

                  {symbolUniverseStatus.outstanding.length > 0 && (
                    <div className="rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm dark:border-amber-500/30 dark:from-amber-500/10 dark:to-transparent">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20">
                          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1">
                          <div className="text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            Outstanding
                          </div>
                          <div className="text-lg font-bold text-amber-900 dark:text-amber-300">
                            {symbolUniverseStatus.outstanding.length}
                          </div>
                        </div>
                      </div>
                      <div>{renderSymbolChips(symbolUniverseStatus.outstanding, 12, 'outstanding')}</div>
                      <p className="mt-3 text-xs text-amber-700/80 dark:text-amber-100/70">
                        Requested symbols that didn&apos;t return results in this pass.
                      </p>
                    </div>
                  )}

                  {symbolUniverseStatus.scanned.length === 0 &&
                    symbolUniverseStatus.requested.length === 0 && (
                      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 dark:border-slate-700 dark:bg-slate-800/30">
                        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                          No symbol metadata was reported for this scan.
                        </p>
                      </div>
                    )}
                </div>

                {/* Right Column - Next in Rotation */}
                <div className="space-y-5">
                  {symbolUniverseStatus.rotation?.upcoming.length ? (
                    <div className="rounded-xl border border-purple-200/60 bg-gradient-to-br from-purple-50 to-white p-5 shadow-sm dark:border-purple-500/20 dark:from-purple-500/10 dark:to-transparent">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-500/20">
                          <ArrowRight className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="flex-1">
                          <div className="text-xs font-medium uppercase tracking-wide text-purple-600 dark:text-purple-400">
                            Next in Rotation
                          </div>
                          <div className="text-lg font-bold text-purple-900 dark:text-purple-300">
                            {symbolUniverseStatus.rotation.upcoming.length}
                            {typeof symbolUniverseStatus.rotation.total === 'number' && symbolUniverseStatus.rotation.total > 0 && (
                              <span className="ml-1 text-sm font-medium text-purple-600 dark:text-purple-400">
                                of {symbolUniverseStatus.rotation.total.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div>{renderSymbolChips(symbolUniverseStatus.rotation.upcoming, 15, 'upcoming')}</div>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 dark:border-slate-700 dark:bg-slate-800/30">
                      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                        Rotation queue details will appear once the scanner reports its universe state.
                      </p>
                    </div>
                  )}

                  {typeof symbolUniverseStatus.rotation?.remainingCount === 'number' && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
                      <div className="flex items-start gap-3">
                        <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Remaining
                          </div>
                          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                            {symbolUniverseStatus.rotation.remainingCount > 0
                              ? `${symbolUniverseStatus.rotation.remainingCount.toLocaleString()} symbols remain in the rotation after this batch.`
                              : 'The rotation is ready to start over on the next scan.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
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
        {!isLoading && filteredOpportunities.length === 0 && (
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
            <div className="mx-auto mb-6 max-w-2xl rounded-2xl border border-slate-200/60 bg-white/70 px-6 py-4 text-left shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
              <p className="text-sm italic leading-relaxed text-slate-700 dark:text-slate-200">
                &ldquo;Trading is about discipline. Not trading is just as important as trading—you can&apos;t rush.&rdquo;
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Stay patient, and when you&apos;re ready to find moves, try widening the filters or running another scan for fresh setups.
              </p>
            </div>
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
                <h2 className="text-2xl font-semibold text-emerald-500 dark:text-emerald-400">
                  Trading Opportunities
                </h2>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {recommendedOpportunities.length} recommended
                  {notRecommendedOpportunities.length > 0 && ` · ${notRecommendedOpportunities.length} high risk`}
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

            {/* Recommended Opportunities */}
            {recommendedOpportunities.length > 0 && (
              <div className="space-y-5">
                {recommendedOpportunities.map((opp) => {
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
                      onAddToWatchlist: () => addToWatchlist({
                        id: cardId,
                        symbol: opp.symbol,
                        optionType: opp.optionType,
                        strike: opp.strike,
                        expiration: opp.expiration,
                        premium: opp.premium,
                        score: opp.score,
                        riskLevel: opp.riskLevel,
                        daysToExpiration: opp.daysToExpiration,
                        tradeSummary: opp.tradeSummary,
                      }),
                      isOnWatchlist: isOnWatchlist(cardId),
                      onRejectOpportunity: () => openRejectModal(opp),
                      isRejected: rejectedOpportunities.has(cardId),
                      onOpenChat: () => setChatOpportunity(opp),
                      loadingBacktest: loadingBacktests[cardId] ?? false,
                      enhancedBacktest: enhancedBacktests[cardId] ?? null,
                      onRunBacktest: () => runBacktestEnhancement(opp),
                      loadingHistorical: loadingHistoricals[cardId] ?? false,
                      enhancedHistorical: enhancedHistoricals[cardId] ?? null,
                      onRunHistorical: () => runHistoricalEnhancement(opp),
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
            )}

            {/* Not Recommended - Collapsible Section */}
            {notRecommendedOpportunities.length > 0 && (
              <div className="border-2 border-dashed border-red-300 dark:border-red-800 rounded-2xl p-6 bg-red-50/30 dark:bg-red-950/10 mt-8">
                <button
                  onClick={() => setShowNotRecommended(!showNotRecommended)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div>
                      <h3 className="text-lg font-bold text-red-900 dark:text-red-100">
                        High Risk - Not Recommended ({notRecommendedOpportunities.length})
                      </h3>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                        These opportunities have negative expected edge or extreme risk. Proceed with caution.
                      </p>
                    </div>
                  </div>
                  <svg
                    className={`w-6 h-6 text-red-600 dark:text-red-400 transition-transform duration-200 ${
                      showNotRecommended ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showNotRecommended && (
                  <div className="mt-6 space-y-5 opacity-75">
                    {notRecommendedOpportunities.map((opp) => {
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
                        onAddToWatchlist: () => addToWatchlist({
                          id: cardId,
                          symbol: opp.symbol,
                          optionType: opp.optionType,
                          strike: opp.strike,
                          expiration: opp.expiration,
                          premium: opp.premium,
                          score: opp.score,
                          riskLevel: opp.riskLevel,
                          daysToExpiration: opp.daysToExpiration,
                          tradeSummary: opp.tradeSummary,
                        }),
                        isOnWatchlist: isOnWatchlist(cardId),
                        onRejectOpportunity: () => openRejectModal(opp),
                        isRejected: rejectedOpportunities.has(cardId),
                        onOpenChat: () => setChatOpportunity(opp),
                        loadingBacktest: loadingBacktests[cardId] ?? false,
                        enhancedBacktest: enhancedBacktests[cardId] ?? null,
                        onRunBacktest: () => runBacktestEnhancement(opp),
                        loadingHistorical: loadingHistoricals[cardId] ?? false,
                        enhancedHistorical: enhancedHistoricals[cardId] ?? null,
                        onRunHistorical: () => runHistoricalEnhancement(opp),
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
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Welcome Setup Modal - only show after settings loaded */}
      <WelcomeSetup
        open={isWelcomeSetupOpen && settingsLoaded}
        onComplete={handleWelcomeComplete}
        onSkip={() => setIsWelcomeSetupOpen(false)}
      />

      {/* First Scan Intro Modal */}
      <FirstScanIntro
        open={isFirstScanIntroOpen}
        onComplete={dismissFirstScanIntro}
        onSkip={dismissFirstScanIntro}
        opportunityCount={opportunities.length}
      />

      {/* AI Trade Chat Modal */}
      {chatOpportunity && (
        <TradeChat
          opportunity={chatOpportunity}
          isOpen={chatOpportunity !== null}
          onClose={() => setChatOpportunity(null)}
        />
      )}

      {/* Rejection Notes Modal */}
      {rejectingOpportunity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-xl font-bold text-white">
              Reject Opportunity
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              {rejectingOpportunity.symbol} ${rejectingOpportunity.strike} {rejectingOpportunity.optionType.toUpperCase()}
            </p>

            <label className="mb-2 block text-sm font-medium text-slate-300">
              Why are you rejecting this trade? (optional)
            </label>
            <textarea
              value={rejectionNotes}
              onChange={(e) => setRejectionNotes(e.target.value)}
              placeholder="e.g., IV too high, prefer different strike, overexposed to sector..."
              className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-800 p-3 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              rows={4}
            />

            <div className="flex gap-3">
              <button
                onClick={confirmRejectOpportunity}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Reject Trade
              </button>
              <button
                onClick={() => {
                  setRejectingOpportunity(null)
                  setRejectionNotes('')
                }}
                className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
