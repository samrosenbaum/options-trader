'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface TickerData {
  symbol: string
  price: number
  change: number
  changePercent: number
}

export function TickerTape() {
  const [tickers, setTickers] = useState<TickerData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTickers = async () => {
      try {
        // Fetch major indices and popular stocks
        const symbols = [
          'SPY', 'QQQ', 'DIA', 'IWM', // Indices
          'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', // Tech
          'JPM', 'BAC', 'GS', 'WFC', // Financials
          'XOM', 'CVX', // Energy
          'BTC-USD', 'ETH-USD', // Crypto
        ]

        const response = await fetch(`/api/quotes-python?symbols=${symbols.join(',')}`)
        const data = await response.json()

        if (data.success && data.quotes) {
          const tickerData: TickerData[] = data.quotes.map((quote: {
            symbol: string
            price?: number
            change?: number
            changePercent?: number
          }) => ({
            symbol: quote.symbol.replace('-USD', ''),
            price: quote.price || 0,
            change: quote.change || 0,
            changePercent: quote.changePercent || 0,
          }))
          setTickers(tickerData)
        }
      } catch (err) {
        console.error('Error fetching ticker data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTickers()
    // Refresh every 30 seconds
    const interval = setInterval(fetchTickers, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading || tickers.length === 0) {
    return null
  }

  // Duplicate tickers for seamless loop
  const duplicatedTickers = [...tickers, ...tickers, ...tickers]

  return (
    <div className="relative w-full overflow-hidden bg-slate-950 border-b border-emerald-500/20">
      <div className="flex animate-ticker">
        {duplicatedTickers.map((ticker, idx) => (
          <div
            key={`${ticker.symbol}-${idx}`}
            className="flex items-center gap-2 px-6 py-2 whitespace-nowrap"
          >
            <span className="text-sm font-semibold text-white">
              {ticker.symbol}
            </span>
            <span className="text-sm text-slate-300">
              ${ticker.price.toFixed(2)}
            </span>
            <span
              className={`flex items-center gap-1 text-xs font-medium ${
                ticker.change >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {ticker.change >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {ticker.change >= 0 ? '+' : ''}
              {ticker.changePercent.toFixed(2)}%
            </span>
            <div className="w-px h-4 bg-slate-700 ml-2" />
          </div>
        ))}
      </div>

      {/* Add CSS animation */}
      <style jsx>{`
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }

        .animate-ticker {
          animation: ticker 60s linear infinite;
        }

        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  )
}
