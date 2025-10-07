'use client'

import { useState, useEffect } from 'react'
import { Card } from './ui/card'

interface RealTimeProgressProps {
  isScanning: boolean
  scanType: 'options' | 'crypto'
  onScanComplete?: (results: ScanUpdate[]) => void
}

interface ScanUpdate {
  symbol: string
  status: 'scanning' | 'success' | 'failed' | 'rate_limited'
  score?: number
  opportunities?: number
  error?: string
  timestamp: string
}

export default function RealTimeProgress({ isScanning, scanType, onScanComplete }: RealTimeProgressProps) {
  const [scanUpdates, setScanUpdates] = useState<ScanUpdate[]>([])
  const [currentSymbol, setCurrentSymbol] = useState<string>('')
  const [isConnected, setIsConnected] = useState(false)
  const [totalProcessed, setTotalProcessed] = useState(0)
  const [successfulScans, setSuccessfulScans] = useState(0)
  const [failedScans, setFailedScans] = useState(0)

  useEffect(() => {
    if (!isScanning) {
      setScanUpdates([])
      setCurrentSymbol('')
      setTotalProcessed(0)
      setSuccessfulScans(0)
      setFailedScans(0)
      return
    }

    // Simulate WebSocket connection
    setIsConnected(true)
    
    // Simulate real-time scanning updates
      const symbols = scanType === 'options'
        ? ['AMD', 'NFLX', 'TSLA', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'HOOD', 'SOFI', 'PLTR', 'COIN', 'MARA', 'RIOT', 'BITF', 'HUT', 'PYPL', 'SQ', 'ROKU', 'GME', 'AMC', 'SPCE', 'LCID', 'RIVN', 'XPEV', 'NIO', 'WKHS', 'CLOV', 'AFRM']
        : ['bitcoin', 'ethereum', 'binancecoin', 'cardano', 'solana', 'polkadot', 'chainlink', 'avalanche-2', 'polygon', 'litecoin', 'bitcoin-cash', 'stellar', 'monero', 'ethereum-classic', 'vechain', 'filecoin', 'tron', 'cosmos', 'algorand', 'tezos', 'zcash', 'dash', 'decred', 'qtum', 'waves', 'nano', 'icon', 'ontology', 'steem', 'siacoin']

      let currentIndex = 0
      const scanInterval = setInterval(() => {
        if (currentIndex >= symbols.length) {
          clearInterval(scanInterval)
          setIsConnected(false)
          // Simulate final results using the latest updates snapshot
          setScanUpdates(prev => {
            const results = prev.filter(update => update.status === 'success')
            onScanComplete?.(results)
            return prev
          })
          return
        }

      const symbol = symbols[currentIndex]
      setCurrentSymbol(symbol)

      // Add scanning update
      const scanningUpdate: ScanUpdate = {
        symbol,
        status: 'scanning',
        timestamp: new Date().toISOString()
      }
      setScanUpdates(prev => [...prev, scanningUpdate])

      // Simulate scan duration and result
      const scanDuration = Math.random() * 3000 + 1000 // 1-4 seconds
      setTimeout(() => {
        const isSuccess = Math.random() > 0.3 // 70% success rate
        const isRateLimited = !isSuccess && Math.random() > 0.5

        let finalUpdate: ScanUpdate
        if (isRateLimited) {
          finalUpdate = {
            symbol,
            status: 'rate_limited',
            error: 'Rate limited by API',
            timestamp: new Date().toISOString()
          }
        } else if (!isSuccess) {
          finalUpdate = {
            symbol,
            status: 'failed',
            error: 'No data available',
            timestamp: new Date().toISOString()
          }
        } else {
          const score = Math.floor(Math.random() * 40) + 60 // 60-100
          const opportunities = Math.random() > 0.7 ? Math.floor(Math.random() * 5) + 1 : 0
          finalUpdate = {
            symbol,
            status: 'success',
            score,
            opportunities,
            timestamp: new Date().toISOString()
          }
        }

        setScanUpdates(prev => prev.map(update => 
          update.symbol === symbol && update.status === 'scanning' ? finalUpdate : update
        ))

        setTotalProcessed(prev => prev + 1)
        if (finalUpdate.status === 'success') {
          setSuccessfulScans(prev => prev + 1)
        } else {
          setFailedScans(prev => prev + 1)
        }

        currentIndex++
      }, scanDuration)

    }, 800) // Start new scan every 800ms

    return () => clearInterval(scanInterval)
  }, [isScanning, scanType, onScanComplete])

  const getStatusIcon = (status: ScanUpdate['status']) => {
    switch (status) {
      case 'scanning': return '🔄'
      case 'success': return '✅'
      case 'failed': return '❌'
      case 'rate_limited': return '🚫'
      default: return '⏳'
    }
  }

  const getStatusColor = (status: ScanUpdate['status']) => {
    switch (status) {
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
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
          Real-Time {scanType === 'options' ? 'Options' : 'Crypto'} Scanner
        </h3>
        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
          <span>✅ {successfulScans}</span>
          <span>❌ {failedScans}</span>
          <span>📊 {totalProcessed} processed</span>
        </div>
      </div>

      {/* Current Status */}
      {currentSymbol && (
        <div className="mb-4 p-4 bg-blue-100 dark:bg-blue-900 rounded-lg border border-blue-200 dark:border-blue-700">
          <div className="flex items-center gap-3">
            <div className="animate-spin text-blue-600 dark:text-blue-400">🔄</div>
            <div>
              <div className="font-medium text-blue-900 dark:text-blue-100">
                Currently scanning {currentSymbol.toUpperCase()}
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300">
                Analyzing market data and calculating opportunities...
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Updates */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Recent Scans</h4>
        {scanUpdates.slice(-10).reverse().map((update, index) => (
          <div
            key={`${update.symbol}-${update.timestamp}-${index}`}
            className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center gap-3">
              <span className={`text-lg ${getStatusColor(update.status)}`}>
                {getStatusIcon(update.status)}
              </span>
              <div>
                <div className="font-medium text-slate-900 dark:text-white">
                  {update.symbol.toUpperCase()}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date(update.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
            <div className="text-right">
              {update.score && (
                <div className="text-green-600 dark:text-green-400 font-semibold">
                  Score: {update.score}
                </div>
              )}
              {update.opportunities && update.opportunities > 0 && (
                <div className="text-blue-600 dark:text-blue-400 text-sm">
                  {update.opportunities} opportunities
                </div>
              )}
              {update.error && (
                <div className="text-red-500 text-sm">
                  {update.error}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Progress Summary */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {successfulScans}
          </div>
          <div className="text-sm text-green-700 dark:text-green-300">Successful</div>
        </div>
        <div className="p-3 bg-red-100 dark:bg-red-900 rounded-lg text-center">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {failedScans}
          </div>
          <div className="text-sm text-red-700 dark:text-red-300">Failed</div>
        </div>
        <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {totalProcessed}
          </div>
          <div className="text-sm text-blue-700 dark:text-blue-300">Total</div>
        </div>
      </div>
    </Card>
  )
}
