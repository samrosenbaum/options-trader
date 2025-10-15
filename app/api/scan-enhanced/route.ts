import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

// Commented out - not used after switching to cache-only mode
// import { ensureOptionGreeks } from "@/lib/math/greeks"

/**
 * Enhanced Options Scan API Endpoint
 *
 * This endpoint uses the new institutional-grade scanner that combines:
 * - Background cached scans for instant results (<2 seconds)
 * - Falls back to live scan if cache is stale (>15 minutes old)
 * - Data quality validation with 5-tier scoring
 * - Unified probability calculations with confidence intervals
 * - Professional Greeks including advanced Greeks
 * - Risk-adjusted scoring and filtering
 */

type FilterMode = "strict" | "relaxed"

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

interface EnhancedScannerOpportunity {
  symbol: string
  optionType: "call" | "put" | string
  strike: number
  expiration: string
  premium: number
  bid: number
  ask: number
  volume: number
  openInterest: number
  impliedVolatility: number
  stockPrice: number
  score: number
  confidence: number
  tradeSummary?: string
  reasoning: string[]
  catalysts: string[]
  patterns: string[]
  riskLevel: string
  potentialReturn: number
  potentialReturnAmount: number
  maxReturn: number
  maxReturnAmount: number
  expectedMoveReturn?: number
  expectedMoveAmount?: number
  optimisticMoveReturn?: number
  optimisticMoveAmount?: number
  expectedMove1SD?: number
  expectedMove2SD?: number
  maxLoss: number
  maxLossPercent: number
  maxLossAmount: number
  breakeven: number
  breakevenPrice: number
  breakevenMovePercent: number
  ivRank: number
  volumeRatio: number
  probabilityOfProfit: number
  profitProbabilityExplanation?: string
  riskRewardRatio?: number | null
  shortTermRiskRewardRatio?: number | null
  greeks?: {
    delta?: number
    gamma?: number
    theta?: number
    vega?: number
  }
  daysToExpiration?: number
  returnsAnalysis?: Array<{
    move: string
    return: number
  }>
  historicalContext?: Record<string, unknown>
  directionalBias?: Record<string, unknown>
  enhancedDirectionalBias?: Record<string, unknown>
  _dataQuality?: {
    quality: string
    score: number
    issues: string[]
    warnings: string[]
    priceSource?: string
    priceTimestamp?: string | null
    priceAgeSeconds?: number | null
  }
  swingSignal?: Record<string, unknown> | null
  swingSignalError?: string
  metadata?: Record<string, unknown>

  positionSizing?: {
    recommendedFraction: number
    conservativeFraction: number
    aggressiveFraction: number
    kellyFraction: number
    expectedLogGrowth?: number
    expectedEdge?: number
    riskBudgetTier: string
    rationale: string[]
    inputs?: Record<string, unknown>
    limits?: {
      maxPerTrade: number
      maxDrawdown95?: number
      losingStreak95?: number
    }
    capitalAllocationExamples?: Array<{
      portfolio: number
      contracts: number
      capitalAtRisk: number
      allocationPercent: number
    }>
  }

  // Enhanced institutional-grade fields
  riskAdjustedScore?: number
  enhancedProbabilityOfProfit?: number
  enhancedExpectedValue?: number
  enhancedTags?: string[]
  enhancedWarnings?: string[]
  enhancedAnalysis?: {
    dataQuality: {
      quality: string
      score: number
      summary: string
      issues: string[]
      warnings: string[]
    }
    probabilityAnalysis: {
      probabilityOfProfit: number
      probabilityITM: number
      probabilityTouch: number
      expectedValue: number
      confidenceInterval: [number, number]
      breakeven: number
      maxLoss: number
      method: string
    }
    greeks: {
      delta: number
      gamma: number
      theta: number
      vega: number
      rho: number
      lambda: number
      // Advanced Greeks
      charm: number
      color: number
      speed: number
      zomma: number
      ultima: number
    }
    riskMetrics: {
      compositeScore: number
      riskAdjustedScore: number
      scoreBreakdown: Record<string, number>
    }
  }
}

