'use client'

import { useState, useEffect } from 'react'
import { Card } from './ui/card'

interface ScanProgressProps {
  isScanning: boolean
  scanType: 'options' | 'crypto'
}

interface SymbolStatus {
  symbol: string
  status: 'pending' | 'scanning' | 'success' | 'failed' | 'rate_limited'
  score?: number
  opportunities?: number
  error?: string
}

export default function ScanProgress({ isScanning, scanType }: ScanProgressProps) {
  const [symbols, setSymbols] = useState<SymbolStatus[]>([])
  const [currentSymbol, setCurrentSymbol] = useState<string>('')
  const [totalScanned, setTotalScanned] = useState(0)
  const [successfulScans, setSuccessfulScans] = useState(0)
  const [failedScans, setFailedScans] = useState(0)

  useEffect(() => {
    if (!isScanning) return

    // Initialize symbols based on scan type
    const initialSymbols: SymbolStatus[] = scanType === 'options' 
      ? [
          'AMD', 'NFLX', 'TSLA', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'HOOD',
          'SOFI', 'PLTR', 'COIN', 'MARA', 'RIOT', 'BITF', 'HUT', 'PYPL', 'SQ', 'ROKU',
          'GME', 'AMC', 'SPCE', 'LCID', 'RIVN', 'XPEV', 'NIO', 'WKHS', 'CLOV', 'AFRM'
        ].map(symbol => ({ symbol, status: 'pending' as const }))
      : [
          'bitcoin', 'ethereum', 'binancecoin', 'cardano', 'solana', 'polkadot', 
          'chainlink', 'avalanche-2', 'polygon', 'litecoin', 'bitcoin-cash', 'stellar',
          'monero', 'ethereum-classic', 'vechain', 'filecoin', 'tron', 'cosmos',
          'algorand', 'tezos', 'zcash', 'dash', 'decred', 'qtum', 'waves',
          'nano', 'icon', 'ontology', 'steem', 'siacoin'
        ].map(symbol => ({ symbol, status: 'pending' as const }))

    setSymbols(initialSymbols)
    setTotalScanned(0)
    setSuccessfulScans(0)
    setFailedScans(0)

    // Simulate scanning progress
    let currentIndex = 0
    const scanInterval = setInterval(() => {
      if (currentIndex >= initialSymbols.length) {
        clearInterval(scanInterval)
        return
      }

      const symbol = initialSymbols[currentIndex]
      setCurrentSymbol(symbol.symbol)

      // Update current symbol to scanning
      setSymbols(prev => prev.map(s => 
        s.symbol === symbol.symbol ? { ...s, status: 'scanning' } : s
      ))

      // Simulate scan duration (1-3 seconds)
      const scanDuration = Math.random() * 2000 + 1000
      
      setTimeout(() => {
        // Simulate success/failure (70% success rate)
        const isSuccess = Math.random() > 0.3
        const isRateLimited = !isSuccess && Math.random() > 0.5

        let newStatus: SymbolStatus['status'] = 'success'
        let score = 0
        let opportunities = 0
        let error = ''

        if (isRateLimited) {
          newStatus = 'rate_limited'
          error = 'Rate limited'
        } else if (!isSuccess) {
          newStatus = 'failed'
          error = 'No data available'
        } else {
          score = Math.floor(Math.random() * 40) + 60 // 60-100
          opportunities = Math.random() > 0.7 ? Math.floor(Math.random() * 5) + 1 : 0
        }

        setSymbols(prev => prev.map(s => 
          s.symbol === symbol.symbol 
            ? { ...s, status: newStatus, score, opportunities, error }
            : s
        ))

        setTotalScanned(prev => prev + 1)
        if (newStatus === 'success') {
          setSuccessfulScans(prev => prev + 1)
        } else {
          setFailedScans(prev => prev + 1)
        }

        currentIndex++
      }, scanDuration)

    }, 500) // Start new scan every 500ms

    return () => clearInterval(scanInterval)
  }, [isScanning, scanType])

  const getStatusIcon = (status: SymbolStatus['status']) => {
    switch (status) {
      case 'pending': return '⏳'
      case 'scanning': return '🔄'
      case 'success': return '✅'
      case 'failed': return '❌'
      case 'rate_limited': return '🚫'
      default: return '⏳'
    }
  }

  const getStatusColor = (status: SymbolStatus['status']) => {
    switch (status) {
      case 'pending': return 'text-gray-400'
      case 'scanning': return 'text-blue-500 animate-pulse'
      case 'success': return 'text-green-500'
      case 'failed': return 'text-red-500'
      case 'rate_limited': return 'text-yellow-500'
      default: return 'text-gray-400'
    }
  }

  if (!isScanning) return null

  return (
    <Card className="p-6 mb-6 bg-gradient-to-r from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-900 border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {scanType === 'options' ? 'Options Scan Progress' : 'Crypto Scan Progress'}
        </h3>
        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
          <span>✅ {successfulScans}</span>
          <span>❌ {failedScans}</span>
          <span>📊 {totalScanned}/{symbols.length}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-4">
        <div 
          className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${(totalScanned / symbols.length) * 100}%` }}
        />
      </div>

      {/* Current Symbol */}
      {currentSymbol && (
        <div className="mb-4 p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="animate-spin">🔄</span>
            <span className="font-medium text-blue-900 dark:text-blue-100">
              Scanning {currentSymbol.toUpperCase()}...
            </span>
          </div>
        </div>
      )}

      {/* Symbol Grid */}
      <div className="grid grid-cols-6 md:grid-cols-10 gap-2 max-h-48 overflow-y-auto">
        {symbols.map((symbol) => (
          <div
            key={symbol.symbol}
            className={`flex flex-col items-center p-2 rounded-lg border text-xs transition-all duration-300 ${
              symbol.status === 'scanning' 
                ? 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700' 
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className={`text-lg ${getStatusColor(symbol.status)}`}>
              {getStatusIcon(symbol.status)}
            </div>
            <div className="text-center">
              <div className="font-medium text-slate-900 dark:text-white truncate">
                {symbol.symbol.length > 6 ? symbol.symbol.substring(0, 6) : symbol.symbol}
              </div>
              {symbol.score && (
                <div className="text-green-600 dark:text-green-400 font-semibold">
                  {symbol.score}
                </div>
              )}
              {symbol.opportunities && symbol.opportunities > 0 && (
                <div className="text-blue-600 dark:text-blue-400">
                  {symbol.opportunities} opps
                </div>
              )}
              {symbol.error && (
                <div className="text-red-500 text-xs truncate">
                  {symbol.error}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {successfulScans}
          </div>
          <div className="text-sm text-green-700 dark:text-green-300">Successful</div>
        </div>
        <div className="p-3 bg-red-100 dark:bg-red-900 rounded-lg">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {failedScans}
          </div>
          <div className="text-sm text-red-700 dark:text-red-300">Failed</div>
        </div>
        <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {Math.round((totalScanned / symbols.length) * 100)}%
          </div>
          <div className="text-sm text-blue-700 dark:text-blue-300">Complete</div>
        </div>
      </div>
    </Card>
  )
}
