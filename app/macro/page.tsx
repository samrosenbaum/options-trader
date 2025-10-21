'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/navigation'

interface MacroData {
  indices: Record<string, {
    name: string
    price: number
    change: number
    change_pct: number
    high_52w: number
    low_52w: number
  }>
  treasuries: Record<string, {
    yield: number
    change: number
  }>
  commodities: Record<string, {
    price: number
    change: number
    change_pct: number
  }>
  sentiment: {
    vix: number
    vix_avg_30d: number
    sentiment: string
    description: string
  }
  timestamp: string
}

export default function MacroPage() {
  const [data, setData] = useState<MacroData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchMacroData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/macro')
      const result = await response.json()

      if (result.success) {
        setData(result.data)
        setLastUpdate(new Date())
      } else {
        setError(result.error || 'Failed to fetch data')
      }
    } catch (err) {
      setError('Network error')
      console.error('Error fetching macro data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMacroData()
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchMacroData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const formatNumber = (num: number, decimals: number = 2) => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  }

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-emerald-600 dark:text-emerald-400'
    if (change < 0) return 'text-red-600 dark:text-red-400'
    return 'text-slate-600 dark:text-slate-400'
  }

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'Complacent':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
      case 'Normal':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
      case 'Elevated':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
      case 'Fearful':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
              Macro Indicators
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Real-time economic data and market sentiment
            </p>
          </div>
          <div className="text-right">
            <button
              onClick={fetchMacroData}
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            {lastUpdate && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}

        {loading && !data && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
            <p className="mt-4 text-slate-600 dark:text-slate-400">Loading macro data...</p>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Market Sentiment Card */}
            {data.sentiment && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                  Market Sentiment
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600 dark:text-slate-400">VIX (Volatility Index)</span>
                      <span className="text-2xl font-bold text-slate-900 dark:text-white">
                        {formatNumber(data.sentiment.vix, 2)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      30-day avg: {formatNumber(data.sentiment.vix_avg_30d, 2)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getSentimentColor(data.sentiment.sentiment)}`}>
                        {data.sentiment.sentiment}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                        {data.sentiment.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Major Indices */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                Major Indices
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(data.indices).map(([symbol, index]) => (
                  <div key={symbol} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                      {index.name}
                    </div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                      {formatNumber(index.price, 2)}
                    </div>
                    <div className={`text-sm font-medium ${getChangeColor(index.change)}`}>
                      {index.change > 0 ? '+' : ''}
                      {formatNumber(index.change, 2)} ({index.change_pct > 0 ? '+' : ''}
                      {formatNumber(index.change_pct, 2)}%)
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      52w: {formatNumber(index.low_52w, 0)} - {formatNumber(index.high_52w, 0)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Treasury Yields */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                US Treasury Yields
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(data.treasuries).map(([name, treasury]) => (
                  <div key={name} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                      {name}
                    </div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                      {formatNumber(treasury.yield, 2)}%
                    </div>
                    <div className={`text-sm font-medium ${getChangeColor(treasury.change)}`}>
                      {treasury.change > 0 ? '+' : ''}
                      {formatNumber(treasury.change, 3)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  <strong>Yield Curve Insight:</strong> Compare short-term (3-Month) vs long-term (10-Year) yields.
                  Inverted curve (short &gt; long) historically signals recession.
                </p>
              </div>
            </div>

            {/* Commodities */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                Key Commodities
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(data.commodities).map(([name, commodity]) => (
                  <div key={name} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                      {name}
                    </div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                      ${formatNumber(commodity.price, 2)}
                    </div>
                    <div className={`text-sm font-medium ${getChangeColor(commodity.change)}`}>
                      {commodity.change > 0 ? '+' : ''}
                      {formatNumber(commodity.change, 2)} ({commodity.change_pct > 0 ? '+' : ''}
                      {formatNumber(commodity.change_pct, 2)}%)
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <strong>Trading Tip:</strong> Gold often rises during market uncertainty. Oil impacts inflation.
                  Bitcoin can indicate risk appetite in markets.
                </p>
              </div>
            </div>

            {/* Market Insights */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-2xl shadow-lg p-6 border border-emerald-200 dark:border-emerald-800">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                How This Impacts Your Options Trading
              </h2>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">VIX &gt; 20: Higher Premiums</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Elevated volatility = higher option prices. Great for sellers, expensive for buyers.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">Rising Yields: Tech Pressure</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Higher treasury yields often pressure growth stocks and tech. Watch your portfolio delta.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">Dollar Strength: International Impact</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Strong dollar can hurt multinational companies. Consider hedging with commodities.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
