import { NextResponse } from "next/server"

import { resolvePythonExecutable } from "@/lib/server/python"
import { ensureOptionGreeks } from "@/lib/math/greeks"
import { determineScannerExecutionPolicy } from "@/lib/server/scanner-runtime"

interface ScannerOpportunity {
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
  swingSignal?: {
    symbol: string
    compositeScore: number
    classification: string
    factors: Array<{
      name: string
      score: number
      rationale: string
      details: Record<string, unknown>
    }>
    metadata: Record<string, unknown>
  } | null
  swingSignalError?: string
  metadata?: Record<string, unknown>
}

interface ScannerMetadata {
  fetchedAt?: string
  source?: string
  totalEvaluated?: number
  symbolLimit?: number
  opportunityCount?: number
  symbols?: string[]
  fallback?: boolean
  fallbackReason?: string
  fallbackDetails?: string
}

interface ScannerResponse {
  opportunities?: ScannerOpportunity[]
  metadata?: ScannerMetadata & Record<string, unknown>
  totalEvaluated?: number
}

export const runtime = "nodejs"
export const maxDuration = 300 // Increased to 5 minutes to accommodate historical analysis

const FALLBACK_TIMEOUT_MS = 110_000 // Increased to 110s for cloud cold starts and latency
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

const sanitizeReturns = (returns: ScannerOpportunity["returnsAnalysis"]): ScannerOpportunity["returnsAnalysis"] => {
  if (!Array.isArray(returns)) {
    return []
  }

  return returns.map((entry) => ({
    move: entry.move,
    return: normalizePercent(entry.return) ?? 0,
  }))
}

const parseScannerJson = (stdout: string, stderr: string): ScannerResponse | null => {
  const attemptParse = (raw: string): ScannerResponse | null => {
    const trimmed = raw.trim()
    if (!trimmed) {
      return null
    }

    // Fast path: the scanner prints JSON to stdout without additional logs.
    try {
      return JSON.parse(trimmed) as ScannerResponse
    } catch {
      // Fall through to try extracting the last JSON looking block.
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
      return JSON.parse(candidate.slice(0, endIndex + 1)) as ScannerResponse
    } catch {
      return null
    }
  }

  return attemptParse(stdout) ?? attemptParse(`${stdout}\n${stderr}`)
}

interface SanitizedPayload {
  opportunities: ScannerOpportunity[]
  metadata: ScannerMetadata & Record<string, unknown>
  timestamp: string
  totalEvaluated: number
}

const sanitizeScannerResponse = (parsed: ScannerResponse): SanitizedPayload => {
  const metadata: ScannerMetadata & Record<string, unknown> = {
    ...(parsed.metadata ?? {}),
  }

  const rawOpportunities = Array.isArray(parsed.opportunities) ? parsed.opportunities : []
  const opportunities: ScannerOpportunity[] = []
  const fallbackCandidates: ScannerOpportunity[] = []

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

    const sanitized: ScannerOpportunity = {
      ...opp,
      probabilityOfProfit: normalizePercent(opp.probabilityOfProfit) ?? 0,
      breakevenMovePercent: normalizePercent(opp.breakevenMovePercent) ?? 0,
      potentialReturn: normalizePercent(opp.potentialReturn) ?? 0,
      maxReturn: normalizePercent(opp.maxReturn) ?? 0,
      returnsAnalysis: sanitizeReturns(opp.returnsAnalysis ?? []),
      greeks,
    }

    const selectionMode = typeof sanitized.metadata?.selectionMode === "string"
      ? sanitized.metadata.selectionMode
      : null

    if (selectionMode === "relaxed") {
      fallbackCandidates.push(sanitized)
    } else {
      opportunities.push(sanitized)
    }
  }

  const expectedValueKey = (item: ScannerOpportunity) => {
    const prob = (typeof item.probabilityOfProfit === "number" ? item.probabilityOfProfit : 0) / 100
    const expectedReturn = typeof item.expectedMoveReturn === "number" ? item.expectedMoveReturn : item.potentialReturn || 0
    const scoreComponent = typeof item.score === "number" ? item.score * 0.1 : 0
    return prob * expectedReturn + scoreComponent
  }

  opportunities.sort((a, b) => expectedValueKey(b) - expectedValueKey(a))

  if (!opportunities.length && fallbackCandidates.length) {
    console.warn(
      `ℹ️  No opportunities met the strict filter – returning ${fallbackCandidates.length} relaxed candidates`,
    )
    fallbackCandidates.sort((a, b) => expectedValueKey(b) - expectedValueKey(a))
    const maxRelaxed = 10
    opportunities.push(...fallbackCandidates.slice(0, maxRelaxed))
  }

  const maxOpportunities = 20
  if (opportunities.length > maxOpportunities) {
    console.warn(`📊 Limiting output to top ${maxOpportunities} of ${opportunities.length} opportunities`)
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
  const source = typeof metadata.source === "string" ? metadata.source : "adapter"

  return NextResponse.json({
    success: true,
    timestamp: payload.timestamp,
    opportunities: payload.opportunities,
    source,
    totalEvaluated: payload.totalEvaluated,
    metadata,
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
    source: "fallback",
    fallback: true,
    fallbackReason: reason,
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
        `Python scanner disabled (${forcedPolicy.reason}). Serving fallback dataset instead.`,
      )
      return buildFallbackResponse(forcedPolicy.reason, forcedPolicy.details, {
        executionPolicy: forcedPolicy,
      })
    }

    // Execute Python script to scan for opportunities
    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    return await new Promise<NextResponse>((resolve) => {
      const python = spawn(pythonPath, ["-m", "src.scanner.service"], {
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
          `Python scan exceeded ${FALLBACK_TIMEOUT_MS / 1000} seconds. Terminating process and serving fallback results.`,
        )
        try {
          python.kill("SIGKILL")
        } catch (killError) {
          console.error("Failed to terminate python process after timeout:", killError)
        }
        fallbackAndSettle("timeout", `Scanner exceeded ${FALLBACK_TIMEOUT_MS / 1000} seconds`, {
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
        console.error("Failed to start python process:", error)
        fallbackAndSettle("spawn_error", error instanceof Error ? error.message : String(error))
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Python script error:", stderrBuffer)
          const exitMessage = stderrBuffer || `Python exited with code ${code}`
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
            console.warn("Scanner produced no JSON payload", { stdout: stdoutBuffer, stderr: stderrBuffer })
            fallbackAndSettle("no_payload", "Python emitted no JSON payload", {
              stdoutTail: buildLogTail(stdoutBuffer),
              stderrTail: buildLogTail(stderrBuffer),
            })
            return
          }

          const payload = sanitizeScannerResponse(parsedOutput)

          if (!payload.opportunities.length) {
            console.warn("Scanner returned zero qualifying opportunities. Serving fallback dataset.")
            fallbackAndSettle("no_python_results", "Python scan returned no qualifying opportunities", {
              totalEvaluated: payload.totalEvaluated,
              sanitizedMetadata: payload.metadata,
              rawOpportunityCount: Array.isArray(parsedOutput.opportunities)
                ? parsedOutput.opportunities.length
                : null,
              sanitizedOpportunityCount: payload.opportunities.length,
              stdoutTail: buildLogTail(stdoutBuffer),
              stderrTail: buildLogTail(stderrBuffer),
            })
            return
          }

          settle(buildSuccessResponse(payload))
        } catch (error) {
          console.error("Error parsing Python output:", error)
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
    console.error("Error executing Python script:", error)
    return buildFallbackResponse("handler_failure", error instanceof Error ? error.message : String(error))
  }
}
