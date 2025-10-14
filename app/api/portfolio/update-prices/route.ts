import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolvePythonExecutable } from '@/lib/server/python'
import type { Database } from '@/lib/types/database.types'

type Position = Database['public']['Tables']['positions']['Row']

export const runtime = 'nodejs'
export const maxDuration = 60 // 1 minute timeout

export async function POST() {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user's open positions
    const { data: positions, error: fetchError } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open')

    if (fetchError) {
      console.error('Error fetching positions:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch positions' },
        { status: 500 }
      )
    }

    if (!positions || positions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No open positions to update',
        updated: 0,
      })
    }

    console.log(`Updating prices for ${positions.length} positions...`)

    // Execute Python script to update prices
    const { spawn } = await import('child_process')
    const pythonPath = await resolvePythonExecutable()

    const updatedPositions = await new Promise<Position[]>((resolve, reject) => {
      const python = spawn(pythonPath, [
        'scripts/update_position_prices.py',
      ], {
        env: { ...process.env, PYTHONPATH: process.cwd() },
      })

      let stdoutBuffer = ''
      let stderrBuffer = ''

      // Send positions as JSON to stdin
      python.stdin.write(JSON.stringify(positions))
      python.stdin.end()

      python.stdout.on('data', (data) => {
        stdoutBuffer += data.toString()
      })

      python.stderr.on('data', (data) => {
        stderrBuffer += data.toString()
      })

      python.on('error', (error) => {
        console.error('Failed to start Python process:', error)
        reject(error)
      })

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python script error:', stderrBuffer)
          reject(new Error(`Python script exited with code ${code}`))
          return
        }

        try {
          const updated = JSON.parse(stdoutBuffer)
          resolve(updated)
        } catch (error) {
          console.error('Failed to parse Python output:', error)
          console.error('Raw output:', stdoutBuffer)
          reject(error)
        }
      })
    })

    // Update positions in database
    let updateCount = 0
    const errors: string[] = []

    for (const position of updatedPositions) {
      // Only update if we got new data
      if (position.current_price && position.unrealized_pl !== undefined) {
        const { error: updateError } = await supabase
          .from('positions')
          .update({
            current_price: position.current_price,
            current_stock_price: position.current_stock_price,
            current_delta: position.current_delta,
            current_theta: position.current_theta,
            unrealized_pl: position.unrealized_pl,
            unrealized_pl_percent: position.unrealized_pl_percent,
            exit_signal: position.exit_signal,
            exit_urgency_score: position.exit_urgency_score,
            exit_reasons: position.exit_reasons,
            last_signal_check: position.last_signal_check,
            updated_at: new Date().toISOString(),
          })
          .eq('id', position.id)

        if (updateError) {
          console.error(`Error updating position ${position.id}:`, updateError)
          errors.push(`${position.symbol}: ${updateError.message}`)
        } else {
          updateCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      updated: updateCount,
      total: positions.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Error updating prices:', error)
    return NextResponse.json(
      {
        error: 'Failed to update prices',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
