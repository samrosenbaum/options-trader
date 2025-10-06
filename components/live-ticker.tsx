'use client'

import { useState, useEffect } from 'react'
import { Card } from './ui/card'

interface TickerData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume?: string
  marketCap?: string
  type: 'stock' | 'crypto'
}

export default function LiveTicker() {
  const [tickerData, setTickerData] = useState<TickerData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Initialize with sample data
    const sampleData: TickerData[] = [
      { symbol: 'SPY', name: 'S&P 500 ETF', price: 425.67, change: 2.34, changePercent: 0.55, volume: '45.2M', type: 'stock' },
      { symbol: 'QQQ', name: 'NASDAQ ETF', price: 378.45, change: -1.23, changePercent: -0.32, volume: '32.1M', type: 'stock' },
      { symbol: 'BTC', name: 'Bitcoin', price: 67500.00, change: 1250.00, changePercent: 1.88, marketCap: '1.33T', type: 'crypto' },
      { symbol: 'ETH', name: 'Ethereum', price: 3850.00, change: -45.00, changePercent: -1.15, marketCap: '463B', type: 'crypto' },
      { symbol: 'NVDA', name: 'NVIDIA', price: 875.32, change: 12.45, changePercent: 1.44, volume: '28.5M', type: 'stock' },
      { symbol: 'TSLA', name: 'Tesla', price: 275.30, change: -8.20, changePercent: -2.89, volume: '67.8M', type: 'stock' },
      { symbol: 'SOL', name: 'Solana', price: 145.67, change: 3.45, changePercent: 2.43, marketCap: '68.2B', type: 'crypto' },
      { symbol: 'AAPL', name: 'Apple', price: 218.50, change: 1.85, changePercent: 0.85, volume: '52.3M', type: 'stock' },
    ]

    setTickerData(sampleData)
    setIsLoading(false)

    // Simulate real-time updates every 2 seconds
    const interval = setInterval(() => {
      setTickerData(prevData => 
        prevData.map(item => {
          // Simulate small price movements
          const randomChange = (Math.random() - 0.5) * item.price * 0.02 // ±1% max change
          const newPrice = item.price + randomChange
          const change = newPrice - item.price
          const changePercent = (change / item.price) * 100

          return {
            ...item,
            price: Math.round(newPrice * 100) / 100,
            change: Math.round(change * 100) / 100,
            changePercent: Math.round(changePercent * 100) / 100
          }
        })
      )
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  if (isLoading) {
    return (
      <Card className="p-4 mb-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-slate-600 dark:text-slate-400">Loading ticker...</span>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4 mb-6 bg-gradient-to-r from-slate-50 to-emerald-50 dark:from-slate-900 dark:to-emerald-900 border-emerald-200 dark:border-emerald-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="animate-pulse">📈</span>
          Live Market Ticker
        </h3>
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Live</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex space-x-6 min-w-max">
          {tickerData.map((item, index) => (
            <div
              key={item.symbol}
              className="flex items-center space-x-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 min-w-[200px] hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${item.type === 'crypto' ? 'text-orange-500' : 'text-blue-500'}`}>
                    {item.type === 'crypto' ? '₿' : '📊'}
                  </span>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {item.symbol}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {item.name}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col items-end">
                <div className="font-bold text-slate-900 dark:text-white">
                  ${item.price.toLocaleString()}
                </div>
                <div className={`text-sm font-medium ${
                  item.change >= 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)} ({item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%)
                </div>
                {item.volume && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Vol: {item.volume}
                  </div>
                )}
                {item.marketCap && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    MC: {item.marketCap}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Market Status */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-slate-600 dark:text-slate-400">Market Open</span>
          </div>
          <div className="text-slate-600 dark:text-slate-400">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">📊 Stocks</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">₿ Crypto</span>
        </div>
      </div>
    </Card>
  )
}
