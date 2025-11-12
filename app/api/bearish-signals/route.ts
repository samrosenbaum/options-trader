import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolvePythonExecutable } from '@/lib/server/python'
import { spawn } from 'child_process'
import path from 'path'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface BearishSignalRow {
  id: string
  symbol: string
  total_score: number
  max_score: number
  recommendation: string
  current_price: number | null
  price_change_pct: number | null
  put_call_ratio: number
  put_call_zscore: number | null
  confidence: number
  alert_level: 'watch' | 'moderate' | 'high' | 'extreme'
  recommended_strikes: number[]
  expected_roi: string | null
  dark_pool_bearish: boolean
  gamma_exposure: number | null
  short_interest_pct: number | null
  signals: Array<{
    signal_type: string
    severity: string
    points: number
    description: string
    value?: number
    percentile?: number
  }>
  drivers: string[]
  generated_at: string
  expires_at: string
  signal_details: Record<string, unknown> | null
}

export interface BearishSignal {
  id: string
  symbol: string
  totalScore: number
  maxScore: number
  recommendation: string
  currentPrice: number | null
  priceChangePct: number | null
  putCallRatio: number
  putCallZscore: number | null
  confidence: number
  alertLevel: 'watch' | 'moderate' | 'high' | 'extreme'
  recommendedStrikes: number[]
  expectedRoi: string | null
  darkPoolBearish: boolean
  gammaExposure: number | null
  shortInterestPct: number | null
  signals: Array<{
    signalType: string
    severity: string
    points: number
    description: string
    value?: number
    percentile?: number
  }>
  drivers: string[]
  generatedAt: string
  expiresAt: string
}

function convertToCamelCase(row: BearishSignalRow): BearishSignal {
  return {
    id: row.id,
    symbol: row.symbol,
    totalScore: row.total_score,
    maxScore: row.max_score,
    recommendation: row.recommendation,
    currentPrice: row.current_price,
    priceChangePct: row.price_change_pct,
    putCallRatio: row.put_call_ratio,
    putCallZscore: row.put_call_zscore,
    confidence: row.confidence,
    alertLevel: row.alert_level,
    recommendedStrikes: row.recommended_strikes ?? [],
    expectedRoi: row.expected_roi,
    darkPoolBearish: row.dark_pool_bearish,
    gammaExposure: row.gamma_exposure,
    shortInterestPct: row.short_interest_pct,
    signals: (row.signals ?? []).map(s => ({
      signalType: s.signal_type,
      severity: s.severity,
      points: s.points,
      description: s.description,
      value: s.value,
      percentile: s.percentile,
    })),
    drivers: row.drivers ?? [],
    generatedAt: row.generated_at,
    expiresAt: row.expires_at,
  }
}

interface ApiResponse {
  success: boolean
  data?: BearishSignal[]
  count?: number
  totalScanned?: number
  generatedAt?: string
  nextScanAt?: string
  error?: string
  note?: string
}

async function runSyntheticBearishScan({
  minScore,
  limit,
  symbols,
}: {
  minScore: number
  limit: number
  symbols?: string[]
}): Promise<ApiResponse> {
  const pythonPath = await resolvePythonExecutable()
  const scriptPath = path.join(process.cwd(), 'scripts', 'manual_bearish_scan.py')

  const args = [scriptPath, '--min-score', String(minScore), '--limit', String(limit)]
  if (symbols && symbols.length > 0) {
    args.push('--symbols', ...symbols)
  }

  return await new Promise<ApiResponse>((resolve, reject) => {
    const child = spawn(pythonPath, args, {
      env: { ...process.env, PYTHONPATH: process.cwd() },
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', data => {
      stdout += data.toString()
    })

    child.stderr.on('data', data => {
      stderr += data.toString()
    })

    child.on('error', error => {
      reject(error)
    })

    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr || `Synthetic bearish scan failed with exit code ${code}`))
        return
      }

      try {
        const lines = stdout.trim().split('\n')
        const jsonLine = lines[lines.length - 1]
        const payload = JSON.parse(jsonLine) as ApiResponse
        resolve(payload)
      } catch (error) {
        reject(new Error(`Failed to parse synthetic bearish scan output: ${error instanceof Error ? error.message : String(error)}`))
      }
    })
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const minScore = parseInt(searchParams.get('minScore') ?? '8', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100)
    const symbols = searchParams.get('symbols')?.split(',').map(s => s.trim().toUpperCase())
    const alertLevel = searchParams.get('alertLevel') as 'watch' | 'moderate' | 'high' | 'extreme' | null
    const includeExpired = searchParams.get('includeExpired') === 'true'
    const forceRescan = searchParams.get('forceRescan') === 'true'

    let supabasePayload: ApiResponse | null = null
    if (!forceRescan) {
      // Create Supabase client
      const supabase = await createClient()

      // Build query
      let query = supabase
        .from('bearish_signals')
        .select('*')
        .gte('total_score', minScore)
        .order('total_score', { ascending: false })
        .order('generated_at', { ascending: false })
        .limit(limit)

      // Filter by expiration
      if (!includeExpired) {
        query = query.gt('expires_at', new Date().toISOString())
      }

      // Filter by symbols
      if (symbols && symbols.length > 0) {
        query = query.in('symbol', symbols)
      }

      // Filter by alert level
      if (alertLevel) {
        query = query.eq('alert_level', alertLevel)
      }

      // Execute query
      const { data, error } = await query

      if (error) {
        console.error('Supabase error:', error)
      } else {
        // Convert to camelCase
        const signals = (data as BearishSignalRow[]).map(convertToCamelCase)

        // Get total count of all symbols scanned (not filtered by minScore)
        const { count: totalScanned } = await supabase
          .from('bearish_signals')
          .select('symbol', { count: 'exact', head: true })
          .gt('expires_at', new Date().toISOString())

        // Calculate next scan time (15 minutes from most recent)
        const mostRecent = signals[0]?.generatedAt
        const nextScanAt = mostRecent
          ? new Date(new Date(mostRecent).getTime() + 15 * 60 * 1000).toISOString()
          : new Date(Date.now() + 15 * 60 * 1000).toISOString()

        supabasePayload = {
          success: true,
          data: signals,
          count: signals.length,
          totalScanned: totalScanned ?? 0,
          generatedAt: mostRecent || new Date().toISOString(),
          nextScanAt,
        }
      }
    }

    const shouldRunSynthetic =
      forceRescan || !supabasePayload || (supabasePayload.data?.length ?? 0) === 0

    if (shouldRunSynthetic) {
      try {
        const synthetic = await runSyntheticBearishScan({
          minScore,
          limit,
          symbols,
        })
        return NextResponse.json(synthetic)
      } catch (error) {
        console.error('Synthetic bearish scan failed:', error)
        if (supabasePayload) {
          return NextResponse.json(supabasePayload)
        }
        return NextResponse.json(
          {
            success: false,
            error: 'Unable to generate bearish signals',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(supabasePayload)
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// POST endpoint to trigger a rescan (if you want manual refresh)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // TODO: Trigger Python scanner script
    // For now, just return success
    // In production, you'd:
    // 1. Call Python script via subprocess or API
    // 2. Wait for results
    // 3. Return updated signals

    return NextResponse.json({
      success: true,
      message: 'Scan triggered successfully',
      note: 'Scanner integration pending',
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
