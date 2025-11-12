import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sampleFundamentalsSignals } from '@/data/sample-fundamentals-signals'
import type { FundamentalsSignal } from '@/types/fundamentals'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface FundamentalsSignalRow {
  id: string
  symbol: string
  overall_score: number
  quality_level: 'excellent' | 'good' | 'fair' | 'poor'
  recommendation: string
  buy_reason: string | null
  current_price: number | null
  price_change_pct: number | null
  week_52_high: number | null
  week_52_low: number | null
  percent_from_52w_high: number | null
  percent_from_52w_low: number | null
  health_score: number | null
  growth_score: number | null
  profitability_score: number | null
  leverage_score: number | null
  valuation_score: number | null
  pe_ratio: number | null
  forward_pe: number | null
  peg_ratio: number | null
  ps_ratio: number | null
  pb_ratio: number | null
  price_to_fcf: number | null
  revenue_growth: number | null
  earnings_growth: number | null
  revenue_per_share_growth: number | null
  profit_margin: number | null
  operating_margin: number | null
  roe: number | null
  roa: number | null
  roic: number | null
  debt_to_equity: number | null
  current_ratio: number | null
  quick_ratio: number | null
  free_cash_flow: number | null
  operating_cash_flow: number | null
  analyst_rating: string | null
  analyst_target_price: number | null
  target_upside_pct: number | null
  num_analysts: number | null
  recommendation_mean: number | null
  next_earnings_date: string | null
  days_to_earnings: number | null
  earnings_surprise_pct: number | null
  market_cap: number | null
  sector: string | null
  industry: string | null
  avg_volume: number | null
  current_volume: number | null
  volume_surge: boolean
  strengths: string[]
  weaknesses: string[]
  catalysts: string[] | null
  risk_level: 'low' | 'moderate' | 'high'
  risk_factors: string[] | null
  generated_at: string
  expires_at: string
  signal_details: Record<string, unknown> | null
}

function convertToCamelCase(row: FundamentalsSignalRow): FundamentalsSignal {
  return {
    id: row.id,
    symbol: row.symbol,
    overallScore: row.overall_score,
    qualityLevel: row.quality_level,
    recommendation: row.recommendation,
    buyReason: row.buy_reason,
    currentPrice: row.current_price,
    priceChangePct: row.price_change_pct,
    week52High: row.week_52_high,
    week52Low: row.week_52_low,
    percentFrom52wHigh: row.percent_from_52w_high,
    percentFrom52wLow: row.percent_from_52w_low,
    healthScore: row.health_score,
    growthScore: row.growth_score,
    profitabilityScore: row.profitability_score,
    leverageScore: row.leverage_score,
    valuationScore: row.valuation_score,
    peRatio: row.pe_ratio,
    forwardPe: row.forward_pe,
    pegRatio: row.peg_ratio,
    psRatio: row.ps_ratio,
    pbRatio: row.pb_ratio,
    priceToFcf: row.price_to_fcf,
    revenueGrowth: row.revenue_growth,
    earningsGrowth: row.earnings_growth,
    revenuePerShareGrowth: row.revenue_per_share_growth,
    profitMargin: row.profit_margin,
    operatingMargin: row.operating_margin,
    roe: row.roe,
    roa: row.roa,
    roic: row.roic,
    debtToEquity: row.debt_to_equity,
    currentRatio: row.current_ratio,
    quickRatio: row.quick_ratio,
    freeCashFlow: row.free_cash_flow,
    operatingCashFlow: row.operating_cash_flow,
    analystRating: row.analyst_rating,
    analystTargetPrice: row.analyst_target_price,
    targetUpsidePct: row.target_upside_pct,
    numAnalysts: row.num_analysts,
    recommendationMean: row.recommendation_mean,
    nextEarningsDate: row.next_earnings_date,
    daysToEarnings: row.days_to_earnings,
    earningsSurprisePct: row.earnings_surprise_pct,
    marketCap: row.market_cap,
    sector: row.sector,
    industry: row.industry,
    avgVolume: row.avg_volume,
    currentVolume: row.current_volume,
    volumeSurge: row.volume_surge,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    catalysts: row.catalysts || [],
    riskLevel: row.risk_level,
    riskFactors: row.risk_factors || [],
    generatedAt: row.generated_at,
    expiresAt: row.expires_at,
  }
}

function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

interface QueryOptions {
  minScore: number
  limit: number
  symbols: string[] | undefined
  qualityLevel: FundamentalsSignal['qualityLevel'] | null
  sector: string | null
  includeExpired: boolean
}

