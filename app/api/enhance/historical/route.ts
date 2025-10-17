import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"

/**
 * On-Demand Historical Analysis API
 *
 * Analyzes historical price moves for a SINGLE opportunity when user requests it.
 * Shows how often the stock has made similar moves in the past.
 */

export const runtime = "nodejs"
export const maxDuration = 30 // 30 seconds for historical analysis

interface HistoricalRequest {
  symbol: string
  optionType: "call" | "put"
  strike: number
  stockPrice: number
  premium: number
  expiration: string
}

interface HistoricalResult {
  symbol: string
  available: boolean
  requiredMove: number  // Percentage move needed for breakeven
  daysToExpiration: number
  direction: "up" | "down"
  historicalFrequency: number  // How often this move happened historically
  recentExamples: Array<{
    date: string
    move: number
    achieved: boolean
  }>
  summary: string
  confidence: "high" | "medium" | "low"
}

const extractJsonPayload = (rawOutput: string) => {
  const trimmed = rawOutput.trim()

  if (!trimmed) {
    throw new Error("No output received from historical analysis script")
  }

  try {
    return JSON.parse(trimmed) as HistoricalResult
  } catch {
    // fall through and try to recover from noisy stdout
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]
    if ((line.startsWith("{") && line.endsWith("}")) || (line.startsWith("[") && line.endsWith("]"))) {
      try {
        return JSON.parse(line) as HistoricalResult
      } catch {
        // continue trying earlier lines
      }
    }
  }

  throw new Error("Failed to parse JSON payload from historical analysis script output")
}

export async function POST(request: Request) {
  try {
    const body: HistoricalRequest = await request.json()

    // Validate required fields
    if (!body.symbol || !body.optionType || !body.strike || !body.stockPrice || !body.premium || !body.expiration) {
      return NextResponse.json(
        { error: "Missing required fields: symbol, optionType, strike, stockPrice, premium, expiration" },
        { status: 400 }
      )
    }

    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    // Run historical analysis
    const result = await new Promise<HistoricalResult>((resolve, reject) => {
      const python = spawn(
        pythonPath,
        [
          "-c",
          `
import json
import sys
from datetime import datetime
sys.path.insert(0, '.')
from src.scanner.historical_moves import HistoricalMoveAnalyzer

# Parse input
data = json.loads('''${JSON.stringify(body)}''')

# Calculate required move
breakeven_move_pct = (data['premium'] / data['stockPrice']) * 100

# Calculate days to expiration
exp_date = datetime.strptime(data['expiration'], '%Y-%m-%d')
days_to_exp = (exp_date - datetime.now()).days

# Determine direction
direction = "up" if data['optionType'].lower() == "call" else "down"

# Analyze historical moves
analyzer = HistoricalMoveAnalyzer(db_path="data/historical_moves.db", lookback_days=365)
context = analyzer.get_move_context(
    symbol=data['symbol'],
    target_move_pct=breakeven_move_pct,
    timeframe_days=days_to_exp,
    direction=direction,
    current_price=data['stockPrice']
)

if context and context.get('available'):
    frequency = context.get('frequency', 0)
    examples = context.get('recent_examples', [])[:5]

    output = {
        'symbol': data['symbol'],
        'available': True,
        'requiredMove': breakeven_move_pct,
        'daysToExpiration': days_to_exp,
        'direction': direction,
        'historicalFrequency': frequency * 100,
        'recentExamples': examples,
        'summary': context.get('summary', f'{frequency*100:.1f}% chance of {breakeven_move_pct:.1f}% {direction} move in {days_to_exp} days'),
        'confidence': 'high' if context.get('sample_size', 0) >= 50 else 'medium' if context.get('sample_size', 0) >= 20 else 'low'
    }
else:
    output = {
        'symbol': data['symbol'],
        'available': False,
        'requiredMove': breakeven_move_pct,
        'daysToExpiration': days_to_exp,
        'direction': direction,
        'historicalFrequency': 0,
        'recentExamples': [],
        'summary': context.get('message', 'Insufficient historical data available'),
        'confidence': 'low'
    }

print(json.dumps(output))
`,
        ],
        {
          env: { ...process.env, PYTHONPATH: process.cwd() },
        }
      )

      let stdout = ""
      let stderr = ""

      python.stdout.on("data", (data) => {
        stdout += data.toString()
      })

      python.stderr.on("data", (data) => {
        stderr += data.toString()
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Historical analysis error:", stderr)
          reject(new Error(`Historical analysis failed: ${stderr}`))
          return
        }

        try {
          const parsed = extractJsonPayload(stdout)
          resolve(parsed)
        } catch (parseError) {
          console.error("Failed to parse historical analysis output:", stdout, parseError)
          reject(new Error(
            parseError instanceof Error ? parseError.message : "Failed to parse historical analysis output",
          ))
        }
      })
    })

    return NextResponse.json({
      success: true,
      historical: result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("Error running historical analysis:", err)
    return NextResponse.json(
      {
        error: "Failed to run historical analysis",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
