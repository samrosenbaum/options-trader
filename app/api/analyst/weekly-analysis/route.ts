import { NextResponse } from "next/server"
import { resolvePythonExecutable } from "@/lib/server/python"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 240 // 4 minutes for comprehensive analysis

/**
 * Generate Weekly Analysis (Saturday Morning)
 * Learn from this week's trades: win rate, patterns, UOA effectiveness
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { lookback_days = 7, user_id } = body

    // If user_id provided, fetch their closed positions from database
    let closed_positions = body.closed_positions || []
    const uoa_history = body.uoa_history || []

    if (user_id && closed_positions.length === 0) {
      console.log(`📊 Fetching closed positions for user ${user_id}...`)

      const supabase = await createClient()
      const { data: positions, error } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user_id)
        .eq('status', 'closed')
        .gte('exit_date', new Date(Date.now() - lookback_days * 24 * 60 * 60 * 1000).toISOString())
        .order('exit_date', { ascending: false })

      if (error) {
        console.error('Error fetching positions:', error)
      } else if (positions) {
        closed_positions = positions
        console.log(`✅ Fetched ${positions.length} closed positions`)
      }

      // TODO: Fetch UOA history from database (need to implement UOA tracking table)
      // For now, use empty array
    }

    console.log(`📊 Generating weekly analysis (${closed_positions.length} trades, ${uoa_history.length} UOA signals)...`)

    const { spawn } = await import("child_process")
    const pythonPath = await resolvePythonExecutable()

    const pythonScript = `
import json
import sys
from datetime import datetime
sys.path.insert(0, '.')

from src.analyst.weekly_analysis import generate_weekly_analysis, format_weekly_analysis

closed_positions = ${JSON.stringify(closed_positions)}
uoa_history = ${JSON.stringify(uoa_history)}
lookback_days = ${lookback_days}

# Convert ISO strings back to datetime objects for UOA history
for signal in uoa_history:
    if 'detected_date' in signal:
        signal['detected_date'] = datetime.fromisoformat(signal['detected_date'].replace('Z', ''))

try:
    analysis = generate_weekly_analysis(
        closed_positions=closed_positions,
        uoa_history=uoa_history,
        lookback_days=lookback_days
    )

    # Convert datetime to ISO string
    analysis_serializable = {
        'timestamp': analysis['timestamp'].isoformat(),
        'week_ending': analysis['week_ending'],
        'portfolio_performance': analysis['portfolio_performance'],
        'uoa_performance': analysis['uoa_performance'],
        'learnings': analysis['learnings'],
        'next_week_plan': analysis['next_week_plan']
    }

    # Generate formatted text
    formatted_text = format_weekly_analysis(analysis)

    output = {
        'analysis': analysis_serializable,
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
            { error: "Failed to generate weekly analysis", details: error.message },
            { status: 500 }
          )
        )
      })

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Python script error:", stderrBuffer)
          resolve(
            NextResponse.json(
              { error: "Weekly analysis failed", details: stderrBuffer },
              { status: 500 }
            )
          )
          return
        }

        try {
          const lines = stdoutBuffer.trim().split('\n')
          const jsonLine = lines[lines.length - 1]
          const result = JSON.parse(jsonLine)

          const total_trades = result.analysis.portfolio_performance.total_trades || 0
          const win_rate = result.analysis.portfolio_performance.win_rate || 0

          console.log(`✅ Weekly analysis: ${total_trades} trades, ${win_rate.toFixed(1)}% win rate`)

          resolve(
            NextResponse.json({
              success: true,
              timestamp: new Date().toISOString(),
              ...result
            })
          )
        } catch (parseError) {
          console.error("Failed to parse weekly analysis:", parseError)
          console.error("stdout:", stdoutBuffer)
          resolve(
            NextResponse.json(
              { error: "Failed to parse analysis", details: stdoutBuffer },
              { status: 500 }
            )
          )
        }
      })
    })
  } catch (error) {
    console.error("Error generating weekly analysis:", error)
    const message = error instanceof Error ? error.message : "Failed to generate weekly analysis"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET endpoint - generate analysis without user data (demo mode)
 */
export async function GET() {
  // Sample data for demo
  const SAMPLE_POSITIONS = [
    {
      symbol: 'AAPL',
      strike: 230,
      option_type: 'call',
      entry_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      exit_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      realized_pl: 450,
      realized_pl_percent: 28.5
    },
    {
      symbol: 'TSLA',
      strike: 350,
      option_type: 'put',
      entry_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      exit_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      realized_pl: -200,
      realized_pl_percent: -15.2
    }
  ]

  return POST(new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      closed_positions: SAMPLE_POSITIONS,
      uoa_history: []
    })
  }))
}
