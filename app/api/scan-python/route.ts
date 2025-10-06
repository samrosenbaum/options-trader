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
            const opportunities = rawOpportunities.map((opp: any) => ({
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
              potentialReturn: opp.metadata?.market_data?.projected_returns?.['10%'] ? opp.metadata.market_data.projected_returns['10%'] * 100 : 0,
              maxReturn: opp.metadata?.market_data?.projected_returns?.['30%'] ? opp.metadata.market_data.projected_returns['30%'] * 100 : 0,
              maxLoss: opp.contract?.last_price || 0,
              breakeven: opp.contract?.strike ? (opp.contract.option_type === 'call' ? opp.contract.strike + opp.contract.last_price : opp.contract.strike - opp.contract.last_price) : 0,
              ivRank: opp.iv_rank || 0,
              volumeRatio: opp.metadata?.market_data?.volume_ratio || 0,
              greeks: opp.greeks || { delta: 0, gamma: 0, theta: 0, vega: 0 },
              daysToExpiration: opp.contract?.expiration ? Math.ceil((new Date(opp.contract.expiration).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0,
              returnsAnalysis: [
                { move: '10%', return: opp.metadata?.market_data?.projected_returns?.['10%'] ? opp.metadata.market_data.projected_returns['10%'] * 100 : 0 },
                { move: '20%', return: opp.metadata?.market_data?.projected_returns?.['20%'] ? opp.metadata.market_data.projected_returns['20%'] * 100 : 0 },
                { move: '30%', return: opp.metadata?.market_data?.projected_returns?.['30%'] ? opp.metadata.market_data.projected_returns['30%'] * 100 : 0 }
              ]
            }))
            
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