interface EnhancedScannerMetadata {
  fetchedAt?: string
  source?: string
  totalEvaluated?: number
  symbolLimit?: number
  opportunityCount?: number
  symbols?: string[]
  fallback?: boolean
  fallbackReason?: string
  fallbackDetails?: string
  enhancedScanner?: boolean
  institutionalGrade?: boolean
  filterMode?: FilterMode
  relaxedScan?: RelaxedScanMetadata
  enhancedStatistics?: {
    scanStatistics?: Record<string, unknown>
    calibrationMetrics?: Record<string, unknown>
    enhancedComponentsActive?: boolean
    institutionalGradeFiltering?: boolean
  }
}

interface EnhancedScannerResponse {
  opportunities?: EnhancedScannerOpportunity[]
  metadata?: EnhancedScannerMetadata & Record<string, unknown>
  totalEvaluated?: number
}

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes for enhanced analysis

// Commented out - not used after switching to cache-only mode
// const FALLBACK_TIMEOUT_MS = 280_000
// const DEBUG_LOG_TAIL_LENGTH = 2_000
// const buildLogTail = (value: string | undefined) => { ... }

const mergeDebugInfo = (
  reason: string,
  details: string | undefined,
  debug?: Record<string, unknown>,
) => {
  if (!debug || typeof debug !== "object") {
    return {
      reason,
      ...(details ? { details } : {}),
    }
  }

  const sanitized: Record<string, unknown> = {
    reason,
    ...(details ? { details } : {}),
  }

  for (const [key, value] of Object.entries(debug)) {
    if (value === undefined) {
      continue
    }

    if (typeof value === "string") {
      sanitized[key] = value
      continue
    }

    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      sanitized[key] = value
      continue
    }

    try {
      sanitized[key] = JSON.parse(JSON.stringify(value))
    } catch {
      sanitized[key] = String(value)
    }
  }

  return sanitized
}

const normalizeFilterMode = (value: unknown): FilterMode | undefined => {
  if (typeof value !== "string") {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  if (["strict", "strict-only", "strict_only", "tight"].includes(normalized)) {
    return "strict"
  }

  if (["relaxed", "wide", "expanded", "loose"].includes(normalized)) {
    return "relaxed"
  }

  return undefined
}

const extractFilterModeFromSearchParams = (params: URLSearchParams): FilterMode | undefined => {
  const candidates = [
    params.get("filterMode"),
    params.get("filter_mode"),
    params.get("filter"),
    params.get("mode"),
  ]

  for (const candidate of candidates) {
    const normalized = normalizeFilterMode(candidate)
    if (normalized) {
      return normalized
    }
  }

  return undefined
}

const extractFilterModeFromBody = (body: unknown): FilterMode | undefined => {
  if (!body || typeof body !== "object") {
    return undefined
  }

  const record = body as Record<string, unknown>
  const candidates = [
    record.filterMode,
    record.filter_mode,
    record.filter,
    record.mode,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeFilterMode(candidate)
    if (normalized) {
      return normalized
    }
  }

  return undefined
}

const resolveFilterMode = (
  params: URLSearchParams,
  body?: unknown,
): FilterMode | undefined => {
  const fromParams = extractFilterModeFromSearchParams(params)
  if (fromParams) {
    return fromParams
  }

  return extractFilterModeFromBody(body)
}

const normalizePercent = (value: unknown): number | null => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null
  }

  if (!Number.isFinite(value)) {
    return null
  }

  if (Math.abs(value) > 1.5) {
    return value
  }

  return value * 100
}

