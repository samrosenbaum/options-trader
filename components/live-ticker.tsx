'use client'

import { useEffect, useMemo, useState } from 'react'

interface ApiQuote {
  symbol: string
  price?: number
  change?: number
  changePercent?: number
  volume?: number
  marketCap?: number
}

interface SymbolMetadata {
  symbol: string
  displaySymbol: string
  name: string
  type: 'stock' | 'crypto'
}

interface TickerData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume?: number
  marketCap?: number
  type: 'stock' | 'crypto'
  sourceSymbol: string
}

const WATCHED_SYMBOLS: SymbolMetadata[] = [
  { symbol: 'SPY', displaySymbol: 'SPY', name: 'S&P 500 ETF', type: 'stock' },
  { symbol: 'QQQ', displaySymbol: 'QQQ', name: 'NASDAQ 100 ETF', type: 'stock' },
  { symbol: 'NVDA', displaySymbol: 'NVDA', name: 'NVIDIA', type: 'stock' },
  { symbol: 'TSLA', displaySymbol: 'TSLA', name: 'Tesla', type: 'stock' },
  { symbol: 'AAPL', displaySymbol: 'AAPL', name: 'Apple', type: 'stock' },
  { symbol: 'BTC-USD', displaySymbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
  { symbol: 'ETH-USD', displaySymbol: 'ETH', name: 'Ethereum', type: 'crypto' },
  { symbol: 'SOL-USD', displaySymbol: 'SOL', name: 'Solana', type: 'crypto' },
]

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

function formatCompactNumber(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined
  }
  return COMPACT_NUMBER_FORMATTER.format(value)
}

export default function LiveTicker() {
  const [tickerData, setTickerData] = useState<TickerData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const symbolMap = useMemo(() => {
    return new Map(WATCHED_SYMBOLS.map((meta) => [meta.symbol, meta]))
  }, [])

  useEffect(() => {
    let isMounted = true

    const fetchQuotes = async () => {
      const params = new URLSearchParams({
        symbols: WATCHED_SYMBOLS.map((item) => item.symbol).join(','),
      })

      try {
        const response = await fetch(`/api/quotes-python?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Quote request failed with status ${response.status}`)
        }

        const payload = (await response.json()) as {
          success?: boolean
          quotes?: ApiQuote[]
          error?: string
        }

        if (payload.success === false) {
          throw new Error(payload.error || 'Quote service returned an error')
        }

        const quotes = Array.isArray(payload.quotes) ? payload.quotes : []
        const mappedQuotes = quotes.map((quote) => {
          const meta = symbolMap.get(quote.symbol)
          const displaySymbol = meta?.displaySymbol ?? quote.symbol.replace(/-USD$/i, '')
          const name = meta?.name ?? quote.symbol
          const type = meta?.type ?? (quote.symbol.endsWith('-USD') ? 'crypto' : 'stock')

          return {
            symbol: displaySymbol,
            name,
            price: Number.isFinite(quote.price ?? NaN) ? Number(quote.price) : 0,
            change: Number.isFinite(quote.change ?? NaN) ? Number(quote.change) : 0,
            changePercent: Number.isFinite(quote.changePercent ?? NaN) ? Number(quote.changePercent) : 0,
            volume: Number.isFinite(quote.volume ?? NaN) ? Number(quote.volume) : undefined,
            marketCap: Number.isFinite(quote.marketCap ?? NaN) ? Number(quote.marketCap) : undefined,
            type,
            sourceSymbol: quote.symbol,
          } satisfies TickerData
        })

        const mappedBySymbol = new Map(mappedQuotes.map((item) => [item.sourceSymbol, item]))
        const orderedResults: TickerData[] = []

        for (const meta of WATCHED_SYMBOLS) {
          const entry = mappedBySymbol.get(meta.symbol)
          if (entry) {
            orderedResults.push(entry)
            mappedBySymbol.delete(meta.symbol)
          }
        }

        for (const leftover of mappedBySymbol.values()) {
          orderedResults.push(leftover)
        }

        if (isMounted) {
          setTickerData(orderedResults)
          setLastUpdated(new Date())
          setError(null)
        }
      } catch (err) {
        if (!isMounted) return
        const message = err instanceof Error ? err.message : 'Unknown error fetching quotes'
        setError(message)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchQuotes()
    const interval = setInterval(fetchQuotes, 30000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [symbolMap])

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl mb-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
          <span className="ml-2 text-emerald-100/70">Loading live quotes…</span>
        </div>
      </div>
    )
  }

  if (!tickerData.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl mb-6">
        <div className="text-sm text-emerald-100/70">
          {error ? `Unable to load live quotes: ${error}` : 'No live quotes available.'}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg dark:border-white/10 dark:bg-white/5 dark:shadow-[0_30px_120px_-60px_rgba(16,185,129,0.45)] dark:backdrop-blur-xl mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="animate-pulse">📈</span>
          Live Market Ticker
        </h3>
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-emerald-100/70">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span>Live</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200 backdrop-blur-sm">
          Data refresh issue: {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="flex space-x-6 min-w-max">
          {tickerData.map((item) => {
            const volumeLabel = formatCompactNumber(item.volume)
            const marketCapLabel = formatCompactNumber(item.marketCap)

            return (
              <div
                key={item.sourceSymbol}
                className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-200 min-w-[200px] hover:bg-slate-100 hover:shadow-lg transition-all dark:bg-white/10 dark:backdrop-blur-sm dark:border-white/20 dark:hover:bg-white/15 dark:hover:shadow-emerald-500/20"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${item.type === 'crypto' ? 'text-orange-500 dark:text-orange-300' : 'text-sky-500 dark:text-sky-300'}`}>
                      {item.type === 'crypto' ? '₿' : '📊'}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{item.symbol}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 truncate">{item.name}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <div className="font-bold text-slate-900 dark:text-white">${item.price.toLocaleString()}</div>
                  <div
                    className={`text-sm font-semibold ${
                      item.change >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'
                    }`}
                  >
                    {item.change >= 0 ? '+' : ''}
                    {item.change.toFixed(2)} ({item.changePercent >= 0 ? '+' : ''}
                    {item.changePercent.toFixed(2)}%)
                  </div>
                  {volumeLabel && (
                    <div className="text-xs text-slate-500 dark:text-slate-300">Vol: {volumeLabel}</div>
                  )}
                  {marketCapLabel && (
                    <div className="text-xs text-slate-500 dark:text-slate-300">MC: {marketCapLabel}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-slate-600 dark:text-slate-200">Market Open</span>
          </div>
          <div className="text-slate-500 dark:text-slate-300">
            Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-300">📊 Stocks</span>
          <span className="text-xs text-slate-500 dark:text-slate-300">₿ Crypto</span>
        </div>
      </div>
    </div>
  )
}
