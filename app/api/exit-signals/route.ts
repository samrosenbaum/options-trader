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
    entryGreeks?: Record<string, number | undefined>
    currentGreeks?: Record<string, number | undefined>
    entryIv?: number
    currentIv?: number
    probabilityOfProfit?: number
  }>
}

interface ExitSignal {
  signal: "SELL_ALL" | "SELL_PARTIAL" | "HOLD" | "CUT_LOSS"
  confidence: number
  reasoning: string[]
  friendlyMessage?: string
  trailingStopPrice: number | null
  suggestedAction: string
  momentumStrength: string
  volumeRatio: number | null
  ivChangePct?: number | null
  riskScore?: number | null
  recoveryScore?: number | null
  probabilityOfProfit?: number | null
  unusualActivityBias?: string | null
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
from datetime import datetime
from math import erf, sqrt

sys.path.insert(0, '.')
from src.signals.exit_engine import ExitSignalEngine
import yfinance as yf

try:
    from src.scanner.unusual_activity import detect_unusual_options_activity
except Exception:
    detect_unusual_options_activity = None

# Parse input
data = json.loads('''${JSON.stringify({ positions })}''')
positions = data['positions']

engine = ExitSignalEngine()
signals = {}

symbols = sorted({pos['symbol'] for pos in positions if 'symbol' in pos})
uoa_map = {}
if detect_unusual_options_activity and symbols:
    try:
        uoa_map = detect_unusual_options_activity(symbols, min_vol_oi_ratio=2.0, min_volume=200)
    except Exception as exc:
        print(f"UOA lookup failed: {exc}", file=sys.stderr)
        uoa_map = {}

ticker_cache = {}
option_chain_cache = {}

for pos in positions:
    try:
        symbol = pos['symbol']
        ticker = ticker_cache.get(symbol)
        if ticker is None:
            ticker = yf.Ticker(symbol)
            ticker_cache[symbol] = ticker

        hist = ticker.history(period='1d')
        if len(hist) == 0:
            print(f"No data for {symbol}", file=sys.stderr)
            continue

        current_stock_price = float(hist['Close'].iloc[-1])

        entry_hist = ticker.history(start=pos['entryDate'], end=pos['entryDate'])
        if len(entry_hist) > 0:
            entry_stock_price = float(entry_hist['Close'].iloc[0])
        else:
            entry_stock_price = float(current_stock_price)

        current_option_price = pos.get('currentPrice')
        if not current_option_price:
            intrinsic = max(0.0, current_stock_price - pos['strike']) if pos['optionType'].lower() == 'call' else max(0.0, pos['strike'] - current_stock_price)
            time_value_estimate = pos['entryPrice'] * 0.3
            current_option_price = intrinsic + time_value_estimate

        entry_greeks = {k: float(v) for k, v in (pos.get('entryGreeks') or {}).items() if v is not None}
        current_greeks = {k: float(v) for k, v in (pos.get('currentGreeks') or {}).items() if v is not None}
        entry_iv = pos.get('entryIv')
        current_iv = pos.get('currentIv')

        chain_key = (symbol, pos['expiration'])
        chain = option_chain_cache.get(chain_key)
        if chain is None:
            try:
                chain = ticker.option_chain(pos['expiration'])
            except Exception:
                chain = None
            option_chain_cache[chain_key] = chain

        if chain is not None:
            side_df = chain.calls if pos['optionType'].lower() == 'call' else chain.puts
            match = side_df.loc[(side_df['strike'] - pos['strike']).abs() <= 0.01]
            if not match.empty and 'impliedVolatility' in match:
                current_iv = float(match['impliedVolatility'].iloc[0])

        exp_date = datetime.strptime(pos['expiration'], "%Y-%m-%d")
        dte = max((exp_date - datetime.utcnow()).days, 0)

        expected_move_pct = None
        if current_iv is not None and dte > 0:
            expected_move_pct = float(current_iv) * (dte / 365) ** 0.5 * 100

