'use client'

import { useEffect, useState } from 'react'

interface WSBTicker {
  ticker: string
  mentions: number
  sentiment: string
  posts: string[]
}

export function WSBTrending() {
  const [tickers, setTickers] = useState<WSBTicker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchWSB = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/wsb-trending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topN: 10 }),
        })

        const data = await response.json()

        if (data.success) {
          setTickers(data.trending || [])
        } else {
          setError(data.error || 'Failed to fetch WSB data')
        }
      } catch (err) {
        setError('Network error')
        console.error('Error fetching WSB data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchWSB()
    // Refresh every 10 minutes
    const interval = setInterval(fetchWSB, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const getSentimentColor = (sentiment: string) => {
    if (sentiment === 'Bullish') return 'text-emerald-400'
    if (sentiment === 'Bearish') return 'text-red-400'
    return 'text-slate-400'
  }

  const getSentimentBg = (sentiment: string) => {
    if (sentiment === 'Bullish') return 'bg-emerald-500/10 border-emerald-500/20'
    if (sentiment === 'Bearish') return 'bg-red-500/10 border-red-500/20'
    return 'bg-slate-500/10 border-slate-500/20'
  }

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm rounded-2xl border border-emerald-500/20 p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">
          r/WallStreetBets Trending
        </h2>
        <span className="text-xs text-slate-400">Last 100 hot posts</span>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-slate-400">Loading trending tickers...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && tickers.length === 0 && (
        <p className="text-center py-8 text-slate-400">No trending tickers found</p>
      )}

      {!loading && !error && tickers.length > 0 && (
        <div className="space-y-2">
          {tickers.map((ticker, idx) => (
            <div
              key={ticker.ticker}
              className={`flex items-center justify-between p-3 rounded-lg border ${getSentimentBg(ticker.sentiment)} transition-colors hover:bg-slate-800/40`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-slate-800/60 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-emerald-400">#{idx + 1}</span>
                </div>
                <div>
                  <div className="font-semibold text-white">${ticker.ticker}</div>
                  <div className="text-xs text-slate-400">{ticker.mentions} mentions</div>
                </div>
              </div>
              <div className={`text-sm font-medium ${getSentimentColor(ticker.sentiment)}`}>
                {ticker.sentiment}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-slate-700/50">
        <p className="text-xs text-slate-500">
          Data from r/WallStreetBets hot posts. Use for sentiment gauge only - not financial advice.
        </p>
      </div>
    </div>
  )
}
