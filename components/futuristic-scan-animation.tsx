'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface FuturisticScanAnimationProps {
  isScanning: boolean
  scanType: 'options' | 'crypto'
  onScanComplete?: () => void
}

interface ScanMetric {
  id: string
  symbol: string
  status: 'queued' | 'scanning' | 'analyzing' | 'filtered'
  score?: number
  progress: number
  timestamp: number
}

const SCAN_UNIVERSE = {
  options: [
    'AMD', 'NFLX', 'TSLA', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'HOOD',
    'SOFI', 'PLTR', 'COIN', 'MARA', 'RIOT', 'BITF', 'HUT', 'PYPL', 'SQ', 'ROKU',
    'GME', 'AMC', 'SPCE', 'LCID', 'RIVN', 'XPEV', 'NIO', 'WKHS', 'CLOV', 'AFRM',
    'BABA', 'DIS', 'SHOP', 'UBER', 'LYFT', 'SNAP', 'TWTR', 'ZM', 'DOCU', 'CRM'
  ],
  crypto: [
    'BTC', 'ETH', 'BNB', 'ADA', 'SOL', 'DOT', 'LINK', 'AVAX', 'MATIC', 'LTC',
    'BCH', 'XLM', 'XMR', 'ETC', 'VET', 'FIL', 'TRX', 'ATOM', 'ALGO', 'XTZ'
  ]
}