        probability_of_profit = pos.get('probabilityOfProfit')
        if probability_of_profit is None and current_iv and current_stock_price > 0 and dte > 0:
            sigma = float(current_iv) * (dte / 365) ** 0.5
            if sigma > 0:
                if pos['optionType'].lower() == 'call':
                    z = (pos['strike'] - current_stock_price) / (current_stock_price * sigma)
                    cdf = 0.5 * (1 + erf(z / sqrt(2)))
                    probability_of_profit = float(max(0.0, min(1.0, 1 - cdf)))
                else:
                    z = (current_stock_price - pos['strike']) / (current_stock_price * sigma)
                    probability_of_profit = float(max(0.0, min(1.0, 0.5 * (1 + erf(z / sqrt(2))))))

        sentiment_score = None
        bias = pos.get('currentDirectionalBias')
        confidence = pos.get('currentDirectionalConfidence')
        if bias and confidence is not None:
            normalized_conf = float(confidence) / 100.0
            if bias.upper() == 'BULLISH':
                sentiment_score = normalized_conf
            elif bias.upper() == 'BEARISH':
                sentiment_score = -normalized_conf
            else:
                sentiment_score = 0.0

        unusual_raw = uoa_map.get(symbol) or {}
        if unusual_raw:
            call_volume = sum(sig.get('volume', 0) for sig in unusual_raw.get('call_signals', []))
            put_volume = sum(sig.get('volume', 0) for sig in unusual_raw.get('put_signals', []))
            combined = unusual_raw.get('call_signals', []) + unusual_raw.get('put_signals', [])
            top_ratio = max((sig.get('vol_oi_ratio', 0) for sig in combined), default=None)
            dominant_vol = max((sig.get('volume', 0) for sig in combined), default=0)
            unusual_context = {
                'bias': unusual_raw.get('bias'),
                'total_volume': unusual_raw.get('total_unusual_volume'),
                'call_volume': call_volume,
                'put_volume': put_volume,
                'vol_oi_ratio': top_ratio,
                'dominant_volume': dominant_vol,
            }
        else:
            unusual_context = None

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
            entry_directional_bias=pos.get('entryDirectionalBias'),
            current_directional_bias=pos.get('currentDirectionalBias'),
            current_directional_confidence=pos.get('currentDirectionalConfidence'),
            fundamental_health_score=pos.get('fundamentalHealthScore'),
            earnings_in_days=pos.get('earningsInDays'),
            entry_greeks=entry_greeks or None,
            current_greeks=current_greeks or None,
            entry_iv=entry_iv,
            current_iv=current_iv,
            probability_of_profit=probability_of_profit,
            expected_move_pct=expected_move_pct,
            sentiment_score=sentiment_score,
            unusual_activity=unusual_context,
        )

        profit_pct = ((current_option_price - pos['entryPrice']) / pos['entryPrice']) * 100

        # Populate additional fields for friendly message
        signal.profit_pct = profit_pct
        signal.target_profit_pct = pos.get('targetProfitPct', 50)
        signal.option_price = current_option_price
        signal.theta = current_greeks.get('theta') if current_greeks else None
        signal.unusual_activity_data = unusual_context
        signal.expected_move_pct = expected_move_pct

        # Generate friendly message
        friendly_message = signal.get_friendly_message()

        signal_dict = {
            'signal': signal.signal,
            'confidence': signal.confidence,
            'reasoning': signal.reasoning,
            'friendlyMessage': friendly_message,
            'trailingStopPrice': signal.trailing_stop_price,
            'suggestedAction': signal.suggested_action,
            'momentumStrength': signal.momentum_strength,
            'volumeRatio': signal.volume_ratio,
            'ivChangePct': signal.iv_change_pct,
            'riskScore': signal.risk_score,
            'recoveryScore': signal.recovery_score,
            'probabilityOfProfit': signal.probability_of_profit,
            'unusualActivityBias': signal.unusual_activity_bias,
            'profitPct': profit_pct
        }

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