function buildResponseFromSignals(signals: FundamentalsSignal[], options: QueryOptions) {
  const nowIso = new Date().toISOString()
  const {
    minScore,
    limit,
    symbols,
    qualityLevel,
    sector,
    includeExpired,
  } = options

  const applyCommonFilters = (items: FundamentalsSignal[]) => {
    let result = items.filter(signal => signal.overallScore >= minScore)

    if (!includeExpired) {
      result = result.filter(signal => signal.expiresAt > nowIso)
    }

    if (symbols && symbols.length > 0) {
      const normalized = new Set(symbols.map(symbol => symbol.toUpperCase()))
      result = result.filter(signal => normalized.has(signal.symbol.toUpperCase()))
    }

    if (qualityLevel) {
      result = result.filter(signal => signal.qualityLevel === qualityLevel)
    }

    if (sector) {
      result = result.filter(signal => signal.sector?.toLowerCase() === sector.toLowerCase())
    }

    return result
  }

  const filtered = applyCommonFilters(signals)
    .sort((a, b) => {
      if (b.overallScore === a.overallScore) {
        return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
      }
      return b.overallScore - a.overallScore
    })
    .slice(0, limit)

  if (filtered.length === 0) {
    return {
      success: true,
      data: [],
      count: 0,
      totalScanned: 0,
      qualityBreakdown: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
      },
      generatedAt: new Date().toISOString(),
      nextScanAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      message: 'No fundamentals data available. Run the scanner to populate data.',
      hint: 'python src/scanner/fundamentals_runner.py --all',
    }
  }

  const activeSignals = includeExpired
    ? signals
    : signals.filter(signal => signal.expiresAt > nowIso)

  const qualityBreakdown = activeSignals.reduce(
    (acc, signal) => {
      acc[signal.qualityLevel] += 1
      return acc
    },
    {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
    } as Record<FundamentalsSignal['qualityLevel'], number>
  )

  const mostRecent = filtered[0]?.generatedAt
  const nextScanAt = mostRecent
    ? new Date(new Date(mostRecent).getTime() + 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  return {
    success: true,
    data: filtered,
    count: filtered.length,
    totalScanned: activeSignals.length,
    qualityBreakdown,
    generatedAt: mostRecent || new Date().toISOString(),
    nextScanAt,
  }
}

function buildSampleResponse(options: QueryOptions) {
  return NextResponse.json(buildResponseFromSignals(sampleFundamentalsSignals, options))
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const { searchParams } = url

  try {
    // Parse query parameters
    const minScore = parseInt(searchParams.get('minScore') ?? '50', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
    const symbols = searchParams.get('symbols')?.split(',').map(s => s.trim().toUpperCase())
    const qualityLevel = searchParams.get('qualityLevel') as 'excellent' | 'good' | 'fair' | 'poor' | null
    const sector = searchParams.get('sector')
    const includeExpired = searchParams.get('includeExpired') === 'true'

    const queryOptions: QueryOptions = {
      minScore,
      limit,
      symbols,
      qualityLevel,
      sector,
      includeExpired,
    }

    if (!isSupabaseConfigured()) {
      return buildSampleResponse(queryOptions)
    }

    // Create Supabase client
    const supabase = await createClient()

    // Build query
    let query = supabase
      .from('fundamentals_signals')
      .select('*')
      .gte('overall_score', minScore)
      .order('overall_score', { ascending: false })
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

    // Filter by quality level
    if (qualityLevel) {
      query = query.eq('quality_level', qualityLevel)
    }

    // Filter by sector
    if (sector) {
      query = query.eq('sector', sector)
    }

    // Execute query
    const { data, error } = await query

    if (error) {
      console.error('Supabase error:', error)

      // Check if error is due to missing table
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Database not initialized',
            details:
              'The fundamentals_signals table does not exist. Please run database migrations first.',
            hint: 'Run: npx supabase db push',
          },
          { status: 500 }
        )
      }

      const fallback = buildResponseFromSignals(sampleFundamentalsSignals, queryOptions)
      return NextResponse.json({
        ...fallback,
        usingSampleData: true,
        warning: 'Falling back to cached fundamentals signals due to Supabase error.',
        details: error.message,
      })
    }

    // Convert to camelCase and return Supabase data
    const signals = (data as FundamentalsSignalRow[]).map(convertToCamelCase)
    return NextResponse.json(buildResponseFromSignals(signals, queryOptions))
  } catch (err) {
    console.error('Unexpected error:', err)

    const fallback = buildResponseFromSignals(sampleFundamentalsSignals, {
      minScore: parseInt(searchParams.get('minScore') ?? '50', 10),
      limit: Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200),
      symbols: searchParams.get('symbols')?.split(',').map(s => s.trim().toUpperCase()),
      qualityLevel: searchParams.get('qualityLevel') as FundamentalsSignal['qualityLevel'] | null,
      sector: searchParams.get('sector'),
      includeExpired: searchParams.get('includeExpired') === 'true',
    })

    return NextResponse.json({
      ...fallback,
      usingSampleData: true,
      warning: 'Falling back to cached fundamentals signals due to an unexpected error.',
      details: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}

// POST endpoint to trigger a rescan
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        success: true,
        message: 'Fundamentals scan queued (demo mode). Configure Supabase to enable live rescans.',
      })
    }

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
      message: 'Fundamentals scan triggered successfully',
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
