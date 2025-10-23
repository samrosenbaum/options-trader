import { NextRequest, NextResponse } from 'next/server'
import { resolvePythonExecutable } from '@/lib/server/python'

export const runtime = 'nodejs'
export const maxDuration = 60 // 1 minute timeout

interface WatchlistItem {
  id: string
  symbol: string
  optionType: string
  strike: number
  expiration: string
  premium: number
}

interface PriceResult {
  id: string
  currentPremium: number | null
  plAmount: number | null
  plPercent: number | null
  stockPrice: number | null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { items } = body as { items: WatchlistItem[] }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    console.log(`Fetching current prices for ${items.length} watchlist items...`)

    // Execute Python script to fetch prices
    const { spawn } = await import('child_process')
    const pythonPath = await resolvePythonExecutable()

    const results = await new Promise<PriceResult[]>((resolve, reject) => {
      const python = spawn(pythonPath, [
        '-m',
        'scripts.fetch_watchlist_prices',
      ], {
        env: { ...process.env, PYTHONPATH: process.cwd() },
        cwd: process.cwd(),
      })

      let stdoutBuffer = ''
      let stderrBuffer = ''

      // Send watchlist items as JSON to stdin
      python.stdin.write(JSON.stringify(items))
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
        // Log Python output for debugging
        if (stderrBuffer) {
          console.log('Python script output:', stderrBuffer)
        }

        if (code !== 0) {
          console.error('Python script error (exit code):', code)
          reject(new Error(`Python script exited with code ${code}`))
          return
        }

        try {
          const parsed = JSON.parse(stdoutBuffer)
          console.log(`Successfully fetched prices for ${parsed.length} items`)
          resolve(parsed)
        } catch (error) {
          console.error('Failed to parse Python output:', error)
          console.error('Raw stdout:', stdoutBuffer)
          reject(new Error('Failed to parse Python output'))
        }
      })
    })

    return NextResponse.json({
      success: true,
      results,
    })

  } catch (error) {
    console.error('Error fetching watchlist prices:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
