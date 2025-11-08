'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { TrendingDown, AlertTriangle, RefreshCcw, ChevronDown, ChevronUp } from 'lucide-react'
import type { BearishSignal } from '@/app/api/bearish-signals/route'

interface ApiResponse {
  success: boolean
  data?: BearishSignal[]
  count?: number
  totalScanned?: number
  generatedAt?: string
  nextScanAt?: string
  error?: string
}

const alertStyles: Record<BearishSignal['alertLevel'], { badge: string; border: string; glow: string; text: string; icon: string }> = {
  watch: {
    badge: 'bg-slate-500/15 text-slate-200 border-slate-400/40',
    border: 'border-slate-400/30',
    glow: 'shadow-[0_10px_30px_rgba(148,163,184,0.15)]',
    text: 'text-slate-200',
    icon: '⚪',
  },
  moderate: {
    badge: 'bg-amber-500/15 text-amber-200 border-amber-400/40',
    border: 'border-amber-400/40',
    glow: 'shadow-[0_15px_45px_rgba(217,119,6,0.2)]',
    text: 'text-amber-100',
    icon: '🟡',
  },
  high: {
    badge: 'bg-orange-500/15 text-orange-200 border-orange-400/40',
    border: 'border-orange-400/40',
    glow: 'shadow-[0_15px_45px_rgba(249,115,22,0.25)]',
    text: 'text-orange-100',
    icon: '🟠',
  },
  extreme: {
    badge: 'bg-red-500/15 text-red-200 border-red-400/40',
    border: 'border-red-400/40',
    glow: 'shadow-[0_18px_55px_rgba(248,113,113,0.28)]',
    text: 'text-red-100',
    icon: '🔴',
  },
}

const scoreGradient = (score: number, maxScore: number) => {
  const pct = (score / maxScore) * 100
  if (pct >= 80) return 'from-red-500/90 via-red-400/70 to-red-500/40'
  if (pct >= 60) return 'from-orange-500/90 via-orange-400/70 to-orange-500/40'
  if (pct >= 30) return 'from-amber-500/90 via-amber-400/70 to-amber-500/40'
  return 'from-slate-500/80 via-slate-400/60 to-slate-500/40'
}

