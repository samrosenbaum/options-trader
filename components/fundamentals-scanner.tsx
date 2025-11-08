'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { TrendingUp, BarChart3, RefreshCcw, ChevronDown, ChevronUp, Star } from 'lucide-react'
import type { FundamentalSignal } from '@/app/api/fundamentals-scanner/route'

interface ApiResponse {
  success: boolean
  data?: FundamentalSignal[]
  count?: number
  totalScanned?: number
  qualityCounts?: {
    excellent: number
    good: number
    fair: number
    poor: number
  }
  generatedAt?: string
  nextScanAt?: string
  error?: string
}

const qualityStyles: Record<FundamentalSignal['qualityLevel'], { badge: string; border: string; glow: string; text: string; icon: string }> = {
  excellent: {
    badge: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40',
    border: 'border-emerald-400/40',
    glow: 'shadow-[0_18px_55px_rgba(52,211,153,0.28)]',
    text: 'text-emerald-100',
    icon: '⭐',
  },
  good: {
    badge: 'bg-blue-500/15 text-blue-200 border-blue-400/40',
    border: 'border-blue-400/40',
    glow: 'shadow-[0_15px_45px_rgba(59,130,246,0.25)]',
    text: 'text-blue-100',
    icon: '🔵',
  },
  fair: {
    badge: 'bg-amber-500/15 text-amber-200 border-amber-400/40',
    border: 'border-amber-400/30',
    glow: 'shadow-[0_10px_30px_rgba(217,119,6,0.15)]',
    text: 'text-amber-100',
    icon: '🟡',
  },
  poor: {
    badge: 'bg-slate-500/15 text-slate-200 border-slate-400/40',
    border: 'border-slate-400/30',
    glow: 'shadow-[0_10px_30px_rgba(148,163,184,0.15)]',
    text: 'text-slate-200',
    icon: '⚪',
  },
}

const scoreGradient = (score: number) => {
  if (score >= 80) return 'from-emerald-500/90 via-emerald-400/70 to-emerald-500/40'
  if (score >= 65) return 'from-blue-500/90 via-blue-400/70 to-blue-500/40'
  if (score >= 50) return 'from-amber-500/90 via-amber-400/70 to-amber-500/40'
  return 'from-slate-500/80 via-slate-400/60 to-slate-500/40'
}

