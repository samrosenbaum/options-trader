import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"

/**
 * On-Demand Backtesting API
 *
 * Runs a 365-day backtest on a SINGLE opportunity when user requests it.
 * This keeps the initial scan fast while allowing deep analysis on demand.
 */

export const runtime = "nodejs"
export const maxDuration = 60 // 1 minute should be plenty for a single opportunity

interface BacktestRequest {
  symbol: string
  optionType: "call" | "put"
  strike: number
  stockPrice: number
  premium: number  // Premium per contract (not per share)
  daysToExpiration: number
  impliedVolatility: number
}

interface BacktestResult {
  symbol: string
  winRate: number
  avgReturn: number
  maxDrawdown: number
  sharpeRatio: number
  similarTradesFound: number
  historicalReturns: Array<{
    date: string
    return: number
    profitable: boolean
  }>
  summary: string
  confidence: "high" | "medium" | "low"
}

export async function POST(request: Request) {
  try {
    const body: BacktestRequest = await request.json()

    // Validate required fields
    if (!body.symbol || !body.optionType || !body.strike || !body.stockPrice || !body.premium) {
      return NextResponse.json(
        { error: "Missing required fields: symbol, optionType, strike, stockPrice, premium" },
        { status: 400 }
      )
    }

    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    // Run backtest script
    const result = await new Promise<BacktestResult>((resolve, reject) => {
      const python = spawn(
        pythonPath,
        [
          "-c",
          `
import json
import sys
sys.path.insert(0, '.')
from src.backtesting.strategy_validator import StrategyValidator

# Parse input
data = json.loads('''${JSON.stringify(body)}''')

# Run backtest with 365 days
validator = StrategyValidator(lookback_days=365)
result = validator.validate_strategy(
    symbol=data['symbol'],
    option_type=data['optionType'],
    strike=data['strike'],
    stock_price=data['stockPrice'],
    premium=data['premium'] / 100,  # Convert to per-share
    days_to_expiration=data.get('daysToExpiration', 30),
    implied_volatility=data.get('impliedVolatility', 0.5)
)

if result and result.similar_trades_found >= 5:
    output = {
        'symbol': data['symbol'],
        'winRate': result.win_rate * 100,
        'avgReturn': result.avg_return * 100,
        'maxDrawdown': result.max_drawdown * 100,
        'sharpeRatio': result.sharpe_ratio,
        'similarTradesFound': result.similar_trades_found,
        'historicalReturns': result.historical_returns[:20] if hasattr(result, 'historical_returns') else [],
        'summary': f"{result.win_rate*100:.1f}% win rate over {result.similar_trades_found} similar trades in past 365 days",
        'confidence': 'high' if result.similar_trades_found >= 50 else 'medium' if result.similar_trades_found >= 20 else 'low'
    }
    print(json.dumps(output))
else:
    output = {
        'symbol': data['symbol'],
        'winRate': 0,
        'avgReturn': 0,
        'maxDrawdown': 0,
        'sharpeRatio': 0,
        'similarTradesFound': result.similar_trades_found if result else 0,
        'historicalReturns': [],
        'summary': f'Insufficient data: only {result.similar_trades_found if result else 0} similar trades found',
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
          console.error("Backtest error:", stderr)
          reject(new Error(`Backtest failed: ${stderr}`))
          return
        }

        try {
          const parsed = JSON.parse(stdout.trim())
          resolve(parsed)
        } catch (parseError) {
          console.error("Failed to parse backtest output:", stdout, parseError)
          reject(new Error("Failed to parse backtest output"))
        }
      })
    })

    return NextResponse.json({
      success: true,
      backtest: result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("Error running backtest:", err)
    return NextResponse.json(
      {
        error: "Failed to run backtest",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
