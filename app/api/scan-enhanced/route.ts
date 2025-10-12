import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"

import { resolvePythonExecutable } from "@/lib/server/python"
import { ensureOptionGreeks } from "@/lib/math/greeks"

/**
 * Enhanced Options Scan API Endpoint
 * 
 * This endpoint uses the new institutional-grade scanner that combines:
 * - Data quality validation with 5-tier scoring
 * - Unified probability calculations with confidence intervals  
 * - Professional Greeks including advanced Greeks
 * - Risk-adjusted scoring and filtering
 */

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

const FALLBACK_TIMEOUT_MS = 60_000 // Increased timeout for enhanced processing
const FALLBACK_DATA_PATH = path.join(process.cwd(), "configs", "fallback-scan.json")

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

const sanitizeReturns = (returns: EnhancedScannerOpportunity["returnsAnalysis"]): EnhancedScannerOpportunity["returnsAnalysis"] => {
  if (!Array.isArray(returns)) {
    return []
  }

  return returns.map((entry) => ({
    move: entry.move,
    return: normalizePercent(entry.return) ?? 0,
  }))
}

const parseScannerJson = (stdout: string, stderr: string): EnhancedScannerResponse | null => {
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
}

interface SanitizedPayload {
  opportunities: EnhancedScannerOpportunity[]
  metadata: EnhancedScannerMetadata & Record<string, unknown>
  timestamp: string
  totalEvaluated: number
}

const sanitizeScannerResponse = (parsed: EnhancedScannerResponse): SanitizedPayload => {
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
}

const buildSuccessResponse = (payload: SanitizedPayload) => {
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
}

const loadFallbackResponse = async (): Promise<EnhancedScannerResponse | null> => {
  try {
    const contents = await readFile(FALLBACK_DATA_PATH, "utf-8")
    const parsed = JSON.parse(contents) as EnhancedScannerResponse
    if (!parsed || !Array.isArray(parsed.opportunities) || parsed.opportunities.length === 0) {
      return null
    }
    return parsed
  } catch (error) {
    console.error("Failed to load fallback scan payload:", error)
    return null
  }
}

const buildFallbackResponse = async (reason: string, details?: string) => {
  const fallback = await loadFallbackResponse()

  if (!fallback) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute enhanced scan",
        details: details ? `${reason}: ${details}` : reason,
        enhanced: true,
      },
      { status: 500 },
    )
  }

  const payload = sanitizeScannerResponse(fallback)

  if (!payload.opportunities.length) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute enhanced scan",
        details: "Fallback dataset is empty",
        enhanced: true,
      },
      { status: 500 },
    )
  }

  const metadata = {
    ...payload.metadata,
    source: typeof payload.metadata.source === "string" ? payload.metadata.source : "enhanced-fallback",
    fallback: true,
    fallbackReason: reason,
    enhancedScanner: true,
    ...(details ? { fallbackDetails: details } : {}),
  }

  return NextResponse.json({
    success: true,
    timestamp: payload.timestamp,
    opportunities: payload.opportunities,
    source: metadata.source,
    totalEvaluated: payload.totalEvaluated,
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

    if (fallbackOnly) {
      const reasonParam = url.searchParams.get("reason")
      const detailsParam = url.searchParams.get("details")
      return await buildFallbackResponse(
        reasonParam && reasonParam.trim().length > 0 ? reasonParam : "client_requested",
        detailsParam && detailsParam.trim().length > 0 ? detailsParam : "Client requested fallback dataset",
      )
    }

    // Execute Enhanced Python Scanner
    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    return await new Promise<NextResponse>((resolve) => {
      // Use the enhanced scanner service
      const python = spawn(pythonPath, ["-m", "src.scanner.enhanced_service"], {
        env: { ...process.env, PYTHONPATH: process.cwd() },
      })

      let stdoutBuffer = ""
      let stderrBuffer = ""
      let settled = false

      const settle = (response: NextResponse) => {
        if (!settled) {
          settled = true
          clearTimeout(timeoutId)
          resolve(response)
        }
      }

      const fallbackAndSettle = async (reason: string, details?: string) => {
        const response = await buildFallbackResponse(reason, details)
        settle(response)
      }

      const timeoutId = setTimeout(() => {
        console.warn(
          `Enhanced scanner exceeded ${FALLBACK_TIMEOUT_MS / 1000} seconds. Terminating and serving fallback.`,
        )
        try {
          python.kill("SIGKILL")
        } catch (killError) {
          console.error("Failed to terminate enhanced scanner after timeout:", killError)
        }
        void fallbackAndSettle("timeout", `Enhanced scanner exceeded ${FALLBACK_TIMEOUT_MS / 1000} seconds`)
      }, FALLBACK_TIMEOUT_MS)

      python.stdout.on("data", (data) => {
        stdoutBuffer += data.toString()
      })

      python.stderr.on("data", (data) => {
        stderrBuffer += data.toString()
      })

      python.on("error", (error) => {
        console.error("Failed to start enhanced scanner process:", error)
        void fallbackAndSettle("spawn_error", error instanceof Error ? error.message : String(error))
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Enhanced scanner error:", stderrBuffer)
          void fallbackAndSettle("exit_non_zero", stderrBuffer || `Enhanced scanner exited with code ${code}`)
          return
        }

        try {
          const parsedOutput = parseScannerJson(stdoutBuffer, stderrBuffer)

          if (!parsedOutput) {
            console.warn("Enhanced scanner produced no JSON payload", { stdout: stdoutBuffer, stderr: stderrBuffer })
            void fallbackAndSettle("no_payload", "Enhanced scanner emitted no JSON payload")
            return
          }

          const payload = sanitizeScannerResponse(parsedOutput)

          if (!payload.opportunities.length) {
            console.warn("Enhanced scanner returned zero qualifying opportunities. Serving fallback dataset.")
            void fallbackAndSettle("no_enhanced_results", "Enhanced scanner returned no qualifying opportunities")
            return
          }

          settle(buildSuccessResponse(payload))
        } catch (error) {
          console.error("Error parsing enhanced scanner output:", error)
          console.error("Raw stdout:", stdoutBuffer)
          console.error("Raw stderr:", stderrBuffer)
          void fallbackAndSettle("parse_error", error instanceof Error ? error.message : String(error))
        }
      })
    })
  } catch (error) {
    console.error("Error executing enhanced scanner:", error)
    return await buildFallbackResponse(
      "handler_failure",
      error instanceof Error ? error.message : String(error),
    )
  }
}