// Commented out - not used after switching to cache-only mode
/* const sanitizeReturns = (returns: EnhancedScannerOpportunity["returnsAnalysis"]): EnhancedScannerOpportunity["returnsAnalysis"] => {
  if (!Array.isArray(returns)) {
    return []
  }

  return returns.map((entry) => ({
    move: entry.move,
    return: normalizePercent(entry.return) ?? 0,
  }))
} */

// Commented out - not used after switching to cache-only mode
/* const parseScannerJson = (stdout: string, stderr: string): EnhancedScannerResponse | null => {
  const attemptParse = (raw: string): EnhancedScannerResponse | null => {
    const trimmed = raw.trim()
    if (!trimmed) {
      return null
    }

    try {
      return JSON.parse(trimmed) as EnhancedScannerResponse
    } catch {
      // Fall through to try extracting the last JSON block
    }

    const startIndex = trimmed.search(/[{[]/)
    if (startIndex === -1) {
      return null
    }

    const candidate = trimmed.slice(startIndex)
    const endIndex = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"))
    if (endIndex === -1) {
      return null
    }

    try {
      return JSON.parse(candidate.slice(0, endIndex + 1)) as EnhancedScannerResponse
    } catch {
      return null
    }
  }

  return attemptParse(stdout) ?? attemptParse(`${stdout}\\n${stderr}`)
} */

// Commented out - not used after switching to cache-only mode
/* interface SanitizedPayload {
  opportunities: EnhancedScannerOpportunity[]
  metadata: EnhancedScannerMetadata & Record<string, unknown>
  timestamp: string
  totalEvaluated: number
} */

// Commented out - not used after switching to cache-only mode
/* const sanitizeScannerResponse = (parsed: EnhancedScannerResponse): SanitizedPayload => {
  const metadata: EnhancedScannerMetadata & Record<string, unknown> = {
    ...(parsed.metadata ?? {}),
  }

  const rawOpportunities = Array.isArray(parsed.opportunities) ? parsed.opportunities : []
  const opportunities: EnhancedScannerOpportunity[] = []

  for (const opp of rawOpportunities) {
    const probability = normalizePercent(opp.probabilityOfProfit)
    if (probability !== null && probability <= 0) {
      continue
    }

    const contract = {
      option_type: opp.optionType as "call" | "put",
      strike: opp.strike,
      expiration: opp.expiration,
      last_price: opp.premium / 100,
      bid: opp.bid / 100,
      ask: opp.ask / 100,
      volume: opp.volume,
      open_interest: opp.openInterest,
      implied_volatility: opp.impliedVolatility,
      stock_price: opp.stockPrice,
    }

    const greeks = ensureOptionGreeks(opp.greeks, contract)

    const sanitized: EnhancedScannerOpportunity = {
      ...opp,
      probabilityOfProfit: normalizePercent(opp.probabilityOfProfit) ?? 0,
      breakevenMovePercent: normalizePercent(opp.breakevenMovePercent) ?? 0,
      potentialReturn: normalizePercent(opp.potentialReturn) ?? 0,
      maxReturn: normalizePercent(opp.maxReturn) ?? 0,
      returnsAnalysis: sanitizeReturns(opp.returnsAnalysis ?? []),
      greeks,
    }

    opportunities.push(sanitized)
  }

  // Sort by risk-adjusted score if available, otherwise by regular score
  const expectedValueKey = (item: EnhancedScannerOpportunity) => {
    // Prefer risk-adjusted score for institutional-grade sorting
    const riskScore = item.riskAdjustedScore ?? item.score ?? 0
    const prob = (typeof item.probabilityOfProfit === "number" ? item.probabilityOfProfit : 0) / 100
    const expectedReturn = typeof item.expectedMoveReturn === "number" ? item.expectedMoveReturn : item.potentialReturn || 0
    
    // Enhanced scoring combines risk-adjusted score with expected value
    const enhancedExpectedValue = item.enhancedExpectedValue ?? 0
    
    if (enhancedExpectedValue > 0) {
      return riskScore * 0.6 + enhancedExpectedValue * 0.4
    }
    
    return riskScore * 0.7 + (prob * expectedReturn) * 0.3
  }

  opportunities.sort((a, b) => expectedValueKey(b) - expectedValueKey(a))

  // Limit to top opportunities
  const maxOpportunities = 20
  if (opportunities.length > maxOpportunities) {
    console.warn(`📊 Limiting output to top ${maxOpportunities} of ${opportunities.length} institutional-grade opportunities`)
    opportunities.length = maxOpportunities
  }

  const timestamp = typeof metadata.fetchedAt === "string" ? metadata.fetchedAt : new Date().toISOString()
  const totalEvaluated =
    typeof parsed.totalEvaluated === "number" && Number.isFinite(parsed.totalEvaluated)
      ? parsed.totalEvaluated
      : typeof metadata.totalEvaluated === "number" && Number.isFinite(metadata.totalEvaluated)
        ? metadata.totalEvaluated
        : opportunities.length

  return {
    opportunities,
    metadata,
    timestamp,
    totalEvaluated,
  }
} */

