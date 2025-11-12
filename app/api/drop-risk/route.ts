import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { DropRiskSignal, DropRiskAlertLevel } from '@/lib/types/drop-alert'
import rawFallbackSignals from '@/data/sample-drop-risk-signals.json' assert { type: 'json' }

export const revalidate = 0

const DEFAULT_LIMIT = 5

const toAlertLevel = (raw: unknown): DropRiskAlertLevel => {
  const value = typeof raw === 'string' ? raw.toLowerCase() : 'watch'
  if (value === 'extreme' || value === 'high' || value === 'elevated') {
    return value
  }
  return 'watch'
}

const toDrivers = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw
      .map(entry => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
      .filter(Boolean)
  }
  if (typeof raw === 'string' && raw.trim()) {
    return [raw.trim()]
  }
  return []
}

const toSignalDetails = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === 'object') {
    return raw as Record<string, unknown>
  }
  return {}
}

const FALLBACK_SIGNALS = rawFallbackSignals as DropRiskSignal[]

const buildFallbackSignals = (limit: number, minScore: number): DropRiskSignal[] => {
  const now = Date.now()

  return FALLBACK_SIGNALS
    .filter(signal => typeof signal.score === 'number' && signal.score >= minScore)
    .slice(0, limit)
    .map((signal, index) => ({
      ...signal,
      id: `${signal.symbol}-fallback-${now + index}`,
      generatedAt: new Date(now - index * 60_000).toISOString(),
      drivers: [...signal.drivers],
      signalDetails: { ...signal.signalDetails },
    }))
}

const buildFallbackResponse = (limit: number, minScore: number) => {
  const fallback = buildFallbackSignals(limit, minScore)
  return NextResponse.json({
    success: true,
    count: fallback.length,
    generatedAt: fallback[0]?.generatedAt ?? new Date().toISOString(),
    data: fallback,
    note: 'fallback-sample',
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const limitParam = parseInt(searchParams.get('limit') ?? `${DEFAULT_LIMIT}`, 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : DEFAULT_LIMIT

  const minScoreParam = parseFloat(searchParams.get('minScore') ?? '0')
  const minScore = Number.isFinite(minScoreParam) ? minScoreParam : 0

  const fetchSize = Math.max(limit * 5, 25)

  let supabase
  try {
    supabase = await createClient()
  } catch (error) {
    console.error('Failed to initialize Supabase client', error)
    return buildFallbackResponse(limit, minScore)
  }

  const { data, error } = await supabase
    .from('drop_risk_signals')
    .select(
      'id, symbol, drop_risk_score, bias_score, confidence, stock_price, price_change_pct, alert_level, drivers, signal_details, score_change, generated_at',
    )
    .order('generated_at', { ascending: false })
    .limit(fetchSize)

  if (error) {
    console.error('Failed to load drop risk signals', error)
    return buildFallbackResponse(limit, minScore)
  }

  const seen = new Set<string>()
  const transformed: DropRiskSignal[] = []

  for (const row of data ?? []) {
    const symbol = typeof row.symbol === 'string' ? row.symbol.toUpperCase() : null
    if (!symbol || seen.has(symbol)) {
      continue
    }

    const score = typeof row.drop_risk_score === 'number' ? row.drop_risk_score : Number(row.drop_risk_score ?? 0)
    if (Number.isFinite(minScore) && score < minScore) {
      continue
    }

    transformed.push({
      id: String(row.id ?? `${symbol}-${row.generated_at}`),
      symbol,
      score,
      biasScore: typeof row.bias_score === 'number' ? row.bias_score : Number(row.bias_score ?? 0),
      confidence: typeof row.confidence === 'number' ? row.confidence : Number(row.confidence ?? 0),
      stockPrice: typeof row.stock_price === 'number' ? row.stock_price : row.stock_price ? Number(row.stock_price) : null,
      priceChangePct:
        typeof row.price_change_pct === 'number'
          ? row.price_change_pct
          : row.price_change_pct
            ? Number(row.price_change_pct)
            : null,
      alertLevel: toAlertLevel(row.alert_level),
      scoreChange:
        typeof row.score_change === 'number' ? row.score_change : row.score_change ? Number(row.score_change) : null,
      generatedAt: typeof row.generated_at === 'string' ? row.generated_at : new Date().toISOString(),
      drivers: toDrivers(row.drivers),
      signalDetails: toSignalDetails(row.signal_details),
    })

    seen.add(symbol)
    if (transformed.length >= limit) {
      break
    }
  }

  if (transformed.length < limit) {
    const needed = limit - transformed.length
    if (needed > 0) {
      const fallback = buildFallbackSignals(limit, minScore)
      for (const signal of fallback) {
        const key = signal.symbol.toUpperCase()
        if (seen.has(key)) {
          continue
        }
        transformed.push(signal)
        seen.add(key)
        if (transformed.length >= limit) {
          break
        }
      }
    }
  }

  if (transformed.length === 0) {
    return buildFallbackResponse(limit, minScore)
  }

  return NextResponse.json({
    success: true,
    count: transformed.length,
    generatedAt: new Date().toISOString(),
    data: transformed,
    note: transformed.length < limit ? 'partial-fallback' : 'supabase',
  })
}
