'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { TrendingUp, LineChart, RefreshCcw, ChevronDown, ChevronUp, AlertCircle, Info } from 'lucide-react'
import type { FundamentalsSignal } from '@/app/api/fundamentals-scanner/route'

interface ApiResponse {
  success: boolean
  data?: FundamentalsSignal[]
  count?: number
  totalScanned?: number
  qualityBreakdown?: {
    excellent: number
    good: number
    fair: number
    poor: number
  }
  generatedAt?: string
  nextScanAt?: string
  error?: string
}

const qualityStyles: Record<FundamentalsSignal['qualityLevel'], { badge: string; border: string; glow: string; text: string; icon: string }> = {
  excellent: {
    badge: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40',
    border: 'border-emerald-400/40',
    glow: 'shadow-[0_18px_55px_rgba(16,185,129,0.28)]',
    text: 'text-emerald-100',
    icon: '⭐',
  },
  good: {
    badge: 'bg-blue-500/15 text-blue-200 border-blue-400/40',
    border: 'border-blue-400/40',
    glow: 'shadow-[0_15px_45px_rgba(59,130,246,0.25)]',
    text: 'text-blue-100',
    icon: '💎',
  },
  fair: {
    badge: 'bg-amber-500/15 text-amber-200 border-amber-400/40',
    border: 'border-amber-400/40',
    glow: 'shadow-[0_15px_45px_rgba(217,119,6,0.2)]',
    text: 'text-amber-100',
    icon: '📊',
  },
  poor: {
    badge: 'bg-slate-500/15 text-slate-200 border-slate-400/40',
    border: 'border-slate-400/30',
    glow: 'shadow-[0_10px_30px_rgba(148,163,184,0.15)]',
    text: 'text-slate-200',
    icon: '⚠️',
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
    // Try to parse error details from response
    try {
      const errorData = await response.json()
      const errorMessage = errorData.details || errorData.error || `API request failed with status ${response.status}`
      throw new Error(errorMessage)
    } catch (parseError) {
      // If we can't parse the error, fall back to generic message
      throw new Error(`API request failed with status ${response.status}`)
    }
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
  const [signals, setSignals] = useState<FundamentalsSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [nextScan, setNextScan] = useState<string | null>(null)
  const [totalScanned, setTotalScanned] = useState<number | null>(null)
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
        setError(null)
      } else {
        setError(payload.error ?? 'Unable to load fundamentals signals')
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
      setError(err instanceof Error ? err.message : 'Unable to load fundamentals signals')
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
        setError(err instanceof Error ? err.message : 'Unable to load fundamentals signals')
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
    if (loading) return 'Analyzing fundamentals, valuations, and analyst sentiment...'
    if (error) return 'Unable to refresh signals. Try again shortly.'
    if (!signals.length) {
      if (totalScanned !== null && totalScanned > 0) {
        return `Scanned ${totalScanned} stock${totalScanned === 1 ? '' : 's'} — no signals matching your filters.`
      }
      return 'No stock signals detected right now.'
    }
    return `${signals.length} stock signal${signals.length === 1 ? '' : 's'} detected across ${totalScanned ?? 'multiple'} symbols.`
  }, [loading, error, signals.length, totalScanned])

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'N/A'
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
    return `$${value.toFixed(2)}`
  }

  const formatPercent = (value: number | null | undefined, decimals = 1) => {
    if (value === null || value === undefined) return 'N/A'
    return `${(value * 100).toFixed(decimals)}%`
  }

  const formatRatio = (value: number | null | undefined, decimals = 2) => {
    if (value === null || value === undefined) return 'N/A'
    return value.toFixed(decimals)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/70 to-white p-6 shadow-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/70 dark:to-slate-950">
      <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.3em] text-emerald-600/70 dark:text-emerald-400/70">
            <TrendingUp size={16} /> Stock Fundamentals Scanner
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Buy Opportunities</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{headerSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => refreshSignals().catch(() => {})}
          disabled={loading}
          className="rounded-full bg-white/80 p-3 text-slate-700 shadow-md transition-all hover:bg-white hover:shadow-lg disabled:opacity-50 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
          aria-label="Refresh signals"
        >
          <RefreshCcw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="relative mt-6 flex items-center gap-3 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertCircle size={20} className="flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {!loading && signals.length === 0 && !error && (
        <div className="relative mt-6 flex flex-col items-center justify-center rounded-xl border border-slate-200/50 bg-slate-50/50 p-12 dark:border-white/5 dark:bg-white/5">
          <LineChart size={48} className="mb-4 text-slate-400 dark:text-slate-600" />
          <p className="text-center text-slate-600 dark:text-slate-400">
            {filterSymbols && filterSymbols.length > 0
              ? 'None of your portfolio/watchlist stocks meet the current filter criteria.'
              : 'No stocks meet the current scoring criteria. Try adjusting filters.'}
          </p>
        </div>
      )}

      {!loading && signals.length > 0 && (
        <div className="relative mt-6 space-y-6">
          {/* Excellent quality signals */}
          {groupedSignals.excellent.length > 0 && (
            <SignalGroup
              title="Excellent Quality"
              description="Top-tier fundamentals across all categories"
              signals={groupedSignals.excellent}
              qualityLevel="excellent"
              expandedSignals={expandedSignals}
              toggleExpand={toggleExpand}
              symbolTags={symbolTags}
              formatCurrency={formatCurrency}
              formatPercent={formatPercent}
              formatRatio={formatRatio}
            />
          )}

          {/* Good quality signals */}
          {groupedSignals.good.length > 0 && (
            <SignalGroup
              title="Good Quality"
              description="Solid fundamentals with minor concerns"
              signals={groupedSignals.good}
              qualityLevel="good"
              expandedSignals={expandedSignals}
              toggleExpand={toggleExpand}
              symbolTags={symbolTags}
              formatCurrency={formatCurrency}
              formatPercent={formatPercent}
              formatRatio={formatRatio}
            />
          )}

          {/* Fair quality signals */}
          {groupedSignals.fair.length > 0 && (
            <SignalGroup
              title="Fair Quality"
              description="Mixed fundamentals - selective opportunities"
              signals={groupedSignals.fair}
              qualityLevel="fair"
              expandedSignals={expandedSignals}
              toggleExpand={toggleExpand}
              symbolTags={symbolTags}
              formatCurrency={formatCurrency}
              formatPercent={formatPercent}
              formatRatio={formatRatio}
              defaultCollapsed
            />
          )}

          {/* Poor quality signals - only show if explicitly requested */}
          {groupedSignals.poor.length > 0 && minScore < 50 && (
            <SignalGroup
              title="Watch List"
              description="Weak fundamentals - monitor only"
              signals={groupedSignals.poor}
              qualityLevel="poor"
              expandedSignals={expandedSignals}
              toggleExpand={toggleExpand}
              symbolTags={symbolTags}
              formatCurrency={formatCurrency}
              formatPercent={formatPercent}
              formatRatio={formatRatio}
              defaultCollapsed
            />
          )}
        </div>
      )}

      {loading && (
        <div className="relative mt-6 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-xl border border-slate-200/50 bg-gradient-to-br from-slate-100/50 to-slate-50/30 dark:border-white/5 dark:from-white/5 dark:to-transparent"
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface SignalGroupProps {
  title: string
  description: string
  signals: FundamentalsSignal[]
  qualityLevel: FundamentalsSignal['qualityLevel']
  expandedSignals: Set<string>
  toggleExpand: (id: string) => void
  symbolTags?: Record<string, 'portfolio' | 'watchlist'>
  formatCurrency: (value: number | null | undefined) => string
  formatPercent: (value: number | null | undefined, decimals?: number) => string
  formatRatio: (value: number | null | undefined, decimals?: number) => string
  defaultCollapsed?: boolean
}

function SignalGroup({
  title,
  description,
  signals,
  qualityLevel,
  expandedSignals,
  toggleExpand,
  symbolTags,
  formatCurrency,
  formatPercent,
  formatRatio,
  defaultCollapsed = false,
}: SignalGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const styles = qualityStyles[qualityLevel]

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h3 className={`text-lg font-semibold ${styles.text}`}>
            {styles.icon} {title} ({signals.length})
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
        </div>
        {collapsed ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronUp size={20} className="text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="grid gap-4 md:grid-cols-2">
          {signals.map(signal => (
            <SignalCard
              key={signal.id}
              signal={signal}
              expanded={expandedSignals.has(signal.id)}
              onToggle={() => toggleExpand(signal.id)}
              tag={symbolTags?.[signal.symbol]}
              formatCurrency={formatCurrency}
              formatPercent={formatPercent}
              formatRatio={formatRatio}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface SignalCardProps {
  signal: FundamentalsSignal
  expanded: boolean
  onToggle: () => void
  tag?: 'portfolio' | 'watchlist'
  formatCurrency: (value: number | null | undefined) => string
  formatPercent: (value: number | null | undefined, decimals?: number) => string
  formatRatio: (value: number | null | undefined, decimals?: number) => string
}

function SignalCard({ signal, expanded, onToggle, tag, formatCurrency, formatPercent, formatRatio }: SignalCardProps) {
  const styles = qualityStyles[signal.qualityLevel]

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br from-white/90 via-white/60 to-white/90 p-5 transition-all hover:scale-[1.01] dark:from-slate-900/90 dark:via-slate-900/60 dark:to-slate-900/90 ${styles.border} ${styles.glow}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <h4 className="text-2xl font-bold text-slate-900 dark:text-white">{signal.symbol}</h4>
          {tag && (
            <span className="rounded-md bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">
              {tag === 'portfolio' ? '📂 Portfolio' : '👁️ Watchlist'}
            </span>
          )}
        </div>
        <span className={`rounded-lg border px-3 py-1 text-xs font-semibold ${styles.badge}`}>
          {signal.qualityLevel.toUpperCase()}
        </span>
      </div>

      {/* Score */}
      <div className="mt-3">
        <div className="flex items-end justify-between">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Overall Score</span>
          <span className={`text-2xl font-bold ${styles.text}`}>{signal.overallScore}/100</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${scoreGradient(signal.overallScore)}`}
            style={{ width: `${signal.overallScore}%` }}
          />
        </div>
      </div>

      {/* Buy Reason */}
      {signal.buyReason && (
        <div className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-200 dark:bg-emerald-500/10">
          <span className="font-semibold">💡 Why Buy: </span>
          {signal.buyReason}
        </div>
      )}

      {/* Key Metrics */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricItem label="Price" value={formatCurrency(signal.currentPrice)} />
        <MetricItem label="Market Cap" value={formatCurrency(signal.marketCap)} />
        <MetricItem label="P/E Ratio" value={formatRatio(signal.peRatio)} />
        <MetricItem label="PEG Ratio" value={formatRatio(signal.pegRatio)} />
        {signal.targetUpsidePct !== null && signal.targetUpsidePct !== undefined && (
          <MetricItem
            label="Analyst Upside"
            value={formatPercent(signal.targetUpsidePct / 100)}
            highlight={signal.targetUpsidePct > 15}
          />
        )}
        <MetricItem label="Profit Margin" value={formatPercent(signal.profitMargin)} />
      </div>

      {/* Expandable Details */}
      <button
        type="button"
        onClick={onToggle}
        className="mt-4 flex w-full items-center justify-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
      >
        {expanded ? (
          <>
            <ChevronUp size={16} /> Hide Details
          </>
        ) : (
          <>
            <ChevronDown size={16} /> Show Details
          </>
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-200/50 pt-4 dark:border-white/5">
          {/* Component Scores */}
          <div>
            <h5 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Component Scores</h5>
            <div className="space-y-2">
              <ScoreBar label="Financial Health" score={signal.healthScore} />
              <ScoreBar label="Profitability" score={signal.profitabilityScore} />
              <ScoreBar label="Growth" score={signal.growthScore} />
              <ScoreBar label="Valuation" score={signal.valuationScore} />
              <ScoreBar label="Leverage" score={signal.leverageScore} />
            </div>
          </div>

          {/* Strengths */}
          {signal.strengths && signal.strengths.length > 0 && (
            <div>
              <h5 className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">✓ Strengths</h5>
              <ul className="space-y-1.5">
                {signal.strengths.map((strength, idx) => (
                  <li key={idx} className="text-xs text-slate-700 dark:text-slate-300">
                    • {strength}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weaknesses */}
          {signal.weaknesses && signal.weaknesses.length > 0 && (
            <div>
              <h5 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-300">⚠ Weaknesses</h5>
              <ul className="space-y-1.5">
                {signal.weaknesses.map((weakness, idx) => (
                  <li key={idx} className="text-xs text-slate-700 dark:text-slate-300">
                    • {weakness}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risk Factors */}
          {signal.riskFactors && signal.riskFactors.length > 0 && (
            <div>
              <h5 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">🚨 Risk Factors</h5>
              <ul className="space-y-1.5">
                {signal.riskFactors.map((risk, idx) => (
                  <li key={idx} className="text-xs text-slate-700 dark:text-slate-300">
                    • {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Detailed Metrics */}
          <div>
            <h5 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Detailed Metrics</h5>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <MetricDetail label="Revenue Growth" value={formatPercent(signal.revenueGrowth)} />
              <MetricDetail label="Earnings Growth" value={formatPercent(signal.earningsGrowth)} />
              <MetricDetail label="ROE" value={formatPercent(signal.roe)} />
              <MetricDetail label="Debt/Equity" value={formatRatio(signal.debtToEquity)} />
              <MetricDetail label="Current Ratio" value={formatRatio(signal.currentRatio)} />
              <MetricDetail label="Free Cash Flow" value={formatCurrency(signal.freeCashFlow)} />
              {signal.sector && <MetricDetail label="Sector" value={signal.sector} />}
              {signal.industry && <MetricDetail label="Industry" value={signal.industry} />}
            </div>
          </div>

          {/* Recommendation */}
          <div className="rounded-lg bg-slate-100/50 p-3 dark:bg-slate-800/50">
            <h5 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">Recommendation</h5>
            <p className="text-xs text-slate-600 dark:text-slate-400">{signal.recommendation}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
              Risk Level: <span className={`font-semibold ${signal.riskLevel === 'low' ? 'text-emerald-400' : signal.riskLevel === 'moderate' ? 'text-amber-400' : 'text-red-400'}`}>
                {signal.riskLevel.toUpperCase()}
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

interface MetricItemProps {
  label: string
  value: string
  highlight?: boolean
}

function MetricItem({ label, value, highlight }: MetricItemProps) {
  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-500">{label}</div>
      <div className={`text-sm font-semibold ${highlight ? 'text-emerald-400' : 'text-slate-900 dark:text-white'}`}>{value}</div>
    </div>
  )
}

interface MetricDetailProps {
  label: string
  value: string
}

function MetricDetail({ label, value }: MetricDetailProps) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500 dark:text-slate-500">{label}:</span>
      <span className="font-medium text-slate-700 dark:text-slate-300">{value}</span>
    </div>
  )
}

interface ScoreBarProps {
  label: string
  score: number | null | undefined
}

function ScoreBar({ label, score }: ScoreBarProps) {
  const pct = score !== null && score !== undefined ? score * 100 : 0
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : pct >= 30 ? 'bg-amber-500' : 'bg-slate-500'

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-600 dark:text-slate-400">{label}</span>
        <span className="font-medium text-slate-700 dark:text-slate-300">{score !== null && score !== undefined ? (score * 100).toFixed(0) : 'N/A'}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
