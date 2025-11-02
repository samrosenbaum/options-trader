'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, AlertTriangle, RefreshCcw } from 'lucide-react'
import type { DropRiskSignal, DropRiskAlertLevel } from '@/lib/types/drop-alert'

interface ApiResponse {
  success: boolean
  data?: DropRiskSignal[]
  count?: number
  generatedAt?: string
  error?: string
}

const alertStyles: Record<DropRiskAlertLevel, { badge: string; border: string; glow: string; text: string }> = {
  watch: {
    badge: 'bg-slate-500/15 text-slate-200 border-slate-400/40',
    border: 'border-slate-400/30',
    glow: 'shadow-[0_10px_30px_rgba(148,163,184,0.15)]',
    text: 'text-slate-200',
  },
  elevated: {
    badge: 'bg-amber-500/15 text-amber-200 border-amber-400/40',
    border: 'border-amber-400/40',
    glow: 'shadow-[0_15px_45px_rgba(217,119,6,0.2)]',
    text: 'text-amber-100',
  },
  high: {
    badge: 'bg-orange-500/15 text-orange-200 border-orange-400/40',
    border: 'border-orange-400/40',
    glow: 'shadow-[0_15px_45px_rgba(249,115,22,0.25)]',
    text: 'text-orange-100',
  },
  extreme: {
    badge: 'bg-red-500/15 text-red-200 border-red-400/40',
    border: 'border-red-400/40',
    glow: 'shadow-[0_18px_55px_rgba(248,113,113,0.28)]',
    text: 'text-red-100',
  },
}

const scoreColor = (score: number) => {
  if (score >= 80) return 'from-red-500/90 via-red-400/70 to-red-500/40'
  if (score >= 65) return 'from-orange-500/90 via-orange-400/70 to-orange-500/40'
  if (score >= 50) return 'from-amber-500/90 via-amber-400/70 to-amber-500/40'
  return 'from-slate-500/80 via-slate-400/60 to-slate-500/40'
}

const formatPercent = (value: number | null | undefined, digits = 1) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null
  }
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return formatter.format(value / 100)
}

const formatScoreChange = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value) || value === 0) {
    return null
  }
  const formatted = Math.abs(value).toFixed(1)
  return `${value > 0 ? '+' : '−'}${formatted}`
}

