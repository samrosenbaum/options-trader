'use client'

import { useState, useEffect } from 'react'
import { isMarketOpen } from '@/lib/utils/market-hours'

export function MarketHoursBanner() {
  const [marketInfo, setMarketInfo] = useState<ReturnType<typeof isMarketOpen> | null>(null)

  useEffect(() => {
    // Check market hours on mount
    setMarketInfo(isMarketOpen())

    // Update every minute
    const interval = setInterval(() => {
      setMarketInfo(isMarketOpen())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  if (!marketInfo || marketInfo.isOpen) {
    // Don't show banner when market is open
    return null
  }

  return (
    <div className="mb-4 rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🌙</span>
        <div className="flex-1">
          <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">
            Market Closed
          </h3>
          <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
            {marketInfo.message}
          </p>
          <p className="mt-2 text-xs text-yellow-700 dark:text-yellow-300">
            You can still run a scan, but options data may be stale or incomplete outside market hours.
          </p>
        </div>
      </div>
    </div>
  )
}
