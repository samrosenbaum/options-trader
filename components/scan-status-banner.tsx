'use client'

import { useState, useEffect } from 'react'

interface CacheStatus {
  available: boolean
  ageMinutes: number
  opportunityCount: number
  scanTimestamp: string | null
  nextScanIn: number | null  // seconds
  isStale: boolean
}

interface ScanStatus {
  strict: CacheStatus
  relaxed: CacheStatus
  cronSchedule: {
    strict: string[]
    relaxed: string[]
  }
}

export function ScanStatusBanner({ mode = 'strict' }: { mode?: 'strict' | 'relaxed' }) {
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState<number | null>(null)

  // Fetch status from API
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/scan-status')
        const data = await response.json()
        setStatus(data)
        setLoading(false)
      } catch (error) {
        console.error('Failed to fetch scan status:', error)
        setLoading(false)
      }
    }

    fetchStatus()
    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  // Countdown timer
  useEffect(() => {
    if (!status) return

    const cache = mode === 'strict' ? status.strict : status.relaxed
    if (cache.nextScanIn === null) return

    setCountdown(cache.nextScanIn)

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 0) return 0
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [status, mode])

  if (loading) {
    return (
      <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-gray-600 dark:text-gray-400">Loading scan status...</span>
        </div>
      </div>
    )
  }

  if (!status) {
    return null
  }

  const cache = mode === 'strict' ? status.strict : status.relaxed
  const modeLabel = mode === 'strict' ? 'Strict' : 'Relaxed'

  // Determine status message
  const isScanning = countdown !== null && countdown <= 0
  const isStale = cache.isStale
  const hasData = cache.available && cache.opportunityCount > 0

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getBannerClass = (): string => {
    if (isScanning) return 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700'
    if (isStale || !hasData) return 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-300 dark:border-yellow-700'
    return 'bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700'
  }

  const getMessage = (): string => {
    if (isScanning) {
      return 'Scanner running now...'
    }
    if (!hasData) {
      return 'No scan data yet. First scan will complete shortly.'
    }
    if (isStale) {
      return `Data is ${cache.ageMinutes.toFixed(0)} minutes old (stale)`
    }
    return `${cache.opportunityCount} opportunities found ${cache.ageMinutes.toFixed(1)} min ago`
  }

  return (
    <div className={`border rounded-lg p-3 mb-4 ${getBannerClass()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {modeLabel} Mode Scanner
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {getMessage()}
            </div>
          </div>
        </div>

        {countdown !== null && countdown > 0 && (
          <div className="text-right">
            <div className="text-xs text-gray-600 dark:text-gray-400">Next scan in</div>
            <div className="text-2xl font-mono font-bold text-blue-600 dark:text-blue-400">
              {formatTime(countdown)}
            </div>
          </div>
        )}

        {isScanning && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">Scanning...</span>
          </div>
        )}
      </div>

      {/* Show cache timestamp if available */}
      {cache.scanTimestamp && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Last scan: {new Date(cache.scanTimestamp).toLocaleString()}
        </div>
      )}

      {/* Show schedule info */}
      <details className="mt-2">
        <summary className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-800 dark:hover:text-gray-300">
          Scan Schedule
        </summary>
        <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 pl-4">
          {status.cronSchedule[mode].map((schedule, i) => (
            <div key={i}>• {schedule}</div>
          ))}
        </div>
      </details>
    </div>
  )
}

// Alternative compact version for header/navbar
export function ScanStatusCompact({ mode = 'strict' }: { mode?: 'strict' | 'relaxed' }) {
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/scan-status')
        const data = await response.json()
        setStatus(data)
      } catch (error) {
        console.error('Failed to fetch scan status:', error)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!status) return

    const cache = mode === 'strict' ? status.strict : status.relaxed
    if (cache.nextScanIn === null) return

    setCountdown(cache.nextScanIn)

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 0) return 0
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [status, mode])

  if (!status) return null

  const cache = mode === 'strict' ? status.strict : status.relaxed
  const isScanning = countdown !== null && countdown <= 0
  const hasData = cache.available && cache.opportunityCount > 0

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
      <div className="flex items-center gap-2">
        {isScanning ? (
          <>
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Scanning...</span>
          </>
        ) : hasData ? (
          <>
            <span className="text-green-600">✓</span>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {cache.opportunityCount} opps
            </span>
          </>
        ) : (
          <>
            <span className="text-yellow-600">⏳</span>
            <span className="text-sm text-gray-700 dark:text-gray-300">Waiting...</span>
          </>
        )}
      </div>

      {countdown !== null && countdown > 0 && (
        <div className="text-sm font-mono text-gray-600 dark:text-gray-400">
          Next: {formatTime(countdown)}
        </div>
      )}
    </div>
  )
}