const fetchBearishSignals = async (minScore: number, limit: number): Promise<ApiResponse> => {
  const params = new URLSearchParams({
    minScore: String(minScore),
    limit: String(limit),
  })

  const response = await fetch(`/api/bearish-signals?${params.toString()}`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  return response.json()
}

interface BearishSignalScannerProps {
  limit?: number
  minScore?: number
  filterSymbols?: string[]
  symbolTags?: Record<string, 'portfolio' | 'watchlist'>
}

export function BearishSignalScanner({
  limit = 10,
  minScore = 8,
  filterSymbols,
  symbolTags,
}: BearishSignalScannerProps) {
  const [signals, setSignals] = useState<BearishSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [nextScan, setNextScan] = useState<string | null>(null)
  const [totalScanned, setTotalScanned] = useState<number | null>(null)
  const [expandedSignals, setExpandedSignals] = useState<Set<string>>(new Set())

  const requestSignals = useCallback(async () => fetchBearishSignals(minScore, limit), [minScore, limit])

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
        setError(null)
      } else {
        setError(payload.error ?? 'Unable to load bearish signals')
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
      setError(err instanceof Error ? err.message : 'Unable to load bearish signals')
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
        setError(err instanceof Error ? err.message : 'Unable to load bearish signals')
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

  // Group signals by alert level
  const groupedSignals = useMemo(() => {
    const extreme = signals.filter(s => s.alertLevel === 'extreme')
    const high = signals.filter(s => s.alertLevel === 'high')
    const moderate = signals.filter(s => s.alertLevel === 'moderate')
    const watch = signals.filter(s => s.alertLevel === 'watch')

    return { extreme, high, moderate, watch }
  }, [signals])

  const headerSubtitle = useMemo(() => {
    if (loading) return 'Analyzing unusual options activity across symbols...'
    if (error) return 'Unable to refresh bearish signals. Try again shortly.'
    if (!signals.length) {
      if (totalScanned !== null && totalScanned > 0) {
        return `Scanned ${totalScanned} symbol${totalScanned === 1 ? '' : 's'} — no high-confidence bearish signals detected.`
      }
      return 'No high-confidence bearish signals detected right now.'
    }
    return `${signals.length} bearish signal${signals.length === 1 ? '' : 's'} detected across ${totalScanned ?? '120+'} symbols.`
  }, [loading, error, signals.length, totalScanned])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/70 to-white p-6 shadow-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/70 dark:to-slate-950">
      <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-red-500/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.3em] text-red-600/70 dark:text-red-400/70">
            <TrendingDown size={16} /> Bearish Signal Scanner
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Put Opportunities</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{headerSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => refreshSignals().catch(() => {})}
          className="group inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 text-sm font-medium text-slate-700 transition-all hover:border-red-400/60 hover:bg-red-50 dark:border-white/10 dark:bg-white/10 dark:text-white/80 dark:hover:border-red-400/60 dark:hover:bg-red-500/10 dark:hover:text-white"
          disabled={loading}
          aria-label="Refresh bearish signals"
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
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100">
            {totalScanned !== null && totalScanned > 0 ? (
              <>
                ✅ All clear — scanned {totalScanned} symbol{totalScanned === 1 ? '' : 's'}, no high-confidence bearish signals detected.
              </>
            ) : (
              <>✅ All clear — no high-confidence bearish signals detected across tracked symbols.</>
            )}
          </div>
        )}

        {/* EXTREME signals */}
        {!loading && !error && groupedSignals.extreme.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
              🔴 EXTREME ({groupedSignals.extreme.length})
            </h3>
            <div className="space-y-3">
              {groupedSignals.extreme.map(signal => (
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

        {/* HIGH signals */}
        {!loading && !error && groupedSignals.high.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
              🟠 HIGH CONFIDENCE ({groupedSignals.high.length})
            </h3>
            <div className="space-y-3">
              {groupedSignals.high.map(signal => (
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

        {/* MODERATE signals */}
        {!loading && !error && groupedSignals.moderate.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              🟡 MODERATE ({groupedSignals.moderate.length})
            </h3>
            <div className="space-y-3">
              {groupedSignals.moderate.map(signal => (
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

        {/* WATCH signals (collapsed by default) */}
        {!loading && !error && groupedSignals.watch.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <ChevronDown className="transition-transform group-open:rotate-180" size={16} />
                ⚪ WATCH LIST ({groupedSignals.watch.length})
              </div>
            </summary>
            <div className="mt-3 space-y-3">
              {groupedSignals.watch.map(signal => (
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
  signal: BearishSignal
  tag?: 'portfolio' | 'watchlist'
  expanded: boolean
  onToggleExpand: () => void
}

function SignalCard({ signal, tag, expanded, onToggleExpand }: SignalCardProps) {
  const styles = alertStyles[signal.alertLevel]
  const scoreBadge = scoreGradient(signal.totalScore, signal.maxScore)
  const isPortfolio = tag === 'portfolio'

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${
        isPortfolio ? 'border-orange-500/60 shadow-[0_0_20px_rgba(249,115,22,0.3)]' : styles.border
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
                    ? 'bg-orange-500/20 text-orange-700 border-orange-400/50 dark:text-orange-200'
                    : 'bg-blue-500/20 text-blue-700 border-blue-400/50 dark:text-blue-200'
                }`}
              >
                {tag}
              </span>
            )}
            <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] ${styles.badge}`}>
              {signal.alertLevel}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-white/60">
            <span>Confidence {signal.confidence}%</span>
            <span>P/C: {signal.putCallRatio.toFixed(2)}</span>
            {signal.putCallZscore !== null && <span>Z-score: {signal.putCallZscore.toFixed(1)}σ</span>}
            {signal.darkPoolBearish && <span className="text-red-600 dark:text-red-400">🔥 Dark Pool</span>}
            {signal.gammaExposure !== null && signal.gammaExposure < 0 && (
              <span className="text-red-600 dark:text-red-400">⚡ Negative Gamma</span>
            )}
          </div>

          {/* Recommended Action */}
          {signal.recommendedStrikes.length > 0 && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                💡 Recommended Put
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                ${signal.recommendedStrikes[0].toFixed(2)} Strike
              </div>
              {signal.expectedRoi && (
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Expected ROI: {signal.expectedRoi}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Score badge */}
        <div className="flex flex-col items-end text-right">
          <div className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${scoreBadge} px-6 py-4 text-white shadow-lg dark:border-white/10`}>
            <div className="text-xs uppercase tracking-[0.3em] text-white/90">Score</div>
            <div className="mt-1 text-3xl font-semibold">
              {signal.totalScore}/{signal.maxScore}
            </div>
          </div>
          {signal.currentPrice !== null && (
            <span className="mt-2 text-xs text-slate-600 dark:text-white/60">Spot ${signal.currentPrice.toFixed(2)}</span>
          )}
        </div>
      </div>

      {/* Expandable details */}
      <button
        onClick={onToggleExpand}
        className="mt-4 flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? 'Hide' : 'Show'} signal breakdown
      </button>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-white/10">
          {/* Drivers */}
          {signal.drivers.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Key Drivers</div>
              <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-white/80">
                {signal.drivers.map((driver, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400 dark:bg-white/50" />
                    <span>{driver}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Signal breakdown */}
          {signal.signals.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Signal Components</div>
              <div className="mt-2 space-y-2">
                {signal.signals
                  .sort((a, b) => b.points - a.points)
                  .map((sig, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 dark:text-white/80">
                        {sig.description}
                        {sig.percentile && <span className="text-slate-500 dark:text-slate-400"> ({sig.percentile.toFixed(0)}th %ile)</span>}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">+{sig.points} pts</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Recommendation */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">{signal.recommendation}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BearishSignalScanner