// Commented out - not used after switching to cache-only mode
/* const buildSuccessResponse = (payload: SanitizedPayload) => {
  const metadata = {
    ...payload.metadata,
  }
  const source = typeof metadata.source === "string" ? metadata.source : "enhanced-adapter"

  return NextResponse.json({
    success: true,
    timestamp: payload.timestamp,
    opportunities: payload.opportunities,
    source,
    totalEvaluated: payload.totalEvaluated,
    metadata,
    enhanced: true, // Flag to indicate this is from the enhanced scanner
  })
} */

interface ConstraintPayload {
  portfolioSize?: number
  dailyContractBudget?: number
}

const parseConstraintNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) {
    return undefined
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
  }

  const coerced = Number(value)
  return Number.isFinite(coerced) && coerced > 0 ? coerced : undefined
}

const extractConstraintsFromSearchParams = (params: URLSearchParams): ConstraintPayload => {
  const constraints: ConstraintPayload = {}
  const portfolioParam = params.get("portfolioSize") ?? params.get("portfolio_size")
  const dailyParam = params.get("dailyContractBudget") ?? params.get("daily_contract_budget")

  const parsedPortfolio = parseConstraintNumber(portfolioParam)
  if (parsedPortfolio !== undefined) {
    constraints.portfolioSize = parsedPortfolio
  }

  const parsedDaily = parseConstraintNumber(dailyParam)
  if (parsedDaily !== undefined) {
    constraints.dailyContractBudget = parsedDaily
  }

  return constraints
}

const extractConstraintsFromBody = (body: unknown): ConstraintPayload => {
  if (!body || typeof body !== "object") {
    return {}
  }

  const record = body as Record<string, unknown>
  const constraints: ConstraintPayload = {}

  const portfolioValue = record.portfolioSize ?? record.portfolio_size
  const dailyValue = record.dailyContractBudget ?? record.daily_contract_budget

  const parsedPortfolio = parseConstraintNumber(portfolioValue)
  if (parsedPortfolio !== undefined) {
    constraints.portfolioSize = parsedPortfolio
  }

  const parsedDaily = parseConstraintNumber(dailyValue)
  if (parsedDaily !== undefined) {
    constraints.dailyContractBudget = parsedDaily
  }

  return constraints
}

