import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  try {
    // Execute Python script to scan for opportunities
    const { spawn } = await import("child_process")

    return new Promise((resolve) => {
      const python = spawn("./venv/bin/python3", ["scripts/fetch_options_data.py"], {
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
            const rawOpportunities = JSON.parse(jsonString)
            
            // Transform the data to match frontend interface
            const opportunities = rawOpportunities.map((opp: any) => {
              const profitIntel = opp.metadata?.market_data?.profit_probability || opp.score?.metadata?.profit_probability || {}
              const riskIntel = opp.metadata?.market_data?.risk_metrics || opp.score?.metadata?.risk_metrics || {}
              const projectedReturns = opp.metadata?.market_data?.projected_returns || {}
              const moveIntel = opp.metadata?.market_data?.move_rationale || opp.score?.metadata?.move_rationale || null
              const eventIntel = opp.metadata?.market_data?.event_intel || opp.score?.metadata?.event_intel || null
              const tenMoveReturn = projectedReturns['10%'] ?? 0
              const maxReturnPct = projectedReturns['30%'] ?? 0
              const breakevenMovePct = profitIntel?.required_move_pct
              const probabilityPercent = typeof profitIntel?.probability === 'number' ? profitIntel.probability * 100 : null
              const riskRewardRatio = typeof riskIntel?.reward_to_risk === 'number' ? riskIntel.reward_to_risk : null
              const contractCost = opp.contract?.last_price ? opp.contract.last_price * 100 : 0
              const maxLossAmount = typeof riskIntel?.max_loss_amount === 'number'
                ? riskIntel.max_loss_amount
                : contractCost
              const pythonMaxLossPct = typeof riskIntel?.max_loss_pct === 'number' ? riskIntel.max_loss_pct : null
              const normalizedLossPct = contractCost > 0 && maxLossAmount > 0
                ? (maxLossAmount / contractCost) * 100
                : null
              let maxLossPercent = pythonMaxLossPct ?? (normalizedLossPct ?? (contractCost > 0 ? 100 : 0))
              if (normalizedLossPct !== null && Number.isFinite(normalizedLossPct)) {
                if (!Number.isFinite(maxLossPercent) || Math.abs(maxLossPercent - normalizedLossPct) > 5) {
                  maxLossPercent = normalizedLossPct
                }
              }
              const maxReturnPercent = typeof riskIntel?.max_return_pct === 'number'
                ? riskIntel.max_return_pct
                : maxReturnPct ? maxReturnPct * 100 : 0
              const tenPctReturnPercent = typeof riskIntel?.ten_pct_move_return_pct === 'number'
                ? riskIntel.ten_pct_move_return_pct
                : tenMoveReturn ? tenMoveReturn * 100 : 0
              const tenPctReturnAmount = typeof riskIntel?.ten_pct_move_return_amount === 'number'
                ? riskIntel.ten_pct_move_return_amount
                : (tenPctReturnPercent / 100) * maxLossAmount
              const maxReturnAmount = typeof riskIntel?.max_return_amount === 'number'
                ? riskIntel.max_return_amount
                : (maxReturnPercent / 100) * maxLossAmount

              const moveAnalysis = moveIntel
                ? {
                    expectedMovePercent: typeof moveIntel?.expected_move_pct === 'number' ? moveIntel.expected_move_pct : null,
                    impliedVol: typeof moveIntel?.implied_vol === 'number' ? moveIntel.implied_vol : null,
                    daysToExpiration: typeof moveIntel?.days_to_expiration === 'number' ? moveIntel.days_to_expiration : null,
                    thresholds: Array.isArray(moveIntel?.thresholds)
                      ? moveIntel.thresholds.map((entry: any) => ({
                        threshold: typeof entry?.threshold === 'string'
                          ? entry.threshold
                          : typeof entry?.threshold === 'number'
                            ? `${entry.threshold}%`
                            : '',
                        baseProbability: typeof entry?.base_probability_pct === 'number' ? entry.base_probability_pct : null,
                        conviction: typeof entry?.conviction_pct === 'number' ? entry.conviction_pct : null,
                        summary: typeof entry?.summary === 'string' ? entry.summary : '',
                        factors: Array.isArray(entry?.factors)
                          ? entry.factors.map((factor: any) => ({
                            label: typeof factor?.label === 'string' ? factor.label : '',
                            detail: typeof factor?.detail === 'string' ? factor.detail : '',
                            weight: typeof factor?.weight === 'number' ? factor.weight : null,
                          }))
                          : [],
                        historicalSupport: entry?.historical_support
                          ? {
                            horizonDays: typeof entry.historical_support?.horizon_days === 'number'
                              ? entry.historical_support.horizon_days
                              : null,
                            probability: typeof entry.historical_support?.probability_pct === 'number'
                              ? entry.historical_support.probability_pct
                              : null,
                          }
                          : null,
                      }))
                      : [],
                    drivers: Array.isArray(moveIntel?.primary_drivers) ? moveIntel.primary_drivers : [],
                  }
                : null

              return {
                symbol: opp.symbol,
                optionType: opp.contract?.option_type || 'call',
                strike: opp.contract?.strike || 0,
                expiration: opp.contract?.expiration || '',
                premium: opp.contract?.last_price || 0,
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
                riskLevel: opp.tags?.includes('thin-market') ? 'high' : opp.tags?.includes('liquidity') ? 'low' : 'medium',
                potentialReturn: tenPctReturnPercent,
                potentialReturnAmount: tenPctReturnAmount,
                maxReturn: maxReturnPercent,
                maxReturnAmount,
                maxLoss: maxLossPercent,
                maxLossPercent,
                maxLossAmount,
                breakeven: opp.contract?.strike ? (opp.contract.option_type === 'call' ? opp.contract.strike + opp.contract.last_price : opp.contract.strike - opp.contract.last_price) : 0,
                ivRank: opp.iv_rank || 0,
                volumeRatio: opp.metadata?.market_data?.volume_ratio || 0,
                greeks: opp.greeks || { delta: 0, gamma: 0, theta: 0, vega: 0 },
                daysToExpiration: opp.contract?.expiration ? Math.ceil((new Date(opp.contract.expiration).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0,
                returnsAnalysis: [
                  { move: '10%', return: tenPctReturnPercent },
                  { move: '20%', return: projectedReturns['20%'] ? projectedReturns['20%'] * 100 : 0 },
                  { move: '30%', return: maxReturnPct ? maxReturnPct * 100 : 0 }
                ],
                probabilityOfProfit: probabilityPercent,
                profitProbabilityExplanation: typeof profitIntel?.explanation === 'string' ? profitIntel.explanation : '',
                breakevenMovePercent: typeof breakevenMovePct === 'number' ? breakevenMovePct * 100 : null,
                breakevenPrice: typeof profitIntel?.breakeven_price === 'number' ? profitIntel.breakeven_price : null,
                riskRewardRatio: riskRewardRatio,
                shortTermRiskRewardRatio: typeof riskIntel?.ten_pct_move_reward_to_risk === 'number' ? riskIntel.ten_pct_move_reward_to_risk : null,
                moveAnalysis,
                eventIntel: eventIntel || null,
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
          resolve(NextResponse.json({ success: false, error: "Failed to parse scan results", details: error.message }, { status: 500 }))
        }
      })
    })
  } catch (error) {
    console.error("Error executing Python script:", error)
    return NextResponse.json({ success: false, error: "Failed to execute scan" }, { status: 500 })
  }
}
