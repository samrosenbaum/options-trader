import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"
import { ensureOptionGreeks } from "@/lib/math/greeks"

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
  reasoning: string[]
  catalysts: string[]
  patterns: string[]
  riskLevel: string
  potentialReturn: number
  potentialReturnAmount: number
  maxReturn: number
  maxReturnAmount: number
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
}

interface ScannerMetadata {
  fetchedAt?: string
  source?: string
  totalEvaluated?: number
  symbolLimit?: number
  opportunityCount?: number
  symbols?: string[]
}

interface ScannerResponse {
  opportunities?: ScannerOpportunity[]
  metadata?: ScannerMetadata & Record<string, unknown>
  totalEvaluated?: number
}

export const runtime = "nodejs"
export const maxDuration = 60

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

export async function GET() {
  try {
    // Execute Python script to scan for opportunities
    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    return await new Promise<NextResponse>((resolve) => {
      const python = spawn(pythonPath, ["-m", "src.scanner.service"], {
        env: { ...process.env, PYTHONPATH: process.cwd() }
      })

      let stdoutBuffer = ""
      let stderrBuffer = ""

      python.stdout.on("data", (data) => {
        stdoutBuffer += data.toString()
      })

      python.stderr.on("data", (data) => {
        stderrBuffer += data.toString()
      })

      python.on("error", (error) => {
        console.error("Failed to start python process:", error)
        resolve(
          NextResponse.json(
            { success: false, error: "Failed to execute scan", details: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          ),
        )
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Python script error:", stderrBuffer)
          resolve(
            NextResponse.json(
              { success: false, error: "Failed to scan options", details: stderrBuffer },
              { status: 500 },
            ),
          )
          return
        }

        try {
          const parsedOutput = parseScannerJson(stdoutBuffer, stderrBuffer)

          if (!parsedOutput) {
            console.warn("Scanner produced no JSON payload", { stdout: stdoutBuffer, stderr: stderrBuffer })
            resolve(
              NextResponse.json({
                success: true,
                timestamp: new Date().toISOString(),
                opportunities: [],
                source: "adapter",
                totalEvaluated: 0,
              }),
            )
            return
          }

          const parsed = parsedOutput
          const metadata = parsed.metadata ?? {}
          const rawOpportunities = Array.isArray(parsed.opportunities) ? parsed.opportunities : []

          const sanitized = rawOpportunities
            .filter((opp) => {
              const probability = normalizePercent(opp.probabilityOfProfit)
              return probability === null || probability > 0
            })
            .map((opp) => {
              const contract = {
                option_type: opp.optionType as "call" | "put",
                strike: opp.strike,
                expiration: opp.expiration,
                last_price: opp.premium,
                bid: opp.bid,
                ask: opp.ask,
                volume: opp.volume,
                open_interest: opp.openInterest,
                implied_volatility: opp.impliedVolatility,
                stock_price: opp.stockPrice,
              }

              const greeks = ensureOptionGreeks(opp.greeks, contract)

              return {
                ...opp,
                probabilityOfProfit: normalizePercent(opp.probabilityOfProfit) ?? 0,
                breakevenMovePercent: normalizePercent(opp.breakevenMovePercent) ?? 0,
                potentialReturn: normalizePercent(opp.potentialReturn) ?? 0,
                maxReturn: normalizePercent(opp.maxReturn) ?? 0,
                returnsAnalysis: sanitizeReturns(opp.returnsAnalysis ?? []),
                greeks,
              }
            })

          sanitized.sort((a, b) => {
            const scoreA = Number.isFinite(a.score) ? a.score : -Infinity
            const scoreB = Number.isFinite(b.score) ? b.score : -Infinity
            if (scoreA !== scoreB) {
              return scoreB - scoreA
            }

            const riskA = Number.isFinite(a.riskRewardRatio ?? NaN) ? (a.riskRewardRatio as number) : -Infinity
            const riskB = Number.isFinite(b.riskRewardRatio ?? NaN) ? (b.riskRewardRatio as number) : -Infinity
            if (riskA !== riskB) {
              return riskB - riskA
            }

            const probA = Number.isFinite(a.probabilityOfProfit) ? a.probabilityOfProfit : -Infinity
            const probB = Number.isFinite(b.probabilityOfProfit) ? b.probabilityOfProfit : -Infinity
            if (probA !== probB) {
              return probB - probA
            }

            return (Number.isFinite(b.potentialReturn) ? b.potentialReturn : -Infinity) -
              (Number.isFinite(a.potentialReturn) ? a.potentialReturn : -Infinity)
          })

          const timestamp = typeof metadata.fetchedAt === "string" ? metadata.fetchedAt : new Date().toISOString()
          const totalEvaluated =
            typeof parsed.totalEvaluated === "number" && Number.isFinite(parsed.totalEvaluated)
              ? parsed.totalEvaluated
              : typeof metadata.totalEvaluated === "number" && Number.isFinite(metadata.totalEvaluated)
                ? metadata.totalEvaluated
                : sanitized.length

          resolve(
            NextResponse.json({
              success: true,
              timestamp,
              opportunities: sanitized,
              source: metadata.source ?? "adapter",
              totalEvaluated,
              metadata,
            }),
          )
        } catch (error) {
          console.error("Error parsing Python output:", error)
          console.error("Raw stdout:", stdoutBuffer)
          console.error("Raw stderr:", stderrBuffer)
          resolve(
            NextResponse.json(
              {
                success: false,
                error: "Failed to parse scan results",
                details: error instanceof Error ? error.message : String(error),
              },
              { status: 500 },
            ),
          )
        }
      })
    })
  } catch (error) {
    console.error("Error executing Python script:", error)
    return NextResponse.json({ success: false, error: "Failed to execute scan" }, { status: 500 })
  }
}