export function FuturisticScanAnimation({ isScanning, scanType }: FuturisticScanAnimationProps) {
  const [metrics, setMetrics] = useState<ScanMetric[]>([])
  const [totalScanned, setTotalScanned] = useState(0)
  const [qualified, setQualified] = useState(0)
  const [currentPhase, setCurrentPhase] = useState<'initializing' | 'scanning' | 'analyzing' | 'complete'>('initializing')
  const [particles, setParticles] = useState<Array<{ id: string; x: number; y: number; delay: number }>>([])

  useEffect(() => {
    if (!isScanning) {
      setMetrics([])
      setTotalScanned(0)
      setQualified(0)
      setCurrentPhase('initializing')
      setParticles([])
      return
    }

    // Initialize phase
    setCurrentPhase('initializing')

    // Generate particle effects
    const newParticles = Array.from({ length: 30 }, (_, i) => ({
      id: `particle-${i}`,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 2
    }))
    setParticles(newParticles)

    // Transition to scanning after initialization
    setTimeout(() => setCurrentPhase('scanning'), 800)

    const symbols = SCAN_UNIVERSE[scanType]
    let currentIndex = 0
    let scannedCount = 0
    let qualifiedCount = 0

    const scanInterval = setInterval(() => {
      if (currentIndex >= symbols.length) {
        setCurrentPhase('complete')
        clearInterval(scanInterval)
        return
      }

      const symbol = symbols[currentIndex]
      const metricId = `${symbol}-${Date.now()}`

      // Add to queue
      setMetrics(prev => [...prev.slice(-8), {
        id: metricId,
        symbol,
        status: 'queued',
        progress: 0,
        timestamp: Date.now()
      }])

      // Simulate scanning phases
      setTimeout(() => {
        setMetrics(prev => prev.map(m =>
          m.id === metricId ? { ...m, status: 'scanning' as const, progress: 33 } : m
        ))
      }, 200)

      setTimeout(() => {
        setMetrics(prev => prev.map(m =>
          m.id === metricId ? { ...m, status: 'analyzing' as const, progress: 66 } : m
        ))
      }, 600)

      setTimeout(() => {
        const isQualified = Math.random() > 0.65 // 35% pass rate
        const score = isQualified ? Math.floor(Math.random() * 30) + 70 : Math.floor(Math.random() * 40) + 30

        setMetrics(prev => prev.map(m =>
          m.id === metricId ? {
            ...m,
            status: 'filtered' as const,
            progress: 100,
            score
          } : m
        ))

        scannedCount++
        setTotalScanned(scannedCount)

        if (isQualified) {
          qualifiedCount++
          setQualified(qualifiedCount)
        }
      }, 1200)

      currentIndex++
    }, 400)

    return () => clearInterval(scanInterval)
  }, [isScanning, scanType])

  if (!isScanning) return null

  const getStatusConfig = (status: ScanMetric['status']) => {
    switch (status) {
      case 'queued':
        return { label: 'QUEUED', color: 'text-zinc-500', bg: 'bg-zinc-800/50', border: 'border-zinc-700' }
      case 'scanning':
        return { label: 'SCANNING', color: 'text-blue-400', bg: 'bg-blue-950/40', border: 'border-blue-800' }
      case 'analyzing':
        return { label: 'ANALYZING', color: 'text-purple-400', bg: 'bg-purple-950/40', border: 'border-purple-800' }
      case 'filtered':
        return { label: 'COMPLETE', color: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-800' }
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-red-400'
    if (score >= 80) return 'text-orange-400'
    if (score >= 70) return 'text-emerald-400'
    return 'text-zinc-500'
  }

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      {/* Animated Background Particles */}
      <div className="absolute inset-0 overflow-hidden">
        {particles.map(particle => (
          <motion.div
            key={particle.id}
            className="absolute h-1 w-1 rounded-full bg-blue-500/20"
            initial={{ x: `${particle.x}%`, y: `${particle.y}%`, opacity: 0 }}
            animate={{
              x: [`${particle.x}%`, `${(particle.x + 20) % 100}%`],
              y: [`${particle.y}%`, `${(particle.y + 30) % 100}%`],
              opacity: [0, 0.6, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: particle.delay,
              ease: "linear"
            }}
          />
        ))}
      </div>

      {/* Scan Grid Lines */}
      <div className="absolute inset-0 opacity-10">
        <div className="grid grid-cols-12 gap-px h-full">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="border-r border-blue-500/20" />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="relative p-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <motion.div
                className="h-2 w-2 rounded-full bg-emerald-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <h3 className="text-lg font-semibold text-white">
                {currentPhase === 'initializing' && 'Initializing Quantum Scanner...'}
                {currentPhase === 'scanning' && 'Deep Market Analysis'}
                {currentPhase === 'analyzing' && 'Processing Alpha Signals'}
                {currentPhase === 'complete' && 'Scan Complete'}
              </h3>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              {scanType === 'options' ? 'Options Market' : 'Crypto Market'} • Real-time institutional-grade analysis
            </p>
          </div>

          {/* Stats */}
          <div className="flex gap-6 text-right">
            <div>
              <div className="text-2xl font-bold text-white">{totalScanned}</div>
              <div className="text-xs text-zinc-500">SCANNED</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-400">{qualified}</div>
              <div className="text-xs text-zinc-500">QUALIFIED</div>
            </div>
          </div>
        </div>

        {/* Scanning Radar Visualization */}
        <div className="mb-6">
          <div className="relative h-2 overflow-hidden rounded-full bg-zinc-900">
            <motion.div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 via-purple-500 to-emerald-500"
              initial={{ width: '0%' }}
              animate={{ width: `${(totalScanned / SCAN_UNIVERSE[scanType].length) * 100}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            <motion.div
              className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white to-transparent opacity-30"
              animate={{ x: ['-100%', '400%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </div>

        {/* Real-time Symbol Feed */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            <span>Active Analysis Stream</span>
            <span>{Math.round((totalScanned / SCAN_UNIVERSE[scanType].length) * 100)}% Complete</span>
          </div>

          <div className="space-y-2 max-h-64 overflow-hidden">
            <AnimatePresence mode="popLayout">
              {metrics.map((metric) => {
                const config = getStatusConfig(metric.status)
                return (
                  <motion.div
                    key={metric.id}
                    initial={{ opacity: 0, x: -20, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    exit={{ opacity: 0, x: 20, height: 0 }}
                    className={`flex items-center justify-between rounded-lg border ${config.border} ${config.bg} p-3 backdrop-blur-sm`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {/* Status Indicator */}
                      <div className="relative h-8 w-8 flex items-center justify-center">
                        {metric.status === 'scanning' || metric.status === 'analyzing' ? (
                          <motion.div
                            className={`absolute inset-0 rounded border-2 ${config.border}`}
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                          />
                        ) : (
                          <div className={`h-2 w-2 rounded-full ${metric.status === 'filtered' ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                        )}
                      </div>

                      {/* Symbol */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white">{metric.symbol}</span>
                          <span className={`text-xs font-semibold ${config.color}`}>{config.label}</span>
                        </div>
                        {metric.status !== 'queued' && (
                          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                            <motion.div
                              className={`h-full ${metric.status === 'scanning' ? 'bg-blue-500' : metric.status === 'analyzing' ? 'bg-purple-500' : 'bg-emerald-500'}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${metric.progress}%` }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Score */}
                      {metric.score !== undefined && (
                        <div className="text-right">
                          <div className={`font-mono text-lg font-bold ${getScoreColor(metric.score)}`}>
                            {metric.score}
                          </div>
                          <div className="text-xs text-zinc-500">SCORE</div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* System Status Footer */}
        <div className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-4 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-zinc-500">Neural network active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-zinc-500">Market data streaming</span>
            </div>
          </div>
          <span className="font-mono text-zinc-600">
            {new Date().toLocaleTimeString('en-US', { hour12: false })}
          </span>
        </div>
      </div>
    </div>
  )
}
