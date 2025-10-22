import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"

export const runtime = "nodejs"
export const maxDuration = 15

interface ExitSignalRequest {
  positions: Array<{
    symbol: string
    optionType: string  // "call" or "put"
    strike: number
    expiration: string
    entryPrice: number
    entryDate: string
    currentPrice?: number
    playType?: string  // "PULLBACK", "BREAKOUT", "BOUNCE"
    stopLossPct?: number
    targetProfitPct?: number
    // NEW: Directional signal data
    entryDirectionalBias?: string  // Direction at entry
    currentDirectionalBias?: string  // Current direction
    currentDirectionalConfidence?: number  // Current confidence
    fundamentalHealthScore?: number  // 0.0-1.0
    earningsInDays?: number  // Days to earnings
  }>
}

interface ExitSignal {
  signal: "SELL_ALL" | "SELL_PARTIAL" | "HOLD" | "CUT_LOSS"
  confidence: number
  reasoning: string[]
  trailingStopPrice: number | null
  suggestedAction: string
  momentumStrength: string
  volumeRatio: number | null
  profitPct: number
}

export async function POST(request: Request) {
  try {
    const body: ExitSignalRequest = await request.json()
    const { positions } = body

    if (!positions || positions.length === 0) {
      return NextResponse.json({ signals: [] })
    }

    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    // Run exit signal engine for all positions
    const result = await new Promise<Record<string, ExitSignal>>((resolve, reject) => {
      const python = spawn(
        pythonPath,
        [
          "-c",
          `
import json
import sys
sys.path.insert(0, '.')
from src.signals.exit_engine import ExitSignalEngine
import yfinance as yf

# Parse input
data = json.loads('''${JSON.stringify({ positions })}''')
positions = data['positions']

engine = ExitSignalEngine()
signals = {}

for pos in positions:
    try:
        # Get current stock price and option price
        symbol = pos['symbol']
        stock = yf.Ticker(symbol)

        # Get current stock price
        hist = stock.history(period='1d')
        if len(hist) == 0:
            print(f"No data for {symbol}", file=sys.stderr)
            continue

        current_stock_price = hist['Close'].iloc[-1]

        # Get entry stock price from entry date
        entry_hist = stock.history(start=pos['entryDate'], end=pos['entryDate'])
        if len(entry_hist) > 0:
            entry_stock_price = entry_hist['Close'].iloc[0]
        else:
            # Fallback: estimate from current price and option price
            entry_stock_price = current_stock_price

        # Get current option price if not provided
        current_option_price = pos.get('currentPrice')
        if not current_option_price:
            # Estimate based on intrinsic value + time value decay
            # This is a rough estimate - real price would come from broker
            intrinsic = max(0, current_stock_price - pos['strike']) if pos['optionType'].lower() == 'call' else max(0, pos['strike'] - current_stock_price)
            time_value_estimate = pos['entryPrice'] * 0.3  # Rough estimate
            current_option_price = intrinsic + time_value_estimate

        # Analyze position
        signal = engine.analyze_position(
            symbol=symbol,
            option_type=pos['optionType'],
            strike=pos['strike'],
            expiration=pos['expiration'],
            entry_price=pos['entryPrice'],
            entry_date=pos['entryDate'],
            entry_stock_price=entry_stock_price,
            play_type=pos.get('playType', 'BREAKOUT'),
            current_option_price=current_option_price,
            current_stock_price=current_stock_price,
            stop_loss_pct=pos.get('stopLossPct', -50),
            target_profit_pct=pos.get('targetProfitPct', 50),
            # NEW: Pass directional signal data
            entry_directional_bias=pos.get('entryDirectionalBias'),
            current_directional_bias=pos.get('currentDirectionalBias'),
            current_directional_confidence=pos.get('currentDirectionalConfidence'),
            fundamental_health_score=pos.get('fundamentalHealthScore'),
            earnings_in_days=pos.get('earningsInDays')
        )

        # Calculate profit
        profit_pct = ((current_option_price - pos['entryPrice']) / pos['entryPrice']) * 100

        # Build signal dict
        signal_dict = {
            'signal': signal.signal,
            'confidence': signal.confidence,
            'reasoning': signal.reasoning,
            'trailingStopPrice': signal.trailing_stop_price,
            'suggestedAction': signal.suggested_action,
            'momentumStrength': signal.momentum_strength,
            'volumeRatio': signal.volume_ratio,
            'profitPct': profit_pct
        }

        # Key by position identifier
        pos_key = f"{symbol}_{pos['strike']}_{pos['expiration']}_{pos['optionType']}"
        signals[pos_key] = signal_dict

    except Exception as e:
        print(f"Error analyzing position {pos.get('symbol')}: {e}", file=sys.stderr)
        continue

print(json.dumps(signals, default=str))
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
          console.error("Exit signal engine error:", stderr)
          reject(new Error(`Exit signal engine failed: ${stderr}`))
          return
        }

        // Always log stderr for debugging (warnings, etc)
        if (stderr) {
          console.log("Exit signal engine stderr:", stderr)
        }

        try {
          // Parse last JSON object from stdout
          const lines = stdout.trim().split('\n')
          const jsonLine = lines[lines.length - 1]
          console.log("Exit signal engine output (last line):", jsonLine)
          const parsed = JSON.parse(jsonLine)
          console.log("Exit signal engine parsed result:", parsed)
          resolve(parsed)
        } catch (parseError) {
          console.error("Failed to parse exit signal output:", stdout, parseError)
          reject(new Error("Failed to parse exit signal output"))
        }
      })
    })

    return NextResponse.json({
      success: true,
      signals: result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("Error running exit signal engine:", err)
    return NextResponse.json(
      {
        error: "Failed to generate exit signals",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