const mergeConstraints = (
  ...sources: Array<ConstraintPayload | undefined>
): ConstraintPayload | undefined => {
  const merged: ConstraintPayload = {}

  for (const source of sources) {
    if (!source) {
      continue
    }

    if (source.portfolioSize !== undefined) {
      merged.portfolioSize = source.portfolioSize
    }

    if (source.dailyContractBudget !== undefined) {
      merged.dailyContractBudget = source.dailyContractBudget
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined
}

/**
 * Type definition for cached scan results from Supabase RPC
 */
interface CachedScanResponse {
  id: string
  scan_id: string
  scan_timestamp: string
  filter_mode: string
  opportunities: Record<string, unknown>[]
  total_evaluated: number
  symbols_scanned: string[]
  scan_duration_seconds: number
  metadata: Record<string, unknown>
  age_minutes: number
}

/**
 * Fetch cached scan results from Supabase
 * Returns cached results if available and fresh (< 15 minutes old)
 */
const fetchCachedScanResults = async (filterMode: FilterMode = "strict") => {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .rpc('get_latest_scan', { p_filter_mode: filterMode })
      .single() as { data: CachedScanResponse | null; error: Error | null }

    if (error) {
      console.warn(`No cached scan found for ${filterMode} mode:`, error.message)
      return null
    }

    if (!data) {
      console.warn(`No cached scan data available for ${filterMode} mode`)
      return null
    }

    const ageMinutes = data.age_minutes || 0

    // Cache is stale if older than 15 minutes
    if (ageMinutes > 15) {
      console.warn(`Cached scan is stale (${ageMinutes.toFixed(1)} minutes old), will run live scan`)
      return null
    }

    console.log(`✅ Serving cached scan (${ageMinutes.toFixed(1)} minutes old, ${data.opportunities?.length || 0} opportunities)`)

    return {
      opportunities: data.opportunities || [],
      metadata: {
        ...(data.metadata || {}),
        totalEvaluated: data.total_evaluated || 0,
        symbolsScanned: data.symbols_scanned || [],
        cacheHit: true,
        cacheAgeMinutes: ageMinutes,
        cacheTimestamp: data.scan_timestamp,
        scanDuration: data.scan_duration_seconds,
        source: 'cached_background_scan',
      },
    }
  } catch (error) {
    console.error('Error fetching cached scan:', error)
    return null
  }
}

const executeEnhancedScanner = async ({
  debugContext,
  filterMode,
}: {
  constraints?: ConstraintPayload
  debugContext?: Record<string, unknown>
  filterMode?: FilterMode
}) => {
  const resolvedMode: FilterMode = filterMode === "strict" ? "strict" : "relaxed"

  // Try to fetch cached results first for instant response
  console.log(`⚡ Checking cache for ${resolvedMode} mode results...`)
  const cachedResults = await fetchCachedScanResults(resolvedMode)

  if (cachedResults) {
    // Cache hit! Serve instantly
    console.log(`🚀 Serving cached results (${cachedResults.metadata.cacheAgeMinutes?.toFixed(1)} min old)`)

    return NextResponse.json({
      success: true,
      opportunities: cachedResults.opportunities,
      metadata: cachedResults.metadata,
    })
  }

  // ALWAYS serve from cache - never run live scans (they timeout)
  // The cron jobs refresh the cache every 10 minutes
  console.log(`⚠️  No cache available for ${resolvedMode} mode - cron job hasn't run yet`)
  return buildFallbackResponse(
    'cache_miss',
    `No ${resolvedMode} mode scan available yet. Cron jobs run every 10 minutes to populate the cache.`,
    {
      filterMode: resolvedMode,
      cacheWaitTime: 'up to 10 minutes',
      suggestion: 'Please wait a few minutes and try again. Background scanner runs every 10 minutes.',
      ...(debugContext ?? {}),
    }
  )
}

const buildFallbackResponse = (
  reason: string,
  details?: string,
  debug?: Record<string, unknown>,
) => {
  const timestamp = new Date().toISOString()
  const debugInfo = mergeDebugInfo(reason, details, debug)

  const metadata: Record<string, unknown> = {
    source: "enhanced-fallback",
    fallback: true,
    fallbackReason: reason,
    enhancedScanner: true,
    fallbackDetails: details,
    debugInfo: {
      ...debugInfo,
      capturedAt: timestamp,
    },
  }

  const debugFilterMode = normalizeFilterMode(debug?.filterMode) ?? normalizeFilterMode(debugInfo.filterMode)
  if (debugFilterMode) {
    metadata.filterMode = debugFilterMode
  }

  if (!details) {
    delete metadata.fallbackDetails
  }

  const totalEvaluated =
    typeof debug?.totalEvaluated === "number" && Number.isFinite(debug.totalEvaluated)
      ? debug.totalEvaluated
      : 0

  return NextResponse.json({
    success: true,
    timestamp,
    opportunities: [],
    source: metadata.source,
    totalEvaluated,
    metadata,
    enhanced: true,
  })
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const fallbackParam = url.searchParams.get("fallback") ?? url.searchParams.get("mode")
    const normalizedFallback = fallbackParam?.toLowerCase()
    const fallbackOnly =
      normalizedFallback === "1" ||
      normalizedFallback === "true" ||
      normalizedFallback === "yes" ||
      normalizedFallback === "only" ||
      normalizedFallback === "fallback"

    const resolvedFilterMode = resolveFilterMode(url.searchParams)

    if (fallbackOnly) {
      const reasonParam = url.searchParams.get("reason")
      const detailsParam = url.searchParams.get("details")
      return buildFallbackResponse(
        reasonParam && reasonParam.trim().length > 0 ? reasonParam : "client_requested",
        detailsParam && detailsParam.trim().length > 0 ? detailsParam : "Client requested fallback dataset",
        { requestedViaQuery: true, filterMode: resolvedFilterMode ?? "relaxed" },
      )
    }
    const constraints = mergeConstraints(extractConstraintsFromSearchParams(url.searchParams))
    return executeEnhancedScanner({
      constraints,
      debugContext: { requestedVia: "GET" },
      filterMode: resolvedFilterMode,
    })
  } catch (error) {
    console.error("Error executing enhanced scanner:", error)
    return buildFallbackResponse("handler_failure", error instanceof Error ? error.message : String(error))
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const fallbackParam = url.searchParams.get("fallback") ?? url.searchParams.get("mode")
    const normalizedFallback = fallbackParam?.toLowerCase()
    const fallbackOnly =
      normalizedFallback === "1" ||
      normalizedFallback === "true" ||
      normalizedFallback === "yes" ||
      normalizedFallback === "only" ||
      normalizedFallback === "fallback"

    let body: unknown = null
    try {
      body = await request.json()
    } catch {
      body = null
    }

    const resolvedFilterMode = resolveFilterMode(url.searchParams, body)
    const searchConstraints = extractConstraintsFromSearchParams(url.searchParams)
    const bodyConstraints = extractConstraintsFromBody(body)
    const constraints = mergeConstraints(searchConstraints, bodyConstraints)

    if (fallbackOnly) {
      const reasonFromBody =
        body && typeof body === "object" && body !== null
          ? (body as Record<string, unknown>).reason
          : undefined
      const detailsFromBody =
        body && typeof body === "object" && body !== null
          ? (body as Record<string, unknown>).details
          : undefined

      const reasonParam = typeof reasonFromBody === "string" ? reasonFromBody : url.searchParams.get("reason")
      const detailsParam =
        typeof detailsFromBody === "string" ? detailsFromBody : url.searchParams.get("details")

      return buildFallbackResponse(
        reasonParam && reasonParam.trim().length > 0 ? reasonParam : "client_requested",
        detailsParam && detailsParam.trim().length > 0 ? detailsParam : "Client requested fallback dataset",
        { requestedViaBody: true, filterMode: resolvedFilterMode ?? "relaxed" },
      )
    }

    return executeEnhancedScanner({
      constraints,
      debugContext: { requestedVia: "POST" },
      filterMode: resolvedFilterMode,
    })
  } catch (error) {
    console.error("Error executing enhanced scanner via POST:", error)
    return buildFallbackResponse("handler_failure", error instanceof Error ? error.message : String(error))
  }
}