const fetchDropSignals = async (limit: number, minScore?: number): Promise<ApiResponse> => {
  const params = new URLSearchParams({ limit: String(limit) })
  if (typeof minScore === 'number' && minScore > 0) {
    params.set('minScore', String(minScore))
  }

  const response = await fetch(`/api/drop-risk?${params.toString()}`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  return response.json()
}

interface DropRiskRadarProps {
  limit?: number
  minScore?: number
  filterSymbols?: string[]
  symbolTags?: Record<string, 'portfolio' | 'watchlist'>
}

export function DropRiskRadar({ limit = 5, minScore = 45, filterSymbols, symbolTags }: DropRiskRadarProps) {
  const [signals, setSignals] = useState<DropRiskSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const requestSignals = useCallback(async () => fetchDropSignals(limit, minScore), [limit, minScore])

  const applyPayload = useCallback((payload: ApiResponse) => {
    if (payload.success && payload.data) {
      let filteredData = payload.data

      // Filter to only symbols in portfolio/watchlist if provided
      if (filterSymbols && filterSymbols.length > 0) {
        const symbolSet = new Set(filterSymbols.map(s => s.toUpperCase()))
        filteredData = payload.data.filter(signal => symbolSet.has(signal.symbol.toUpperCase()))
      }

      setSignals(filteredData)
      setLastUpdated(payload.generatedAt ?? new Date().toISOString())
      setError(null)
    } else {
      setError(payload.error ?? 'Unable to load drop risk signals')
    }
  }, [filterSymbols])

  const refreshSignals = useCallback(async () => {
    setLoading(true)
    try {
      const payload = await requestSignals()
      applyPayload(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load drop risk signals')
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
        setError(err instanceof Error ? err.message : 'Unable to load drop risk signals')
      } finally {
        if (active) setLoading(false)
      }
    }

    // Only run once on mount - no auto-refresh interval
    run().catch(() => {})

    return () => {
      active = false
    }
  }, [applyPayload, requestSignals])

  const headerSubtitle = useMemo(() => {
    if (loading) return 'Scanning skew, flow, regime, and sentiment stacks...'
    if (error) return 'We could not refresh the bearish radar. Try again shortly.'
    if (!signals.length) return 'No elevated drop setups detected right now.'
    return 'Composite bearish score across options skew, smart flow, regime, and sentiment.'
  }, [loading, error, signals.length])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/70 to-white p-6 shadow-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/70 dark:to-slate-950">
      <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-red-500/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.3em] text-red-600/70 dark:text-red-400/70">
            <AlertTriangle size={16} /> Bearish Risk Radar
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Potential Drop Setups</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{headerSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => refreshSignals().catch(() => {})}
          className="group inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 text-sm font-medium text-slate-700 transition-all hover:border-red-400/60 hover:bg-red-50 dark:border-white/10 dark:bg-white/10 dark:text-white/80 dark:hover:border-red-400/60 dark:hover:bg-red-500/10 dark:hover:text-white"
          disabled={loading}
          aria-label="Refresh drop risk radar"
        >
          <RefreshCcw size={16} className={loading ? 'animate-spin' : 'transition-transform group-hover:rotate-180'} />
          Refresh
        </button>
      </div>

      {lastUpdated && (
        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">Updated {new Date(lastUpdated).toLocaleTimeString()}</p>
      )}

      <div className="mt-6 space-y-4">
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
            All clear for now — none of the tracked names show elevated downside risk.
          </div>
        )}

        {!loading && !error && signals.map(signal => {
          const styles = alertStyles[signal.alertLevel]
          const scoreBadge = scoreColor(signal.score)
          const scoreChange = formatScoreChange(signal.scoreChange)
          const priceMove = formatPercent(signal.priceChangePct, 2)
          const tag = symbolTags?.[signal.symbol.toUpperCase()]
          const isPortfolio = tag === 'portfolio'

          return (
            <div
              key={signal.id}
              className={`relative overflow-hidden rounded-2xl border ${isPortfolio ? 'border-orange-500/60 shadow-[0_0_20px_rgba(249,115,22,0.3)]' : styles.border} ${styles.glow} bg-white/80 p-5 transition-all duration-300 hover:border-slate-300 hover:shadow-xl dark:bg-slate-900/60 dark:hover:border-white/20`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-semibold text-slate-900 dark:text-white">{signal.symbol}</span>
                    {tag && (
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                        isPortfolio
                          ? 'bg-orange-500/20 text-orange-700 border-orange-400/50 dark:text-orange-200'
                          : 'bg-blue-500/20 text-blue-700 border-blue-400/50 dark:text-blue-200'
                      }`}>
                        {tag}
                      </span>
                    )}
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] ${styles.badge}`}>
                      {signal.alertLevel}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-white/60">
                    <span>Confidence {Math.round(signal.confidence)}%</span>
                    {scoreChange && <span className={signal.scoreChange && signal.scoreChange > 0 ? 'text-amber-600 dark:text-amber-200' : 'text-slate-500 dark:text-slate-300'}>Δ score {scoreChange}</span>}
                    {priceMove && (
                      <span className="inline-flex items-center gap-1">
                        <ArrowDown size={14} className="text-red-500 dark:text-red-300" />
                        {priceMove} today
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end text-right">
                  <div className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${scoreBadge} px-6 py-4 text-white shadow-lg dark:border-white/10`}>
                    <div className="text-xs uppercase tracking-[0.3em] text-white/90">Drop Risk</div>
                    <div className="mt-1 text-3xl font-semibold">{signal.score.toFixed(1)}</div>
                  </div>
                  {signal.stockPrice != null && (
                    <span className="mt-2 text-xs text-slate-600 dark:text-white/60">Spot ${signal.stockPrice.toFixed(2)}</span>
                  )}
                </div>
              </div>

              {signal.drivers.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-white/80">
                  {signal.drivers.map((driver, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-white/50" />
                      <span>{driver}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DropRiskRadar