const fetchFundamentalsSignals = async (minScore: number, limit: number): Promise<ApiResponse> => {
  const params = new URLSearchParams({
    minScore: String(minScore),
    limit: String(limit),
  })

  const response = await fetch(`/api/fundamentals-scanner?${params.toString()}`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  return response.json()
}

interface FundamentalsScannerProps {
  limit?: number
  minScore?: number
  filterSymbols?: string[]
  symbolTags?: Record<string, 'portfolio' | 'watchlist'>
}

export function FundamentalsScanner({
  limit = 50,
  minScore = 50,
  filterSymbols,
  symbolTags,
}: FundamentalsScannerProps) {
  const [signals, setSignals] = useState<FundamentalSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [nextScan, setNextScan] = useState<string | null>(null)
  const [totalScanned, setTotalScanned] = useState<number | null>(null)
  const [qualityCounts, setQualityCounts] = useState<ApiResponse['qualityCounts'] | null>(null)
  const [expandedSignals, setExpandedSignals] = useState<Set<string>>(new Set())

  const requestSignals = useCallback(async () => fetchFundamentalsSignals(minScore, limit), [minScore, limit])

  const applyPayload = useCallback(
    (payload: ApiResponse) => {
      if (payload.success && payload.data) {
        let filteredData = payload.data

        // Filter to only symbols in portfolio/watchlist if provided
        if (filterSymbols && filterSymbols.length > 0) {
          const symbolSet = new Set(filterSymbols.map(s => s.toUpperCase()))
          filteredData = payload.data.filter(signal => symbolSet.has(signal.symbol.toUpperCase()))
        }

        setSignals(filteredData)
        setLastUpdated(payload.generatedAt ?? new Date().toISOString())
        setNextScan(payload.nextScanAt ?? null)
        setTotalScanned(payload.totalScanned ?? null)
        setQualityCounts(payload.qualityCounts ?? null)
        setError(null)
      } else {
        setError(payload.error ?? 'Unable to load fundamental signals')
      }
    },
    [filterSymbols]
  )

  const refreshSignals = useCallback(async () => {
    setLoading(true)
    try {
      const payload = await requestSignals()
      applyPayload(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load fundamental signals')
    } finally {
      setLoading(false)
    }
  }, [applyPayload, requestSignals])

  useEffect(() => {
    let active = true

    const run = async () => {
      setLoading(true)
      try {
        const payload = await requestSignals()
        if (!active) return
        applyPayload(payload)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Unable to load fundamental signals')
      } finally {
        if (active) setLoading(false)
      }
    }

    run().catch(() => {})

    return () => {
      active = false
    }
  }, [applyPayload, requestSignals])

  const toggleExpand = (id: string) => {
    setExpandedSignals(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Group signals by quality level
  const groupedSignals = useMemo(() => {
    const excellent = signals.filter(s => s.qualityLevel === 'excellent')
    const good = signals.filter(s => s.qualityLevel === 'good')
    const fair = signals.filter(s => s.qualityLevel === 'fair')
    const poor = signals.filter(s => s.qualityLevel === 'poor')

    return { excellent, good, fair, poor }
  }, [signals])

  const headerSubtitle = useMemo(() => {
    if (loading) return 'Analyzing fundamental metrics across stocks...'
    if (error) return 'Unable to refresh fundamental signals. Try again shortly.'
    if (!signals.length) {
      if (totalScanned !== null && totalScanned > 0) {
        return `Scanned ${totalScanned} stock${totalScanned === 1 ? '' : 's'} — no high-quality opportunities found.`
      }
      return 'No high-quality stock opportunities detected right now.'
    }
    return `${signals.length} buy opportunity${signals.length === 1 ? '' : 'ies'} identified across ${totalScanned ?? '100+'} stocks.`
  }, [loading, error, signals.length, totalScanned])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/70 to-white p-6 shadow-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/70 dark:to-slate-950">
      <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.3em] text-emerald-600/70 dark:text-emerald-400/70">
            <BarChart3 size={16} /> Stock Fundamentals Scanner
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Buy Opportunities</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{headerSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => refreshSignals().catch(() => {})}
          className="group inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 text-sm font-medium text-slate-700 transition-all hover:border-emerald-400/60 hover:bg-emerald-50 dark:border-white/10 dark:bg-white/10 dark:text-white/80 dark:hover:border-emerald-400/60 dark:hover:bg-emerald-500/10 dark:hover:text-white"
          disabled={loading}
          aria-label="Refresh fundamental signals"
        >
          <RefreshCcw size={16} className={loading ? 'animate-spin' : 'transition-transform group-hover:rotate-180'} />
          Refresh
        </button>
      </div>

      {lastUpdated && (
        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
          Updated {new Date(lastUpdated).toLocaleTimeString()}
          {nextScan && ` • Next scan ${new Date(nextScan).toLocaleTimeString()}`}
        </p>
      )}

      {/* Quality counts summary */}
      {!loading && qualityCounts && (
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          {qualityCounts.excellent > 0 && (
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:text-emerald-300">
              ⭐ {qualityCounts.excellent} Excellent
            </span>
          )}
          {qualityCounts.good > 0 && (
            <span className="rounded-full bg-blue-500/10 px-3 py-1 text-blue-700 dark:text-blue-300">
              🔵 {qualityCounts.good} Good
            </span>
          )}
          {qualityCounts.fair > 0 && (
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-700 dark:text-amber-300">
              🟡 {qualityCounts.fair} Fair
            </span>
          )}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: Math.min(limit, 3) }).map((_, idx) => (
              <div key={`skeleton-${idx}`} className="animate-pulse rounded-2xl border border-slate-200 bg-slate-100 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="h-4 w-24 rounded bg-slate-300 dark:bg-white/30" />
                <div className="mt-3 h-3 w-full rounded bg-slate-200 dark:bg-white/10" />
                <div className="mt-2 h-3 w-3/4 rounded bg-slate-200 dark:bg-white/10" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100">
            {error}
          </div>
        )}

        {!loading && !error && signals.length === 0 && (
          <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-400/30 dark:bg-slate-500/10 dark:text-slate-300">
            {totalScanned !== null && totalScanned > 0 ? (
              <>
                📊 Scanned {totalScanned} stock{totalScanned === 1 ? '' : 's'}, but no strong opportunities meet the current criteria.
              </>
            ) : (
              <>📊 No strong stock opportunities detected at this time.</>
            )}
          </div>
        )}

        {/* EXCELLENT signals */}
        {!loading && !error && groupedSignals.excellent.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              ⭐ EXCELLENT ({groupedSignals.excellent.length})
            </h3>
            <div className="space-y-3">
              {groupedSignals.excellent.map(signal => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  tag={symbolTags?.[signal.symbol.toUpperCase()]}
                  expanded={expandedSignals.has(signal.id)}
                  onToggleExpand={() => toggleExpand(signal.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* GOOD signals */}
        {!loading && !error && groupedSignals.good.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              🔵 GOOD QUALITY ({groupedSignals.good.length})
            </h3>
            <div className="space-y-3">
              {groupedSignals.good.map(signal => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  tag={symbolTags?.[signal.symbol.toUpperCase()]}
                  expanded={expandedSignals.has(signal.id)}
                  onToggleExpand={() => toggleExpand(signal.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* FAIR signals */}
        {!loading && !error && groupedSignals.fair.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              🟡 FAIR ({groupedSignals.fair.length})
            </h3>
            <div className="space-y-3">
              {groupedSignals.fair.map(signal => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  tag={symbolTags?.[signal.symbol.toUpperCase()]}
                  expanded={expandedSignals.has(signal.id)}
                  onToggleExpand={() => toggleExpand(signal.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* POOR signals (collapsed by default) */}
        {!loading && !error && groupedSignals.poor.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <ChevronDown className="transition-transform group-open:rotate-180" size={16} />
                ⚪ WATCH LIST ({groupedSignals.poor.length})
              </div>
            </summary>
            <div className="mt-3 space-y-3">
              {groupedSignals.poor.map(signal => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  tag={symbolTags?.[signal.symbol.toUpperCase()]}
                  expanded={expandedSignals.has(signal.id)}
                  onToggleExpand={() => toggleExpand(signal.id)}
                />
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

interface SignalCardProps {
  signal: FundamentalSignal
  tag?: 'portfolio' | 'watchlist'
  expanded: boolean
  onToggleExpand: () => void
}

function SignalCard({ signal, tag, expanded, onToggleExpand }: SignalCardProps) {
  const styles = qualityStyles[signal.qualityLevel]
  const scoreBadge = scoreGradient(signal.overallScore)
  const isPortfolio = tag === 'portfolio'

  const formatPercent = (val: number | null) => {
    if (val === null) return 'N/A'
    return `${(val * 100).toFixed(1)}%`
  }

  const formatCurrency = (val: number | null) => {
    if (val === null) return 'N/A'
    if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`
    if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`
    return `$${val.toFixed(2)}`
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${
        isPortfolio ? 'border-emerald-500/60 shadow-[0_0_20px_rgba(52,211,153,0.3)]' : styles.border
      } ${styles.glow} bg-white/80 p-5 transition-all duration-300 hover:border-slate-300 hover:shadow-xl dark:bg-slate-900/60 dark:hover:border-white/20`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-semibold text-slate-900 dark:text-white">{signal.symbol}</span>
            {tag && (
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                  isPortfolio
                    ? 'bg-emerald-500/20 text-emerald-700 border-emerald-400/50 dark:text-emerald-200'
                    : 'bg-blue-500/20 text-blue-700 border-blue-400/50 dark:text-blue-200'
                }`}
              >
                {tag}
              </span>
            )}
            <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] ${styles.badge}`}>
              {signal.qualityLevel}
            </span>
          </div>

          {/* Buy reason */}
          {signal.buyReason && (
            <div className="mt-2 text-sm font-medium text-slate-800 dark:text-white/90">
              {signal.buyReason}
            </div>
          )}

          {/* Key metrics */}
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-white/60">
            {signal.sector && <span>{signal.sector}</span>}
            {signal.marketCap && <span>MCap: {formatCurrency(signal.marketCap)}</span>}
            {signal.peRatio && <span>P/E: {signal.peRatio.toFixed(1)}</span>}
            {signal.revenueGrowth && <span>Rev Growth: {formatPercent(signal.revenueGrowth)}</span>}
          </div>

          {/* Component scores */}
          <div className="mt-3 flex flex-wrap gap-2">
            {signal.healthScore > 0 && (
              <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-white/5">
                <span className="text-slate-500 dark:text-slate-400">Health:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{Math.round(signal.healthScore * 100)}</span>
              </div>
            )}
            {signal.growthScore > 0 && (
              <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-white/5">
                <span className="text-slate-500 dark:text-slate-400">Growth:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{Math.round(signal.growthScore * 100)}</span>
              </div>
            )}
            {signal.profitabilityScore > 0 && (
              <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-white/5">
                <span className="text-slate-500 dark:text-slate-400">Profit:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{Math.round(signal.profitabilityScore * 100)}</span>
              </div>
            )}
            {signal.valuationScore > 0 && (
              <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-white/5">
                <span className="text-slate-500 dark:text-slate-400">Value:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{Math.round(signal.valuationScore * 100)}</span>
              </div>
            )}
          </div>

          {/* Price and target */}
          {(signal.currentPrice || signal.targetUpsidePct) && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Current Price
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                    {signal.currentPrice ? `$${signal.currentPrice.toFixed(2)}` : 'N/A'}
                  </div>
                </div>
                {signal.targetUpsidePct && signal.targetUpsidePct > 0 && (
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Upside Potential
                    </div>
                    <div className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      +{signal.targetUpsidePct.toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Score badge */}
        <div className="flex flex-col items-end text-right">
          <div className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${scoreBadge} px-6 py-4 text-white shadow-lg dark:border-white/10`}>
            <div className="text-xs uppercase tracking-[0.3em] text-white/90">Score</div>
            <div className="mt-1 text-3xl font-semibold">
              {signal.overallScore}/100
            </div>
          </div>
          {signal.analystRating && (
            <span className="mt-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-white/60">
              Analysts: {signal.analystRating.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Expandable details */}
      <button
        onClick={onToggleExpand}
        className="mt-4 flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? 'Hide' : 'Show'} detailed analysis
      </button>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-white/10">
          {/* Strengths */}
          {signal.strengths.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                ✅ Key Strengths
              </div>
              <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-white/80">
                {signal.strengths.map((strength, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weaknesses */}
          {signal.weaknesses.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                ⚠️ Considerations
              </div>
              <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-white/80">
                {signal.weaknesses.map((weakness, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500 dark:bg-amber-400" />
                    <span>{weakness}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Catalysts */}
          {signal.catalysts.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                🚀 Catalysts
              </div>
              <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-white/80">
                {signal.catalysts.map((catalyst, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500 dark:bg-blue-400" />
                    <span>{catalyst}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risk factors */}
          {signal.riskFactors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
              <div className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
                ⚠️ Risk Factors
              </div>
              <ul className="mt-2 space-y-1 text-sm text-red-800 dark:text-red-200">
                {signal.riskFactors.map((risk, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-600 dark:bg-red-400" />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendation */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">{signal.recommendation}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FundamentalsScanner
