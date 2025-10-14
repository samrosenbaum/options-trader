import { NextResponse } from "next/server"

import { resolvePythonExecutable } from "@/lib/server/python"
import { determineScannerExecutionPolicy } from "@/lib/server/scanner-runtime"
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

const FALLBACK_TIMEOUT_MS = 140_000 // Increased timeout for cloud enhanced processing
const DEBUG_LOG_TAIL_LENGTH = 2_000

const buildLogTail = (value: string | undefined) => {
  if (!value) {
    return undefined
  }

  if (value.length <= DEBUG_LOG_TAIL_LENGTH) {
    return value
  }

  return value.slice(value.length - DEBUG_LOG_TAIL_LENGTH)
}

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

    if (fallbackOnly) {
      const reasonParam = url.searchParams.get("reason")
      const detailsParam = url.searchParams.get("details")
      return buildFallbackResponse(
        reasonParam && reasonParam.trim().length > 0 ? reasonParam : "client_requested",
        detailsParam && detailsParam.trim().length > 0 ? detailsParam : "Client requested fallback dataset",
        { requestedViaQuery: true },
      )
    }

    const forcedPolicy = determineScannerExecutionPolicy()

    if (forcedPolicy?.forceFallback) {
      console.warn(
        `Enhanced scanner disabled (${forcedPolicy.reason}). Serving fallback dataset instead.`,
      )
      return buildFallbackResponse(forcedPolicy.reason, forcedPolicy.details, {
        executionPolicy: forcedPolicy,
      })
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

      const fallbackAndSettle = (
        reason: string,
        details?: string,
        debug?: Record<string, unknown>,
      ) => {
        const response = buildFallbackResponse(reason, details, debug)
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
        fallbackAndSettle("timeout", `Enhanced scanner exceeded ${FALLBACK_TIMEOUT_MS / 1000} seconds`, {
          stdoutTail: buildLogTail(stdoutBuffer),
          stderrTail: buildLogTail(stderrBuffer),
        })
      }, FALLBACK_TIMEOUT_MS)

      python.stdout.on("data", (data) => {
        stdoutBuffer += data.toString()
      })

      python.stderr.on("data", (data) => {
        stderrBuffer += data.toString()
      })

      python.on("error", (error) => {
        console.error("Failed to start enhanced scanner process:", error)
        fallbackAndSettle("spawn_error", error instanceof Error ? error.message : String(error))
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Enhanced scanner error:", stderrBuffer)
          const exitMessage = stderrBuffer || `Enhanced scanner exited with code ${code}`
          fallbackAndSettle("exit_non_zero", exitMessage, {
            exitCode: code,
            stdoutTail: buildLogTail(stdoutBuffer),
            stderrTail: buildLogTail(stderrBuffer),
          })
          return
        }

        try {
          const parsedOutput = parseScannerJson(stdoutBuffer, stderrBuffer)

          if (!parsedOutput) {
            console.warn("Enhanced scanner produced no JSON payload", { stdout: stdoutBuffer, stderr: stderrBuffer })
            fallbackAndSettle("no_payload", "Enhanced scanner emitted no JSON payload", {
              stdoutTail: buildLogTail(stdoutBuffer),
              stderrTail: buildLogTail(stderrBuffer),
            })
            return
          }

          const payload = sanitizeScannerResponse(parsedOutput)

          if (!payload.opportunities.length) {
            console.warn("Enhanced scanner returned zero qualifying opportunities. Serving fallback dataset.")
            fallbackAndSettle(
              "no_enhanced_results",
              "Enhanced scanner returned no qualifying opportunities",
              {
                totalEvaluated: payload.totalEvaluated,
                sanitizedMetadata: payload.metadata,
                rawOpportunityCount: Array.isArray(parsedOutput.opportunities)
                  ? parsedOutput.opportunities.length
                  : null,
                sanitizedOpportunityCount: payload.opportunities.length,
                stdoutTail: buildLogTail(stdoutBuffer),
                stderrTail: buildLogTail(stderrBuffer),
              },
            )
            return
          }

          settle(buildSuccessResponse(payload))
        } catch (error) {
          console.error("Error parsing enhanced scanner output:", error)
          console.error("Raw stdout:", stdoutBuffer)
          console.error("Raw stderr:", stderrBuffer)
          fallbackAndSettle("parse_error", error instanceof Error ? error.message : String(error), {
            stdoutTail: buildLogTail(stdoutBuffer),
            stderrTail: buildLogTail(stderrBuffer),
          })
        }
      })
    })
  } catch (error) {
    console.error("Error executing enhanced scanner:", error)
    return buildFallbackResponse("handler_failure", error instanceof Error ? error.message : String(error))
  }
}