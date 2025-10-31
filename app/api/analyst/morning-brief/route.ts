import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"

export const runtime = "nodejs"
export const maxDuration = 180 // 3 minutes for comprehensive analysis

/**
 * Generate Morning Brief (7:00 AM)
 * Pre-market intelligence: UOA signals, earnings, gaps, watchlist
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { symbols, user_portfolio } = body

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        {
          error: "symbols array required",
          example: { symbols: ["AAPL", "TSLA", "NVDA"] }
        },
        { status: 400 }
      )
    }

    console.log(`🌅 Generating morning brief for ${symbols.length} symbols...`)

    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    const pythonScript = `
import json
import sys
sys.path.insert(0, '.')

from src.analyst.morning_brief import generate_morning_brief, format_brief_for_display

symbols = ${JSON.stringify(symbols)}
user_portfolio = ${user_portfolio ? JSON.stringify(user_portfolio) : 'None'}

try:
    brief = generate_morning_brief(symbols, user_portfolio)

    # Convert datetime objects to ISO strings
    brief_serializable = {
        'timestamp': brief['timestamp'].isoformat(),
        'uoa_signals': brief['uoa_signals'],
        'earnings_today': brief['earnings_today'],
        'premarket_movers': brief['premarket_movers'],
        'watchlist': brief['watchlist'],
        'portfolio_alerts': brief['portfolio_alerts'],
        'market_conditions': brief['market_conditions'],
        'market_snapshots': brief.get('market_snapshots', {}),
        'symbol_summaries': brief.get('symbol_summaries', {}),
        'market_regime': brief.get('market_regime', {}),
        'meta': brief.get('meta', {})
    }

    # Also generate formatted text version
    formatted_text = format_brief_for_display(brief)

    output = {
        'brief': brief_serializable,
        'formatted_text': formatted_text
    }

    print(json.dumps(output))
except Exception as e:
    import traceback
    print(json.dumps({'error': str(e), 'traceback': traceback.format_exc()}), file=sys.stderr)
    sys.exit(1)
`

    return await new Promise<NextResponse>((resolve) => {
      const python = spawn(pythonPath, ["-c", pythonScript], {
        env: { ...process.env, PYTHONPATH: process.cwd() },
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
            { error: "Failed to generate morning brief", details: error.message },
            { status: 500 }
          )
        )
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Python script error:", stderrBuffer)
          resolve(
            NextResponse.json(
              { error: "Morning brief generation failed", details: stderrBuffer },
              { status: 500 }
            )
          )
          return
        }

        try {
          // Parse JSON from stdout
          const lines = stdoutBuffer.trim().split('\n')
          const jsonLine = lines[lines.length - 1]
          const result = JSON.parse(jsonLine)

          console.log(`✅ Morning brief generated: ${result.brief.watchlist.length} stocks on watchlist`)

          resolve(
            NextResponse.json({
              success: true,
              timestamp: new Date().toISOString(),
              ...result
            })
          )
        } catch (parseError) {
          console.error("Failed to parse morning brief:", parseError)
          console.error("stdout:", stdoutBuffer)
          resolve(
            NextResponse.json(
              { error: "Failed to parse morning brief", details: stdoutBuffer },
              { status: 500 }
            )
          )
        }
      })
    })
  } catch (error) {
    console.error("Error generating morning brief:", error)
    const message = error instanceof Error ? error.message : "Failed to generate morning brief"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET endpoint - runs morning brief on default watchlist
 */
export async function GET() {
  const DEFAULT_WATCHLIST = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
    'NVDA', 'META', 'NFLX', 'COIN', 'AMD',
    'SPY', 'QQQ', 'IWM', 'DIA'
  ]

  return POST(new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: DEFAULT_WATCHLIST })
  }))
}
