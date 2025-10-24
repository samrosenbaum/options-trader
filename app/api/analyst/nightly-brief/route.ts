import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"

export const runtime = "nodejs"
export const maxDuration = 180 // 3 minutes

/**
 * Generate Nightly Brief (8:00 PM)
 * Tomorrow's battle plan: watchlist, key setups, portfolio check
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

    console.log(`🌙 Generating nightly brief for ${symbols.length} symbols...`)

    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    const pythonScript = `
import json
import sys
sys.path.insert(0, '.')

from src.analyst.nightly_brief import generate_nightly_brief, format_nightly_brief

symbols = ${JSON.stringify(symbols)}
user_portfolio = ${user_portfolio ? JSON.stringify(user_portfolio) : 'None'}

try:
    brief = generate_nightly_brief(symbols, user_portfolio)

    # Convert datetime to ISO string
    brief_serializable = {
        'timestamp': brief['timestamp'].isoformat(),
        'tomorrows_watchlist': brief['tomorrows_watchlist'],
        'earnings_tomorrow': brief['earnings_tomorrow'],
        'market_levels': brief['market_levels'],
        'portfolio_summary': brief['portfolio_summary'],
        'key_setups': brief['key_setups']
    }

    # Generate formatted text
    formatted_text = format_nightly_brief(brief)

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
            { error: "Failed to generate nightly brief", details: error.message },
            { status: 500 }
          )
        )
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Python script error:", stderrBuffer)
          resolve(
            NextResponse.json(
              { error: "Nightly brief generation failed", details: stderrBuffer },
              { status: 500 }
            )
          )
          return
        }

        try {
          const lines = stdoutBuffer.trim().split('\n')
          const jsonLine = lines[lines.length - 1]
          const result = JSON.parse(jsonLine)

          console.log(`✅ Nightly brief generated: ${result.brief.tomorrows_watchlist.length} stocks on tomorrow's watchlist`)

          resolve(
            NextResponse.json({
              success: true,
              timestamp: new Date().toISOString(),
              ...result
            })
          )
        } catch (parseError) {
          console.error("Failed to parse nightly brief:", parseError)
          console.error("stdout:", stdoutBuffer)
          resolve(
            NextResponse.json(
              { error: "Failed to parse nightly brief", details: stdoutBuffer },
              { status: 500 }
            )
          )
        }
      })
    })
  } catch (error) {
    console.error("Error generating nightly brief:", error)
    const message = error instanceof Error ? error.message : "Failed to generate nightly brief"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET endpoint - runs nightly brief on default watchlist
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
