import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"
import { ensureOptionGreeks } from "@/lib/math/greeks"
import path from "path"

interface ProbabilityIntel {
  probability?: number
  required_move_pct?: number
  explanation?: string
  breakeven_price?: number
}

interface RiskIntel {
  max_loss_pct?: number
  reward_to_risk?: number
  ten_pct_move_reward_to_risk?: number
}

interface MarketDataIntel {
  profit_probability?: ProbabilityIntel
  risk_metrics?: RiskIntel
  projected_returns?: Record<string, number>
  volume_ratio?: number
}

interface RawOpportunity {
  symbol: string
  contract?: {
    option_type?: "call" | "put"
    strike?: number
    expiration?: string
    last_price?: number
    bid?: number
    ask?: number
    volume?: number
    open_interest?: number
    implied_volatility?: number
    stock_price?: number
  }
  greeks?: {
    delta?: number
    gamma?: number
    theta?: number
    vega?: number
  }
  score?: {
    total_score?: number
    metadata?: {
      profit_probability?: ProbabilityIntel
      risk_metrics?: RiskIntel
      projected_returns?: Record<string, number>
    }
  }
  metadata?: {
    market_data?: MarketDataIntel
  }
  confidence?: number
  reasons?: string[]
  tags?: string[]
  iv_rank?: number
}

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  try {
    // Execute Python script to scan for opportunities
    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()
    const scriptPath = path.join(process.cwd(), "scripts", "fetch_options_data.py")

    return await new Promise<NextResponse>((resolve) => {
      const python = spawn(pythonPath, [scriptPath], {
        env: { ...process.env, PYTHONPATH: process.cwd() }
      })

      let dataString = ""
      let errorString = ""

      python.stdout.on("data", (data) => {
        dataString += data.toString()
      })

      python.stderr.on("data", (data) => {
        errorString += data.toString()
        // Also capture stderr in case JSON is output there
        dataString += data.toString()
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
          console.error("Python script error:", errorString)
          resolve(
            NextResponse.json(
              { success: false, error: "Failed to scan options", details: errorString },
              { status: 500 },
            ),
          )
          return
        }

        try {
          console.log("Total data length:", dataString.length)
          console.log("Data ends with:", dataString.slice(-200))
          
          // Try to find the JSON array - look for the last complete array
          const lines = dataString.split('\n')
          let jsonString = ''
          
          // Find the last line that starts with '['
          for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].trim().startsWith('[')) {
              // Found start of JSON array, reconstruct from here
              jsonString = lines.slice(i).join('\n')
              break
            }
          }

          if (jsonString) {
            console.log("JSON string length:", jsonString.length)
            console.log("JSON starts with:", jsonString.slice(0, 100))
            const parsed = JSON.parse(jsonString)
            const rawOpportunities: RawOpportunity[] = Array.isArray(parsed) ? parsed : []

            // Transform the data to match frontend interface
            const opportunities = rawOpportunities.map((opp) => {
              const greeks = ensureOptionGreeks(opp.greeks, opp.contract)
              const profitIntel =
                opp.metadata?.market_data?.profit_probability ??
                opp.score?.metadata?.profit_probability
              const riskIntel =
                opp.metadata?.market_data?.risk_metrics ?? opp.score?.metadata?.risk_metrics
              const projectedReturns = opp.metadata?.market_data?.projected_returns ?? {}
              const tenMoveReturn = projectedReturns['10%'] ?? 0
              const maxReturnPct = projectedReturns['30%'] ?? 0
              const breakevenMovePct = profitIntel?.required_move_pct
              const probabilityPercent =
                typeof profitIntel?.probability === 'number' ? profitIntel.probability * 100 : null
              const riskRewardRatio =
                typeof riskIntel?.reward_to_risk === 'number' ? riskIntel.reward_to_risk : null
              const optionType = opp.contract?.option_type || 'call'
              const strike = opp.contract?.strike ?? 0
              const lastPrice = opp.contract?.last_price ?? 0
              const breakeven =
                strike && lastPrice
                  ? optionType === 'call'
                    ? strike + lastPrice
                    : strike - lastPrice
                  : 0

              return {
                symbol: opp.symbol,
                optionType,
                strike,
                expiration: opp.contract?.expiration || '',
                premium: lastPrice,
                bid: opp.contract?.bid || 0,
                ask: opp.contract?.ask || 0,
                volume: opp.contract?.volume || 0,
                openInterest: opp.contract?.open_interest || 0,
                impliedVolatility: opp.contract?.implied_volatility || 0,
                stockPrice: opp.contract?.stock_price || 0,
                score: opp.score?.total_score || 0,
                confidence: opp.confidence || 0,
                reasoning: opp.reasons || [],
                patterns: opp.tags || [],
                catalysts: ['Technical Analysis', 'Volume Analysis'],
                riskLevel: opp.tags?.includes('thin-market')
                  ? 'high'
                  : opp.tags?.includes('liquidity')
                    ? 'low'
                    : 'medium',
                potentialReturn: tenMoveReturn ? tenMoveReturn * 100 : 0,
                maxReturn: maxReturnPct ? maxReturnPct * 100 : 0,
                maxLoss: typeof riskIntel?.max_loss_pct === 'number' ? riskIntel.max_loss_pct : 100,
                breakeven,
                ivRank: opp.iv_rank || 0,
                volumeRatio: opp.metadata?.market_data?.volume_ratio || 0,
                greeks,
                daysToExpiration: opp.contract?.expiration
                  ? Math.ceil(
                      (new Date(opp.contract.expiration).getTime() - new Date().getTime()) /
                        (1000 * 60 * 60 * 24),
                    )
                  : 0,
                returnsAnalysis: [
                  { move: '10%', return: tenMoveReturn ? tenMoveReturn * 100 : 0 },
                  { move: '20%', return: projectedReturns['20%'] ? projectedReturns['20%'] * 100 : 0 },
                  { move: '30%', return: maxReturnPct ? maxReturnPct * 100 : 0 }
                ],
                probabilityOfProfit: probabilityPercent,
                profitProbabilityExplanation:
                  typeof profitIntel?.explanation === 'string' ? profitIntel.explanation : '',
                breakevenMovePercent: typeof breakevenMovePct === 'number' ? breakevenMovePct * 100 : null,
                breakevenPrice: typeof profitIntel?.breakeven_price === 'number' ? profitIntel.breakeven_price : null,
                riskRewardRatio,
                shortTermRiskRewardRatio:
                  typeof riskIntel?.ten_pct_move_reward_to_risk === 'number'
                    ? riskIntel.ten_pct_move_reward_to_risk
                    : null,
              }
            })

            resolve(
              NextResponse.json({
                success: true,
                timestamp: new Date().toISOString(),
                opportunities,
                source: "yfinance",
              }),
            )
          } else {
            console.log("No JSON array found, returning empty results")
            resolve(
              NextResponse.json({
                success: true,
                timestamp: new Date().toISOString(),
                opportunities: [],
                source: "yfinance",
              }),
            )
          }
        } catch (error) {
          console.error("Error parsing Python output:", error)
          console.error("Raw data:", dataString)
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
