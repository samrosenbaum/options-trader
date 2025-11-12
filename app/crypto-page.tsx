'use client'

import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import AppShell from '@/components/app-shell'
import { TrendingUp, TrendingDown, Activity, Wallet, DollarSign, BarChart3, AlertCircle, RefreshCw, Flame, Brain, Target } from 'lucide-react'

interface AssetData {
  symbol: string
  current_price: number
  price_change_24h: number
  market_cap: number
  derivatives: {
    total_open_interest_usd: number
    open_interest_to_mcap_ratio: number
    avg_basis_percentage: number
    avg_funding_rate: number
    sentiment: {
      overall: string
      basis_interpretation: string
      funding_interpretation: string
    }
  }
  long_short: {
    estimated_long_short_ratio: number
    interpretation: string
    signal: string
  }
  institutional_signals: {
    signals: string[]
    confidence_score: number
    direction: string
    institutional_participation: string
  }
  short_activity?: {
    short_pressure_score: number
    pressure_level: string
    short_volume_ratio?: number | null
    total_short_leverage_usd?: number
    key_drivers: string[]
    risk_of_squeeze: string
    monty_view: {
      stance: string
      summary: string
      confidence: number
      supporting_metrics?: {
        funding_rate?: number
        basis?: number
        open_interest_ratio?: number
        open_interest_usd?: number
      }
    }
  }
}

interface AssetError {
  error: string
}

interface CryptoWhaleData {
  timestamp: string
  futures_analysis: {
    bitcoin: AssetData | AssetError | Record<string, never>
    ethereum: AssetData | AssetError | Record<string, never>
  }
  market_sentiment: {
    value: number
    classification: string
    interpretation: string
  }
  summary: {
    key_insights: string[]
    btc_institutional_direction: string
    eth_institutional_direction: string
    market_regime: string
  }
}

