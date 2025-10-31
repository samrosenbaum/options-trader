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

export function DropRiskRadar({ limit = 5, minScore = 45 }: { limit?: number; minScore?: number }) {
  const [signals, setSignals] = useState<DropRiskSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const requestSignals = useCallback(async () => fetchDropSignals(limit, minScore), [limit, minScore])

  const applyPayload = useCallback((payload: ApiResponse) => {
    if (payload.success && payload.data) {
      setSignals(payload.data)
      setLastUpdated(payload.generatedAt ?? new Date().toISOString())
      setError(null)
    } else {
      setError(payload.error ?? 'Unable to load drop risk signals')
    }
  }, [])

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

    run().catch(() => {})

    const interval = setInterval(() => {
      run().catch(() => {})
    }, 1000 * 60 * 5)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [applyPayload, requestSignals])

  const headerSubtitle = useMemo(() => {
    if (loading) return 'Scanning skew, flow, regime, and sentiment stacks...'
    if (error) return 'We could not refresh the bearish radar. Try again shortly.'
    if (!signals.length) return 'No elevated drop setups detected right now.'
    return 'Composite bearish score across options skew, smart flow, regime, and sentiment.'
  }, [loading, error, signals.length])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900/70 to-slate-950 p-6 shadow-[0_25px_80px_-40px_rgba(8,47,73,0.75)]">
      <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-red-500/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.3em] text-emerald-200/70">
            <AlertTriangle size={16} /> Bearish Risk Radar
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Potential Drop Setups</h2>
          <p className="mt-1 text-sm text-emerald-100/70">{headerSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => refreshSignals().catch(() => {})}
          className="group inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 text-sm font-medium text-white/80 transition-all hover:border-emerald-400/60 hover:bg-emerald-500/10 hover:text-white"
          disabled={loading}
          aria-label="Refresh drop risk radar"
        >
          <RefreshCcw size={16} className={loading ? 'animate-spin' : 'transition-transform group-hover:rotate-180'} />
          Refresh
        </button>
      </div>

      {lastUpdated && (
        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-white/40">Updated {new Date(lastUpdated).toLocaleTimeString()}</p>
      )}

      <div className="mt-6 space-y-4">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: Math.min(limit, 3) }).map((_, idx) => (
              <div key={`skeleton-${idx}`} className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="h-4 w-24 rounded bg-white/30" />
                <div className="mt-3 h-3 w-full rounded bg-white/10" />
                <div className="mt-2 h-3 w-3/4 rounded bg-white/10" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {!loading && !error && signals.length === 0 && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            All clear for now — none of the tracked names show elevated downside risk.
          </div>
        )}

        {!loading && !error && signals.map(signal => {
          const styles = alertStyles[signal.alertLevel]
          const scoreBadge = scoreColor(signal.score)
          const scoreChange = formatScoreChange(signal.scoreChange)
          const priceMove = formatPercent(signal.priceChangePct, 2)

          return (
            <div
              key={signal.id}
              className={`relative overflow-hidden rounded-2xl border ${styles.border} ${styles.glow} bg-slate-900/60 p-5 transition-all duration-300 hover:border-white/20 hover:shadow-[0_25px_70px_-30px_rgba(248,113,113,0.45)]`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-white">{signal.symbol}</span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] ${styles.badge}`}>
                      {signal.alertLevel}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-white/60">
                    <span>Confidence {Math.round(signal.confidence)}%</span>
                    {scoreChange && <span className={signal.scoreChange && signal.scoreChange > 0 ? 'text-amber-200' : 'text-slate-300'}>Δ score {scoreChange}</span>}
                    {priceMove && (
                      <span className="inline-flex items-center gap-1">
                        <ArrowDown size={14} className="text-red-300" />
                        {priceMove} today
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end text-right">
                  <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${scoreBadge} px-6 py-4 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)]`}>
                    <div className="text-xs uppercase tracking-[0.3em] text-white/70">Drop Risk</div>
                    <div className="mt-1 text-3xl font-semibold">{signal.score.toFixed(1)}</div>
                  </div>
                  {signal.stockPrice != null && (
                    <span className="mt-2 text-xs text-white/60">Spot ${signal.stockPrice.toFixed(2)}</span>
                  )}
                </div>
              </div>

              {signal.drivers.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm text-white/80">
                  {signal.drivers.map((driver, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
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
