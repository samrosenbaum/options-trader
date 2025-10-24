import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"

export const runtime = "nodejs"
export const maxDuration = 120 // 2 minutes

/**
 * Generate Market Open Update (9:35 AM)
 * Momentum confirmation + entry strategies for watchlist stocks
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { watchlist, morning_brief_data } = body

    if (!watchlist || !Array.isArray(watchlist) || watchlist.length === 0) {
      return NextResponse.json(
        {
          error: "watchlist array required",
          example: { watchlist: ["AAPL", "TSLA", "NVDA"] }
        },
        { status: 400 }
      )
    }

    console.log(`🔔 Generating market open update for ${watchlist.length} stocks...`)

    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    const pythonScript = `
import json
import sys
sys.path.insert(0, '.')

from src.analyst.market_open_update import generate_market_open_update, format_market_open_update

watchlist = ${JSON.stringify(watchlist)}
morning_brief_data = ${morning_brief_data ? JSON.stringify(morning_brief_data) : 'None'}

try:
    update = generate_market_open_update(watchlist, morning_brief_data)

    # Check if market is open
    if 'error' in update:
        print(json.dumps({'error': update['error']}), file=sys.stderr)
        sys.exit(1)

    # Convert datetime to ISO string
    update_serializable = {
        'timestamp': update['timestamp'].isoformat(),
        'movers': update['movers'],
        'entry_signals': update['entry_signals'],
        'avoid_list': update['avoid_list']
    }

    # Generate formatted text
    formatted_text = format_market_open_update(update)

    output = {
        'update': update_serializable,
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
            { error: "Failed to generate market open update", details: error.message },
            { status: 500 }
          )
        )
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Python script error:", stderrBuffer)

          // Check if market not open
          try {
            const errorData = JSON.parse(stderrBuffer)
            if (errorData.error) {
              resolve(
                NextResponse.json(
                  { error: errorData.error, market_closed: true },
                  { status: 400 }
                )
              )
              return
            }
          } catch {
            // Not JSON, continue with generic error
          }

          resolve(
            NextResponse.json(
              { error: "Market open update failed", details: stderrBuffer },
              { status: 500 }
            )
          )
          return
        }

        try {
          const lines = stdoutBuffer.trim().split('\n')
          const jsonLine = lines[lines.length - 1]
          const result = JSON.parse(jsonLine)

          console.log(`✅ Market open update: ${result.update.entry_signals.length} entry opportunities`)

          resolve(
            NextResponse.json({
              success: true,
              timestamp: new Date().toISOString(),
              ...result
            })
          )
        } catch (parseError) {
          console.error("Failed to parse market open update:", parseError)
          console.error("stdout:", stdoutBuffer)
          resolve(
            NextResponse.json(
              { error: "Failed to parse update", details: stdoutBuffer },
              { status: 500 }
            )
          )
        }
      })
    })
  } catch (error) {
    console.error("Error generating market open update:", error)
    const message = error instanceof Error ? error.message : "Failed to generate update"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET endpoint - test with sample watchlist
 */
export async function GET() {
  const SAMPLE_WATCHLIST = ['COIN', 'TSLA', 'NVDA', 'AMD', 'AAPL']

  return POST(new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watchlist: SAMPLE_WATCHLIST })
  }))
}