export default function CryptoPage({ user }: { user: User }) {
  const [data, setData] = useState<CryptoWhaleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchCryptoData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/crypto-whale-activity')
      const result = await response.json()

      if (result.success) {
        setData(result)
        setLastUpdate(new Date())
      } else {
        setError(result.error || 'Failed to fetch crypto data')
      }
    } catch (err) {
      setError('Network error')
      console.error('Error fetching crypto data:', err)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchCryptoData()
  }, [])

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchCryptoData()
  }

  const isValidAssetData = (data: AssetData | AssetError | Record<string, never>): data is AssetData => {
    if (!data || typeof data !== 'object') return false
    if ('error' in data) return false
    if (Object.keys(data).length === 0) return false
    return 'symbol' in data && 'current_price' in data && 'derivatives' in data
  }

  const formatCurrency = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) return 'N/A'
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`
    return `$${value.toFixed(2)}`
  }

  const formatPercent = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) return 'N/A'
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  const getSentimentColor = (sentiment: string): string => {
    if (sentiment.includes('bullish')) return 'text-emerald-600 dark:text-emerald-400'
    if (sentiment.includes('bearish')) return 'text-red-600 dark:text-red-400'
    return 'text-slate-600 dark:text-slate-400'
  }

  const getSentimentBgColor = (sentiment: string): string => {
    if (sentiment.includes('bullish')) return 'bg-emerald-500/10 border-emerald-500/20'
    if (sentiment.includes('bearish')) return 'bg-red-500/10 border-red-500/20'
    return 'bg-slate-500/10 border-slate-500/20'
  }

  const getPressureBadgeStyles = (level?: string) => {
    switch (level) {
      case 'extreme':
        return { label: 'Extreme Short Pressure', className: 'bg-red-500/15 text-red-600 dark:text-red-300 border border-red-500/20' }
      case 'elevated':
        return { label: 'Elevated Short Pressure', className: 'bg-orange-500/15 text-orange-600 dark:text-orange-300 border border-orange-500/20' }
      case 'watching':
        return { label: 'Building Pressure', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/20' }
      case 'muted':
        return { label: 'Muted Shorts', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20' }
      default:
        return { label: 'Short Pressure', className: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/20' }
    }
  }

  const getRiskBadgeStyles = (risk?: string) => {
    switch (risk) {
      case 'very_high':
        return { label: 'Short Squeeze Risk: Very High', className: 'bg-red-500/15 text-red-600 dark:text-red-300 border border-red-500/20' }
      case 'high':
        return { label: 'Short Squeeze Risk: High', className: 'bg-orange-500/15 text-orange-600 dark:text-orange-300 border border-orange-500/20' }
      case 'moderate':
        return { label: 'Short Squeeze Risk: Moderate', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/20' }
      case 'low':
        return { label: 'Short Squeeze Risk: Low', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20' }
      default:
        return { label: 'Short Squeeze Risk', className: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/20' }
    }
  }

  const getStanceStyles = (stance?: string) => {
    switch (stance) {
      case 'buy':
        return { label: 'Monty leans BUY', className: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' }
      case 'sell':
        return { label: 'Monty leans SELL', className: 'bg-red-500/20 text-red-700 dark:text-red-300' }
      default:
        return { label: 'Monty says HOLD', className: 'bg-blue-500/20 text-blue-700 dark:text-blue-300' }
    }
  }

  const formatRatio = (value?: number | null): string => {
    if (value === undefined || value === null || isNaN(value)) return 'N/A'
    return `${value.toFixed(1)}x`
  }

  const renderErrorCard = (asset: 'bitcoin' | 'ethereum', errorMsg?: string) => {
    return (
      <div className="rounded-2xl border border-red-200/50 bg-red-50/50 p-6 shadow-lg backdrop-blur-sm dark:border-red-800/50 dark:bg-red-900/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-6 w-6 flex-shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              {asset === 'bitcoin' ? 'Bitcoin' : 'Ethereum'} Data Unavailable
            </h3>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              {errorMsg || 'Failed to load data for this asset. This may be due to API rate limits or temporary service issues.'}
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Try refreshing the page or check back later.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const renderAssetCard = (
    asset: 'bitcoin' | 'ethereum',
    assetData: AssetData
  ) => {
    const isPositive = (assetData.price_change_24h ?? 0) >= 0

    return (
      <div className="rounded-2xl border border-white/20 bg-white/50 p-6 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/50">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
              {assetData.symbol}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {asset === 'bitcoin' ? 'Bitcoin' : 'Ethereum'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(assetData.current_price)}
            </div>
            <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {formatPercent(assetData.price_change_24h)}
            </div>
          </div>
        </div>

        {/* Derivatives Metrics */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200/50 bg-slate-50/50 p-3 dark:border-slate-700/50 dark:bg-slate-800/50">
            <div className="text-xs text-slate-600 dark:text-slate-400">Open Interest</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              {formatCurrency(assetData.derivatives?.total_open_interest_usd)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              {assetData.derivatives?.open_interest_to_mcap_ratio != null
                ? `${assetData.derivatives.open_interest_to_mcap_ratio.toFixed(1)}% of market cap`
                : 'N/A'}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200/50 bg-slate-50/50 p-3 dark:border-slate-700/50 dark:bg-slate-800/50">
            <div className="text-xs text-slate-600 dark:text-slate-400">Funding Rate</div>
            <div className={`mt-1 text-lg font-semibold ${(assetData.derivatives?.avg_funding_rate ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {assetData.derivatives?.avg_funding_rate != null ? (assetData.derivatives.avg_funding_rate * 100).toFixed(4) : 'N/A'}%
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              {(assetData.derivatives?.avg_funding_rate ?? 0) > 0 ? 'Longs paying shorts' : 'Shorts paying longs'}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200/50 bg-slate-50/50 p-3 dark:border-slate-700/50 dark:bg-slate-800/50">
            <div className="text-xs text-slate-600 dark:text-slate-400">Basis</div>
            <div className={`mt-1 text-lg font-semibold ${(assetData.derivatives?.avg_basis_percentage ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {assetData.derivatives?.avg_basis_percentage != null ? assetData.derivatives.avg_basis_percentage.toFixed(2) : 'N/A'}%
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              Futures vs spot premium
            </div>
          </div>

          <div className="rounded-lg border border-slate-200/50 bg-slate-50/50 p-3 dark:border-slate-700/50 dark:bg-slate-800/50">
            <div className="text-xs text-slate-600 dark:text-slate-400">Long/Short Ratio</div>
            <div className={`mt-1 text-lg font-semibold ${assetData.long_short?.signal === 'bullish' ? 'text-emerald-600' : assetData.long_short?.signal === 'bearish' ? 'text-red-600' : 'text-slate-600'}`}>
              {assetData.long_short?.estimated_long_short_ratio != null ? assetData.long_short.estimated_long_short_ratio.toFixed(2) : 'N/A'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              {assetData.long_short?.interpretation ?? 'N/A'}
            </div>
          </div>
        </div>

        {/* Derivatives Sentiment */}
        {assetData.derivatives?.sentiment && (
          <div className={`mb-6 rounded-lg border p-4 ${getSentimentBgColor(assetData.derivatives.sentiment.overall ?? 'neutral')}`}>
            <div className="mb-2 flex items-center gap-2">
              <Activity className={`h-5 w-5 ${getSentimentColor(assetData.derivatives.sentiment.overall ?? 'neutral')}`} />
              <h4 className="font-semibold text-slate-900 dark:text-white">
                Market Sentiment: <span className={getSentimentColor(assetData.derivatives.sentiment.overall ?? 'neutral')}>
                  {(assetData.derivatives.sentiment.overall ?? 'neutral').replace('_', ' ').toUpperCase()}
                </span>
              </h4>
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-slate-700 dark:text-slate-300">
                {assetData.derivatives.sentiment.basis_interpretation ?? 'N/A'}
              </p>
              <p className="text-slate-700 dark:text-slate-300">
                {assetData.derivatives.sentiment.funding_interpretation ?? 'N/A'}
              </p>
            </div>
          </div>
        )}

        {/* Institutional Signals */}
        {assetData.institutional_signals && (
          <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 p-4 dark:border-blue-700/50 dark:bg-blue-900/20">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h4 className="font-semibold text-slate-900 dark:text-white">Institutional Activity</h4>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  assetData.institutional_signals.direction === 'bullish'
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : assetData.institutional_signals.direction === 'bearish'
                    ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                    : 'bg-slate-500/20 text-slate-700 dark:text-slate-300'
                }`}>
                  {(assetData.institutional_signals.direction ?? 'neutral').toUpperCase()}
                </span>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {assetData.institutional_signals.confidence_score ?? 0}% confidence
                </span>
              </div>
            </div>
            <div className="mb-2 flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Participation: {(assetData.institutional_signals.institutional_participation ?? 'unknown').toUpperCase()}
              </span>
            </div>
            <div className="space-y-2">
              {(assetData.institutional_signals.signals ?? []).map((signal, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                  <span>{signal}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Short Pressure & Monty's Guidance */}
        {assetData.short_activity && (() => {
          const shortActivity = assetData.short_activity
          const pressureBadge = getPressureBadgeStyles(shortActivity?.pressure_level)
          const squeezeBadge = getRiskBadgeStyles(shortActivity?.risk_of_squeeze)
          const stanceStyles = getStanceStyles(shortActivity?.monty_view?.stance)

          return (
            <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/40 p-5 dark:border-emerald-800/60 dark:bg-emerald-950/20">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white">Short Pressure Monitor</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Where leveraged shorts are leaning and how Monty translates it</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Short Pressure Score</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{shortActivity?.short_pressure_score ?? 0}/100</div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${pressureBadge.className}`}>
                    {pressureBadge.label}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${squeezeBadge.className}`}>
                    {squeezeBadge.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/40 bg-white/60 p-3 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900/40">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Derivatives vs Spot</p>
                    <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{formatRatio(shortActivity?.short_volume_ratio)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Estimated Short Leverage</p>
                    <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                      {shortActivity?.total_short_leverage_usd
                        ? formatCurrency(shortActivity.total_short_leverage_usd)
                        : 'N/A'}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Key Drivers</p>
                  <div className="mt-2 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                    {(shortActivity?.key_drivers ?? ['Short positioning insights unavailable.']).map((driver, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                        <span>{driver}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex h-full flex-col justify-between rounded-lg border border-emerald-200/60 bg-emerald-500/10 p-4 shadow-inner dark:border-emerald-800/60 dark:bg-emerald-900/20">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <Brain className="h-5 w-5" />
                  <span className="text-sm font-semibold">Monty's Read</span>
                </div>
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                  {shortActivity?.monty_view?.summary ?? 'Monty: Short pressure data unavailable.'}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${stanceStyles.className}`}>
                    <Target className="h-3.5 w-3.5" />
                    {stanceStyles.label}
                  </span>
                  <span className="rounded-full border border-emerald-500/30 px-3 py-1 font-medium text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300">
                    Confidence {shortActivity?.monty_view?.confidence ?? 0}%
                  </span>
                </div>

                {shortActivity?.monty_view?.supporting_metrics && (
                  <div className="mt-4 grid grid-cols-2 gap-3 rounded-md border border-white/30 bg-white/50 p-3 text-xs shadow-sm dark:border-white/10 dark:bg-slate-900/40">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Funding</p>
                      <p className={`mt-1 font-semibold ${((shortActivity?.monty_view?.supporting_metrics?.funding_rate ?? 0) < 0) ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                        {shortActivity?.monty_view?.supporting_metrics?.funding_rate !== undefined
                          ? `${((shortActivity?.monty_view?.supporting_metrics?.funding_rate ?? 0) * 100).toFixed(3)}%`
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Basis</p>
                      <p className={`mt-1 font-semibold ${(shortActivity?.monty_view?.supporting_metrics?.basis ?? 0) < 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                        {shortActivity?.monty_view?.supporting_metrics?.basis !== undefined
                          ? `${(shortActivity?.monty_view?.supporting_metrics?.basis ?? 0).toFixed(2)}%`
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">OI / Market Cap</p>
                      <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
                        {shortActivity?.monty_view?.supporting_metrics?.open_interest_ratio !== undefined
                          ? `${(shortActivity?.monty_view?.supporting_metrics?.open_interest_ratio ?? 0).toFixed(1)}%`
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Open Interest</p>
                      <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
                        {shortActivity?.monty_view?.supporting_metrics?.open_interest_usd
                          ? formatCurrency(shortActivity.monty_view.supporting_metrics.open_interest_usd)
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          )
        })()}
      </div>
    )
  }

  return (
    <AppShell
      userEmail={user.email}
      mainClassName="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-emerald-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
                Crypto Alpha
              </h1>
              <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">
                Bitcoin & Ethereum institutional flows, futures positioning, and whale activity
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          {lastUpdate && (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <RefreshCw className="mx-auto h-12 w-12 animate-spin text-emerald-500" />
              <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
                Loading crypto analysis...
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Error loading data: {error}</span>
            </div>
          </div>
        )}

        {/* Main Content */}
        {!loading && !error && data && (
          <div className="space-y-8">
            {/* Market Sentiment Banner */}
            {data.market_sentiment && (
              <div className={`rounded-2xl border p-6 ${
                data.market_sentiment.value >= 75 ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20' :
                data.market_sentiment.value >= 55 ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20' :
                data.market_sentiment.value >= 45 ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50' :
                data.market_sentiment.value >= 25 ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20' :
                'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      Crypto Fear & Greed Index
                    </h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {data.market_sentiment.interpretation}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-bold text-slate-900 dark:text-white">
                      {data.market_sentiment.value}
                    </div>
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      {data.market_sentiment.classification}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Key Insights */}
            {data.summary && data.summary.key_insights && data.summary.key_insights.length > 0 && (
              <div className="rounded-2xl border border-white/20 bg-white/50 p-6 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/50">
                <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
                  <DollarSign className="h-6 w-6 text-emerald-500" />
                  Key Insights
                </h3>
                <div className="space-y-2">
                  {data.summary.key_insights.map((insight, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
                      <p className="text-slate-700 dark:text-slate-300">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bitcoin & Ethereum Cards */}
            <div className="grid gap-8 lg:grid-cols-2">
              {/* Bitcoin Card */}
              {isValidAssetData(data.futures_analysis.bitcoin)
                ? renderAssetCard('bitcoin', data.futures_analysis.bitcoin)
                : 'error' in data.futures_analysis.bitcoin
                  ? renderErrorCard('bitcoin', data.futures_analysis.bitcoin.error)
                  : renderErrorCard('bitcoin')
              }

              {/* Ethereum Card */}
              {isValidAssetData(data.futures_analysis.ethereum)
                ? renderAssetCard('ethereum', data.futures_analysis.ethereum)
                : 'error' in data.futures_analysis.ethereum
                  ? renderErrorCard('ethereum', data.futures_analysis.ethereum.error)
                  : renderErrorCard('ethereum')
              }
            </div>

            {/* Whale Activity Note */}
            <div className="rounded-2xl border border-blue-200/50 bg-blue-50/50 p-6 dark:border-blue-700/50 dark:bg-blue-900/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  <p className="font-semibold">Whale Transaction Monitoring</p>
                  <p className="mt-1">
                    Enhanced whale tracking (large transactions, exchange flows, wallet movements) requires integration with premium data providers like Whale Alert API.
                    Current implementation focuses on derivatives positioning and institutional signals from publicly available on-chain and exchange data.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
