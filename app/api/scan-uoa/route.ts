import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"

export const runtime = "nodejs"
export const maxDuration = 120 // 2 minutes

interface UOASignal {
  symbol: string
  current_price: number
  expiration: string
  call_signals: Array<{
    type: string
    strike: number
    volume: number
    oi: number
    vol_oi_ratio: number
    is_atm: boolean
    premium: number
  }>
  put_signals: Array<{
    type: string
    strike: number
    volume: number
    oi: number
    vol_oi_ratio: number
    is_atm: boolean
    premium: number
  }>
  bias: "bullish" | "bearish" | "neutral"
  total_unusual_volume: number
}

interface UOAResponse {
  signals: Record<string, UOASignal>
  timestamp: string
  symbols_scanned: number
  signals_found: number
}

/**
 * Scan for Unusual Options Activity (UOA)
 * Detects smart money positioning before big moves
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { symbols, min_vol_oi_ratio = 2.0, min_volume = 500 } = body

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        {
          error: "symbols array required",
          example: { symbols: ["AAPL", "TSLA", "NVDA"] }
        },
        { status: 400 }
      )
    }

    console.log(`🔍 Scanning ${symbols.length} symbols for unusual options activity...`)

    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    // Create Python script to run UOA detector
    const pythonScript = `
import json
import sys
sys.path.insert(0, '.')

from src.scanner.unusual_activity import detect_unusual_options_activity

symbols = ${JSON.stringify(symbols)}
min_vol_oi_ratio = ${min_vol_oi_ratio}
min_volume = ${min_volume}

try:
    result = detect_unusual_options_activity(
        symbols=symbols,
        min_vol_oi_ratio=min_vol_oi_ratio,
        min_volume=min_volume
    )

    # Convert to JSON-serializable format
    output = {
        'signals': result,
        'symbols_scanned': len(symbols),
        'signals_found': len(result)
    }

    print(json.dumps(output))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
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
            { error: "Failed to execute UOA scanner", details: error.message },
            { status: 500 }
          )
        )
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Python script error:", stderrBuffer)
          resolve(
            NextResponse.json(
              { error: "UOA scanner failed", details: stderrBuffer },
              { status: 500 }
            )
          )
          return
        }

        try {
          // Parse JSON from stdout (filter out print statements from scanner)
          const lines = stdoutBuffer.trim().split('\n')
          const jsonLine = lines[lines.length - 1] // Last line should be the JSON
          const result = JSON.parse(jsonLine)

          const response: UOAResponse = {
            signals: result.signals,
            timestamp: new Date().toISOString(),
            symbols_scanned: result.symbols_scanned,
            signals_found: result.signals_found
          }

          console.log(`✅ Found ${response.signals_found} UOA signals`)

          resolve(
            NextResponse.json({
              success: true,
              ...response
            })
          )
        } catch (parseError) {
          console.error("Failed to parse UOA results:", parseError)
          console.error("stdout:", stdoutBuffer)
          resolve(
            NextResponse.json(
              { error: "Failed to parse UOA results", details: stdoutBuffer },
              { status: 500 }
            )
          )
        }
      })
    })
  } catch (error) {
    console.error("Error in UOA scan:", error)
    const message = error instanceof Error ? error.message : "Failed to scan for UOA"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET endpoint - runs UOA scan on default watchlist
 */
export async function GET() {
  const DEFAULT_WATCHLIST = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
    'NVDA', 'META', 'NFLX', 'COIN', 'AMD',
    'SPY', 'QQQ', 'IWM'
  ]

  // Forward to POST
  return POST(new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: DEFAULT_WATCHLIST })
  }))
}
