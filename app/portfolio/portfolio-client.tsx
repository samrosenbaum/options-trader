'use client'

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'
import AddPositionModal from './add-position-modal'
import EditPositionModal from './edit-position-modal'
import ClosePositionModal from './close-position-modal'
import PositionAnalysisModal from './position-analysis-modal'
import CashRain from './cash-rain'
import LossRain from './loss-rain'
import CSVImportModal from '@/components/csv-import-modal'
import DropRiskRadar from '@/components/drop-risk-radar'
import { PositionAlerts } from '@/components/position-alerts'
import { ContextualInsights } from '@/components/contextual-insights'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'

// Helper to format date strings without timezone shifts
// Treats "2025-11-07" as Nov 7, not as UTC midnight (which becomes Nov 6 in PT)
function formatDateLocal(dateString: string): string {
  const [year, month, day] = dateString.split('T')[0].split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString()
}

type Position = Database['public']['Tables']['positions']['Row']
type User = {
  id: string
  email?: string
  user_metadata?: {
    full_name?: string
  }
}

type PortfolioInsight = {
  tone: 'warning' | 'positive'
  title: string
  description: string
}

type PositionBiasKey = 'long_call' | 'long_put' | 'short_call' | 'short_put'

const POSITION_MIX_CONFIG: Record<
  PositionBiasKey,
  { label: string; color: string; description: string }
> = {
  long_call: {
    label: 'Long Calls',
    color: '#3b82f6',
    description: 'Directional upside exposure and growth bets.',
  },
  long_put: {
    label: 'Long Puts',
    color: '#10b981',
    description: 'Downside hedges and tail-risk protection.',
  },
  short_call: {
    label: 'Short Calls',
    color: '#f97316',
    description: 'Covered calls and theta harvesting on rallies.',
  },
  short_put: {
    label: 'Short Puts',
    color: '#ef4444',
    description: 'Premium selling for income with bullish skew.',
  },
}

const TARGET_MIX_TEMPLATE: Array<{
  key: PositionBiasKey
  percentage: number
  description: string
}> = [
  {
    key: 'long_call',
    percentage: 20,
    description: 'Keeps directional upside participation without over-levering.',
  },
  {
    key: 'long_put',
    percentage: 30,
    description: 'Protects drawdowns and balances short premium risk.',
  },
  {
    key: 'short_call',
    percentage: 25,
    description: 'Harvests theta while keeping upside obligations manageable.',
  },
  {
    key: 'short_put',
    percentage: 25,
    description: 'Generates income with bullish bias and cash-secured footing.',
  },
]

const EXPIRATION_BUCKETS = [
  { key: '0-14d', label: '0-14 Days', maxDays: 14 },
  { key: '15-45d', label: '15-45 Days', maxDays: 45 },
  { key: '46d+', label: '46+ Days', maxDays: Number.POSITIVE_INFINITY },
] as const

type ExpirationBucketKey = (typeof EXPIRATION_BUCKETS)[number]['key']

const EXPIRATION_BUCKET_DESCRIPTIONS: Record<ExpirationBucketKey, string> = {
  '0-14d': 'Fast-decaying trades that need active management.',
  '15-45d': 'Core premium window with manageable gamma.',
  '46d+': 'Long-dated swings and hedges smoothing P&L.',
}

const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'hsl(var(--background))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '12px',
  color: 'hsl(var(--foreground))',
  boxShadow: '0 20px 25px -5px rgb(15 23 42 / 0.15)',
  padding: '12px 16px',
}

const formatPercentage = (value: number) => `${Math.round(value)}%`

const formatSignedCurrency = (
  value: number,
  formatter: Intl.NumberFormat,
) => {
  const formatted = formatter.format(Math.abs(value))

  if (value > 0) {
    return `+${formatted}`
  }

  if (value < 0) {
    return `-${formatted}`
  }

  return formatted
}

const getPositionExposure = (position: Position) => {
  const priceBasis =
    (position.current_price ?? position.entry_price ?? 0) > 0
      ? position.current_price ?? position.entry_price ?? 0
      : 1

  return Math.abs(position.contracts) * 100 * priceBasis
}

const getExpirationBucketForPosition = (
  position: Position,
): ExpirationBucketKey => {
  const expirationDate = new Date(position.expiration)
  const now = new Date()
  const millisecondsInDay = 1000 * 60 * 60 * 24
  const daysUntilExpiration = Math.max(
    0,
    Math.round((expirationDate.getTime() - now.getTime()) / millisecondsInDay),
  )

  if (daysUntilExpiration <= EXPIRATION_BUCKETS[0].maxDays) {
    return '0-14d'
  }

  if (daysUntilExpiration <= EXPIRATION_BUCKETS[1].maxDays) {
    return '15-45d'
  }

  return '46d+'
}

export default function PortfolioClient({
  initialPositions,
  user,
}: {
  initialPositions: Position[]
  user: User
}) {
  const [positions, setPositions] = useState<Position[]>(initialPositions)
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [positionToClose, setPositionToClose] = useState<Position | null>(null)
  const [positionToEdit, setPositionToEdit] = useState<Position | null>(null)
  const [positionToAnalyze, setPositionToAnalyze] = useState<Position | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const [isCheckingSignals, setIsCheckingSignals] = useState(false)
  const [signalsMessage, setSignalsMessage] = useState<string | null>(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const [hasAutoRefreshed, setHasAutoRefreshed] = useState(false)
  const [showCashRain, setShowCashRain] = useState(false)
  const [cashRainKey, setCashRainKey] = useState(0)
  const [showLossRain, setShowLossRain] = useState(false)
  const [lossRainKey, setLossRainKey] = useState(0)

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        setNotificationsEnabled(true)
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
          setNotificationsEnabled(permission === 'granted')
        })
      }
    }
  }, [])

  // Fetch watchlist symbols
  useEffect(() => {
    async function fetchWatchlist() {
      try {
        const { data } = await supabase
          .from('watchlist')
          .select('symbol')
          .eq('user_id', user.id)

        if (data) {
          setWatchlistSymbols(data.map(item => item.symbol))
        }
      } catch (error) {
        console.error('Failed to fetch watchlist:', error)
      }
    }
    fetchWatchlist()
  }, [supabase, user.id])

  // Helper to check if market is currently open (9:30 AM - 4:00 PM ET, Mon-Fri)
  const isMarketHours = useCallback(() => {
    const now = new Date()

    // Convert to ET (UTC-5 or UTC-4 depending on DST)
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))

    // Check if weekday (Mon-Fri, 1-5)
    const day = etTime.getDay()
    if (day === 0 || day === 6) return false

    // Check if between 9:30 AM and 4:00 PM
    const hours = etTime.getHours()
    const minutes = etTime.getMinutes()
    const timeInMinutes = hours * 60 + minutes

    const marketOpen = 9 * 60 + 30  // 9:30 AM
    const marketClose = 16 * 60     // 4:00 PM

    return timeInMinutes >= marketOpen && timeInMinutes < marketClose
  }, [])

  // Helper function to send browser notifications
  const sendNotification = useCallback((title: string, body: string, urgent = false) => {
    if (!notificationsEnabled || typeof window === 'undefined' || !('Notification' in window)) {
      return
    }

    const notification = new Notification(title, {
      body,
      icon: '/icon-192x192.png', // Adjust path if needed
      badge: '/icon-192x192.png',
      tag: 'exit-signal',
      requireInteraction: urgent, // Keep notification visible if urgent
    })

    // Close after 10 seconds if not urgent
    if (!urgent) {
      setTimeout(() => notification.close(), 10000)
    }
  }, [notificationsEnabled])

  const handleAddPosition = () => {
    setShowAddModal(true)
  }

  const handlePositionAdded = (newPosition: Position) => {
    setPositions((prev) => [newPosition, ...prev])
    setShowAddModal(false)
    setHasAutoRefreshed(false)
  }

  const handlePositionClosed = (closedPosition: Position) => {
    setPositions((prevPositions) =>
      prevPositions.map((p) =>
        p.id === closedPosition.id ? closedPosition : p
      )
    )

    const realizedPL = Number(closedPosition.realized_pl ?? 0)
    if (Number.isFinite(realizedPL) && realizedPL > 0) {
      setCashRainKey((prev) => prev + 1)
      setShowCashRain(true)
    } else if (Number.isFinite(realizedPL) && realizedPL < 0) {
      setLossRainKey((prev) => prev + 1)
      setShowLossRain(true)
    }

    setPositionToClose(null)
  }

  const handlePositionEdited = (editedPosition: Position) => {
    setPositions(
      positions.map((p) =>
        p.id === editedPosition.id ? editedPosition : p
      )
    )
    setPositionToEdit(null)
  }

  const handleRefreshPrices = useCallback(async () => {
    console.log('[Portfolio] Starting price refresh...')
    setHasAutoRefreshed(true)
    setIsRefreshing(true)
    setRefreshMessage(null)

    try {
      console.log('[Portfolio] Calling /api/portfolio/update-prices')
      const response = await fetch('/api/portfolio/update-prices', {
        method: 'POST',
      })

      console.log('[Portfolio] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Portfolio] API error:', errorText)
        throw new Error(`Failed to update prices: ${response.status}`)
      }

      const result = await response.json()
      console.log('[Portfolio] Update result:', result)

      // Refresh positions from database
      console.log('[Portfolio] Fetching updated positions from Supabase')
      const { data: updatedPositions, error } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false })

      if (error) {
        console.error('[Portfolio] Supabase error:', error)
        throw new Error('Failed to fetch updated positions')
      }

      console.log('[Portfolio] Got', updatedPositions?.length, 'positions from database')
      setPositions(updatedPositions || [])

      const message = `Updated ${result.updated || 0} of ${result.total || 0} positions`
      console.log('[Portfolio]', message)
      setRefreshMessage(message)

      // Clear message after 5 seconds
      setTimeout(() => setRefreshMessage(null), 5000)
    } catch (error) {
      console.error('[Portfolio] Error refreshing prices:', error)
      const errorMsg = `Error: ${error instanceof Error ? error.message : 'Failed to update prices'}`
      setRefreshMessage(errorMsg)

      // Keep error message visible longer
      setTimeout(() => setRefreshMessage(null), 10000)
    } finally {
      setIsRefreshing(false)
      console.log('[Portfolio] Refresh complete')
    }
  }, [supabase, user.id])

  const handleCheckExitSignals = useCallback(async () => {
    console.log('[Portfolio] Starting exit signal check...')
    setIsCheckingSignals(true)
    setSignalsMessage(null)

    try {
      const openPositions = positions.filter((p) => p.status === 'open')

      if (openPositions.length === 0) {
        setSignalsMessage('No open positions to check')
        return
      }

      // Store previous signals for comparison
      const previousSignals = new Map<string, string>()
      openPositions.forEach((p) => {
        if (p.exit_signal) {
          previousSignals.set(p.id, p.exit_signal)
        }
      })

      console.log('[Portfolio] Checking signals for', openPositions.length, 'positions')

      // Get unique symbols
      const uniqueSymbols = [...new Set(openPositions.map(p => p.symbol))]

      // Fetch current directional bias for each symbol (lightweight scan)
      const directionalData: Record<string, {
        direction: string
        confidence: number
        fundamentalHealth?: { health_score?: number }
        earningsInDays?: number
      }> = {}
      try {
        console.log('[Portfolio] Fetching directional bias for', uniqueSymbols.length, 'symbols')
        const scanResponse = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbols: uniqueSymbols,
            // Just need directional bias, no full scan
            quickBiasOnly: true
          }),
        })

        if (scanResponse.ok) {
          const scanResult = await scanResponse.json()
          // Map scan results by symbol
          for (const opp of (scanResult.opportunities || [])) {
            if (opp.symbol && opp.enhancedDirectionalBias) {
              directionalData[opp.symbol] = {
                direction: opp.enhancedDirectionalBias.direction,
                confidence: opp.enhancedDirectionalBias.confidence,
                fundamentalHealth: opp.enhancedDirectionalBias.signals?.fundamental_health,
                earningsInDays: opp.enhancedDirectionalBias.signals?.earnings_catalyst?.days_to_earnings
              }
            }
          }
        }
      } catch (error) {
        console.warn('[Portfolio] Could not fetch directional bias, continuing without it:', error)
      }

      // Prepare positions for exit signal API
      const positionsForApi = openPositions.map((p) => {
        const bias = directionalData[p.symbol]
        return {
          symbol: p.symbol,
          optionType: p.option_type,
          strike: p.strike,
          expiration: p.expiration,
          entryPrice: p.entry_price,
          entryDate: p.entry_date.split('T')[0], // Extract just the date part (YYYY-MM-DD)
          currentPrice: p.current_price || undefined,
          playType: 'BREAKOUT', // Default - could be stored in position
          stopLossPct: -50,
          targetProfitPct: 50,
          // NEW: Add directional signal data if available
          entryDirectionalBias: undefined, // TODO: Store this when position is opened
          currentDirectionalBias: bias?.direction,
          currentDirectionalConfidence: bias?.confidence,
          fundamentalHealthScore: bias?.fundamentalHealth?.health_score,
          earningsInDays: bias?.earningsInDays,
          entryGreeks: {
            delta: p.entry_delta ?? undefined,
            gamma: p.entry_gamma ?? undefined,
            theta: p.entry_theta ?? undefined,
            vega: p.entry_vega ?? undefined,
          },
          currentGreeks: {
            delta: p.current_delta ?? undefined,
            theta: p.current_theta ?? undefined,
          },
          entryIv: p.entry_iv ?? undefined,
        }
      })

      // Call exit signals API
      const response = await fetch('/api/exit-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions: positionsForApi }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Portfolio] Exit signals API error:', errorText)
        throw new Error(`Failed to check exit signals: ${response.status}`)
      }

      const result = await response.json()
      console.log('[Portfolio] Exit signals result:', result)

      const signals = result.signals || {}
      let updatedCount = 0

      // Update each position in database with exit signal data
      for (const position of openPositions) {
        const posKey = `${position.symbol}_${position.strike}_${position.expiration}_${position.option_type}`
        const signal = signals[posKey]

        if (!signal) continue

        // Map exit signal engine format to database schema
        let exitSignal: 'hold' | 'consider' | 'exit_now'
        if (signal.signal === 'SELL_ALL' || signal.signal === 'CUT_LOSS') {
          exitSignal = 'exit_now'
        } else if (signal.signal === 'SELL_PARTIAL') {
          exitSignal = 'consider'
        } else {
          exitSignal = 'hold'
        }

        const updateData = {
          exit_signal: exitSignal,
          exit_urgency_score: Math.round(signal.confidence),
          exit_reasons: signal.reasoning,
          last_signal_check: new Date().toISOString(),
        }

        const { error } = await supabase
          .from('positions')
          .update(updateData)
          .eq('id', position.id)

        if (error) {
          console.error('[Portfolio] Error updating position', position.id, error)
        } else {
          updatedCount++
        }
      }

      // Refresh positions from database
      const { data: updatedPositions, error: fetchError } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false })

      if (fetchError) {
        console.error('[Portfolio] Supabase error:', fetchError)
        throw new Error('Failed to fetch updated positions')
      }

      console.log('[Portfolio] Got', updatedPositions?.length, 'positions from database')
      setPositions(updatedPositions || [])

      // Check for signal changes and send notifications
      let urgentNotifications = 0
      updatedPositions?.forEach((position) => {
        const previousSignal = previousSignals.get(position.id)
        const currentSignal = position.exit_signal

        // Only notify if signal changed
        if (previousSignal && currentSignal && previousSignal !== currentSignal) {
          const isUrgent = currentSignal === 'exit_now'

          // Format notification message
          let title = 'Exit Signal Changed'
          let body = `${position.symbol} ${position.option_type.toUpperCase()} $${position.strike}`

          if (currentSignal === 'exit_now') {
            title = 'EXIT NOW Signal'
            body += ` - ${position.exit_reasons && Array.isArray(position.exit_reasons) ? (position.exit_reasons as string[])[0] : 'Time to exit'}`
            urgentNotifications++
          } else if (currentSignal === 'consider') {
            title = 'Consider Exiting'
            body += ` - ${position.exit_reasons && Array.isArray(position.exit_reasons) ? (position.exit_reasons as string[])[0] : 'Consider taking profits'}`
          } else if (currentSignal === 'hold') {
            title = 'Back to Hold'
            body += ' - Signal improved'
          }

          sendNotification(title, body, isUrgent)
        }
      })

      const message = urgentNotifications > 0
        ? `Checked ${updatedCount} positions - ${urgentNotifications} urgent signal${urgentNotifications > 1 ? 's' : ''}!`
        : `Checked ${updatedCount} positions`
      console.log('[Portfolio]', message)
      setSignalsMessage(message)

      // Clear message after 5 seconds
      setTimeout(() => setSignalsMessage(null), 5000)
    } catch (error) {
      console.error('[Portfolio] Error checking exit signals:', error)
      const errorMsg = `Error: ${error instanceof Error ? error.message : 'Failed to check signals'}`
      setSignalsMessage(errorMsg)

      // Keep error message visible longer
      setTimeout(() => setSignalsMessage(null), 10000)
    } finally {
      setIsCheckingSignals(false)
      console.log('[Portfolio] Exit signal check complete')
    }
  }, [positions, supabase, user.id, sendNotification])

  const openPositions = positions.filter((p) => p.status === 'open')
  const closedPositions = positions.filter((p) => p.status === 'closed')

  // Auto-refresh exit signals during market hours
  useEffect(() => {
    if (openPositions.length === 0) return

    const checkAndRefresh = () => {
      if (isMarketHours()) {
        console.log('[Portfolio] Auto-checking exit signals during market hours')
        void handleCheckExitSignals()
      }
    }

    // Check every 10 minutes during market hours
    const interval = setInterval(checkAndRefresh, 10 * 60 * 1000)

    // Initial check after 1 minute (to avoid immediate check on mount)
    const initialTimeout = setTimeout(() => {
      if (isMarketHours()) {
        console.log('[Portfolio] Initial auto-check of exit signals')
        void handleCheckExitSignals()
      }
    }, 60 * 1000)

    return () => {
      clearInterval(interval)
      clearTimeout(initialTimeout)
    }
  }, [openPositions.length, isMarketHours, handleCheckExitSignals])

  const handleDismissAlert = useCallback(async (positionId: string, alertId: string) => {
    // Optimistically update UI
    setPositions(prevPositions =>
      prevPositions.map(p =>
        p.id === positionId
          ? {
              ...p,
              pending_alerts: Array.isArray(p.pending_alerts)
                ? p.pending_alerts.filter((alert: any) => alert.id !== alertId)
                : [],
            }
          : p
      )
    )
  }, [])

  const totalUnrealizedPL = openPositions.reduce(
    (sum, p) => sum + (p.unrealized_pl || 0),
    0
  )

  const totalRealizedPL = closedPositions.reduce(
    (sum, p) => sum + (p.realized_pl || 0),
    0
  )

  const totalPL = totalUnrealizedPL + totalRealizedPL

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }),
    [],
  )

  const preciseCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [],
  )

  const { mixData, totalExposure, totalContracts } = useMemo(() => {
    const exposures: Record<PositionBiasKey, number> = {
      long_call: 0,
      long_put: 0,
      short_call: 0,
      short_put: 0,
    }

    let exposureTotal = 0
    let contractTotal = 0

    for (const position of openPositions) {
      const direction = position.contracts < 0 ? 'short' : 'long'
      const key = `${direction}_${position.option_type}` as PositionBiasKey
      const exposure = getPositionExposure(position)

      exposures[key] += exposure
      exposureTotal += exposure
      contractTotal += Math.abs(position.contracts)
    }

    const mix = (Object.keys(exposures) as PositionBiasKey[]).map((key) => {
      const value = exposures[key]
      return {
        key,
        label: POSITION_MIX_CONFIG[key].label,
        value,
        percentage: exposureTotal > 0 ? (value / exposureTotal) * 100 : 0,
      }
    })

    return {
      mixData: mix,
      totalExposure: exposureTotal,
      totalContracts: contractTotal,
    }
  }, [openPositions])

  const mixGap = useMemo(
    () =>
      TARGET_MIX_TEMPLATE.map((target) => {
        const actual =
          mixData.find((item) => item.key === target.key)?.percentage ?? 0

        return {
          ...target,
          actual,
          delta: actual - target.percentage,
        }
      }),
    [mixData],
  )

  const expirationProfile = useMemo(() => {
    const bucketTotals: Record<ExpirationBucketKey, number> = {
      '0-14d': 0,
      '15-45d': 0,
      '46d+': 0,
    }

    let exposureTotal = 0

    for (const position of openPositions) {
      const bucket = getExpirationBucketForPosition(position)
      const exposure = getPositionExposure(position)

      bucketTotals[bucket] += exposure
      exposureTotal += exposure
    }

    const data = EXPIRATION_BUCKETS.map((bucket) => {
      const value = bucketTotals[bucket.key]
      return {
        key: bucket.key,
        label: bucket.label,
        value,
        percentage: exposureTotal > 0 ? (value / exposureTotal) * 100 : 0,
      }
    })

    return {
      data,
      totalExposure: exposureTotal,
    }
  }, [openPositions])

  const portfolioInsights = useMemo<PortfolioInsight[]>(() => {
    if (openPositions.length === 0) {
      return []
    }

    const insights: PortfolioInsight[] = []

    const shortCallShare =
      mixData.find((item) => item.key === 'short_call')?.percentage ?? 0
    const shortPutShare =
      mixData.find((item) => item.key === 'short_put')?.percentage ?? 0
    const longPutShare =
      mixData.find((item) => item.key === 'long_put')?.percentage ?? 0
    const longCallShare =
      mixData.find((item) => item.key === 'long_call')?.percentage ?? 0

    const nearTermShare =
      expirationProfile.data.find((bucket) => bucket.key === '0-14d')
        ?.percentage ?? 0
    const farDatedShare =
      expirationProfile.data.find((bucket) => bucket.key === '46d+')
        ?.percentage ?? 0

    if (shortCallShare > 40) {
      insights.push({
        tone: 'warning',
        title: 'Short-call concentration',
        description:
          'Over 40% of the book is short calls. Layer in bullish debit spreads or long deltas to prevent unlimited upside risk.',
      })
    }

    if (shortPutShare > 40) {
      insights.push({
        tone: 'warning',
        title: 'Heavy short-put exposure',
        description:
          'Short puts dominate the mix. Pair them with long puts or put spreads to cap downside if markets slide.',
      })
    }

    if (longPutShare < 15) {
      insights.push({
        tone: 'warning',
        title: 'Thin downside hedges',
        description:
          'Protective puts are under 15% of exposure. Add long puts or collars so drawdowns do not snowball.',
      })
    }

    if (nearTermShare > 55) {
      insights.push({
        tone: 'warning',
        title: 'Near-term gamma risk',
        description:
          'More than half of contracts expire within two weeks. Roll part of the book outward to smooth P&L swings.',
      })
    }

    if (farDatedShare < 10 && longCallShare + longPutShare > 0) {
      insights.push({
        tone: 'warning',
        title: 'Limited long-dated ballast',
        description:
          'Long-dated options are scarce. Establish a few 60-90 day structures to stabilize theta bleed.',
      })
    }

    if (insights.length === 0) {
      insights.push({
        tone: 'positive',
        title: 'Balanced construction',
        description:
          'Your mix tracks closely to the target template. Keep rotating winners into hedges to maintain the profile.',
      })
    }

    return insights
  }, [expirationProfile, mixData, openPositions.length])

  const summaryCards = useMemo(
    () => [
      {
        key: 'active-positions' as const,
        title: 'Active Positions',
        description: 'Currently monitored in your live book.',
        value: openPositions.length.toString(),
        accentClass:
          'before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-emerald-400/25 before:via-emerald-400/5 before:to-transparent',
        valueClass: 'text-slate-900 dark:text-white',
        footer:
          openPositions.length > 0
            ? `${totalContracts} ${totalContracts === 1 ? 'contract' : 'contracts'} · ${currencyFormatter.format(totalExposure)} premium at work`
            : 'No active exposure yet — add your first trade.',
      },
      {
        key: 'unrealized-pl' as const,
        title: 'Unrealized P&L',
        description: 'Live mark-to-market delta.',
        value: formatSignedCurrency(totalUnrealizedPL, preciseCurrencyFormatter),
        accentClass:
          totalUnrealizedPL >= 0
            ? 'before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-emerald-400/20 before:via-emerald-400/5 before:to-transparent'
            : 'before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-rose-500/20 before:via-rose-500/5 before:to-transparent',
        valueClass:
          totalUnrealizedPL >= 0
            ? 'text-emerald-500 dark:text-emerald-300'
            : 'text-rose-500 dark:text-rose-300',
        footer:
          openPositions.length > 0
            ? `${openPositions.filter((p) => (p.unrealized_pl || 0) >= 0).length} winners · ${openPositions.filter((p) => (p.unrealized_pl || 0) < 0).length} under water`
            : 'Waiting for live positions to start tracking.',
      },
      {
        key: 'realized-pl' as const,
        title: 'Realized P&L',
        description: 'Closed trades since tracking began.',
        value: formatSignedCurrency(totalRealizedPL, preciseCurrencyFormatter),
        accentClass:
          totalRealizedPL >= 0
            ? 'before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-blue-400/20 before:via-blue-400/5 before:to-transparent'
            : 'before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-red-500/20 before:via-red-500/5 before:to-transparent',
        valueClass:
          totalRealizedPL >= 0
            ? 'text-blue-500 dark:text-blue-300'
            : 'text-red-500 dark:text-red-300',
        footer:
          closedPositions.length > 0
            ? `${closedPositions.length} closed · ${closedPositions.filter((p) => (p.realized_pl || 0) >= 0).length} green closes`
            : 'No realized trades yet — keep logging exits.',
      },
      {
        key: 'total-pl' as const,
        title: 'Total P&L',
        description: 'Realized + unrealized across the book.',
        value: formatSignedCurrency(totalPL, preciseCurrencyFormatter),
        accentClass:
          totalPL >= 0
            ? 'before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-blue-400/20 before:via-blue-400/5 before:to-transparent'
            : 'before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-red-500/20 before:via-red-500/5 before:to-transparent',
        valueClass:
          totalPL >= 0
            ? 'text-blue-500 dark:text-blue-300'
            : 'text-red-500 dark:text-red-300',
        footer:
          positions.length > 0
            ? `${openPositions.length} open · ${closedPositions.length} closed`
            : 'No trades tracked yet.',
      },
    ],
    [
      closedPositions,
      currencyFormatter,
      openPositions,
      positions,
      preciseCurrencyFormatter,
      totalContracts,
      totalExposure,
      totalPL,
      totalRealizedPL,
      totalUnrealizedPL,
    ],
  )

  useEffect(() => {
    if (hasAutoRefreshed || isRefreshing) {
      return
    }

    const needsRefresh = positions.some((position) => {
      if (position.status !== 'open') {
        return false
      }

      const missingPrice =
        position.current_price === null || position.current_price === undefined
      const missingSignal = !position.last_signal_check

      if (missingPrice || missingSignal) {
        return true
      }

      const lastCheck = new Date(position.last_signal_check as string)
      if (Number.isNaN(lastCheck.getTime())) {
        return true
      }

      const minutesSince = (Date.now() - lastCheck.getTime()) / 60000
      return minutesSince >= 15
    })

    if (needsRefresh) {
      setHasAutoRefreshed(true)
      void handleRefreshPrices()
    }
  }, [positions, hasAutoRefreshed, handleRefreshPrices, isRefreshing])

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-10rem] h-72 w-72 rounded-full bg-emerald-400/30 blur-3xl dark:bg-emerald-500/30" />
        <div className="absolute right-[-10%] bottom-[-12rem] h-[28rem] w-[28rem] rounded-full bg-blue-400/20 blur-[140px] dark:bg-blue-500/25" />
        <div className="absolute left-1/2 top-1/3 h-52 w-52 -translate-x-1/2 rounded-full bg-blue-400/15 blur-3xl dark:bg-blue-500/20" />
      </div>

      {showCashRain && (
        <CashRain
          key={cashRainKey}
          onComplete={() => setShowCashRain(false)}
        />
      )}
      {showLossRain && (
        <LossRain
          key={lossRainKey}
          onComplete={() => setShowLossRain(false)}
        />
      )}

      {/* Summary Cards */}
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-6 py-4 shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-950/60"
        >
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="space-y-6">
              <h1 className="font-display text-4xl font-semibold text-slate-900 dark:text-white sm:text-5xl">
                {user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Hey'}, let's check your positions
              </h1>
              {openPositions.length > 0 && (
                <div className="flex items-start gap-3 max-w-3xl">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold text-sm shadow-lg">
                    M
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="rounded-[18px] bg-gradient-to-br from-emerald-500 to-emerald-600 px-4 py-3 shadow-lg">
                      <p className="text-[15px] leading-[1.4] text-white">
                        {(() => {
                          const plPercent = totalExposure > 0 ? (totalUnrealizedPL / totalExposure) * 100 : 0
                          const hasLongCalls = mixData.some(d => d.label === 'Long Calls' && d.value > 0)
                          const hasLongPuts = mixData.some(d => d.label === 'Long Puts' && d.value > 0)
                          const hasShortCalls = mixData.some(d => d.label === 'Short Calls' && d.value > 0)
                          const hasShortPuts = mixData.some(d => d.label === 'Short Puts' && d.value > 0)

                          let analysis = ""

                          // P&L analysis
                          if (totalUnrealizedPL > 1000) {
                            analysis = `Your portfolio is up ${preciseCurrencyFormatter.format(totalUnrealizedPL)} (${plPercent.toFixed(1)}%). Nice work! `
                          } else if (totalUnrealizedPL > 0) {
                            analysis = `You're up ${preciseCurrencyFormatter.format(totalUnrealizedPL)} right now. Small wins add up. `
                          } else if (totalUnrealizedPL < -1000) {
                            analysis = `You're down ${preciseCurrencyFormatter.format(Math.abs(totalUnrealizedPL))} (${Math.abs(plPercent).toFixed(1)}%). Stay disciplined—manage your risk. `
                          } else if (totalUnrealizedPL < 0) {
                            analysis = `You're down ${preciseCurrencyFormatter.format(Math.abs(totalUnrealizedPL))}. Not ideal, but manageable. `
                          } else {
                            analysis = "Your positions are at breakeven. "
                          }

                          // Strategy mix analysis
                          if (hasLongCalls && !hasLongPuts && !hasShortCalls && !hasShortPuts) {
                            analysis += "You're all-in on bullish bets. High risk, high reward—make sure the market agrees with your thesis."
                          } else if (hasLongPuts && !hasLongCalls && !hasShortCalls && !hasShortPuts) {
                            analysis += "Pure downside protection. Good for hedging, but you're missing upside exposure if the market rallies."
                          } else if (hasShortPuts && !hasLongCalls && !hasLongPuts && !hasShortCalls) {
                            analysis += "You're selling puts for premium. Works great in calm markets, but watch out for sudden drops."
                          } else if ((hasLongCalls || hasLongPuts) && (hasShortCalls || hasShortPuts)) {
                            analysis += "Nice balance of long and short positions. You're managing risk and collecting premium—smart approach."
                          } else if (hasLongCalls && hasLongPuts) {
                            analysis += "You've got both calls and puts, so you're ready for big moves either way. Straddle strategy?"
                          } else {
                            analysis += `You've got ${openPositions.length} open position${openPositions.length > 1 ? 's' : ''} across ${totalContracts} contract${totalContracts > 1 ? 's' : ''}.`
                          }

                          return analysis
                        })()}
                      </p>
                    </div>
                    <span className="px-1 text-xs text-slate-500 dark:text-slate-400">
                      Monty
                    </span>
                  </div>
                </div>
              )}
            </div>

            <motion.div
              className="relative flex h-44 w-full items-center justify-center md:w-64"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-400/40 to-blue-400/30 blur-2xl" />
              <div className="relative flex flex-col items-center gap-2 rounded-2xl border border-emerald-400/30 bg-white/80 px-6 py-6 text-center shadow-2xl backdrop-blur dark:border-emerald-400/30 dark:bg-slate-950/70">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Today&apos;s pulse</span>
                <span
                  className={`text-2xl font-bold ${
                    totalUnrealizedPL >= 0
                      ? 'text-emerald-500 dark:text-emerald-300'
                      : 'text-rose-500 dark:text-rose-300'
                  }`}
                >
                  {formatSignedCurrency(totalUnrealizedPL, preciseCurrencyFormatter)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Unrealized performance</span>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: 'easeOut' }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          {summaryCards.map((card, index) => (
            <motion.div
              key={card.key}
              className={`group relative overflow-hidden rounded-2xl border border-white/50 bg-white/80 p-6 shadow-lg backdrop-blur transition-all hover:-translate-y-1 hover:shadow-2xl dark:border-white/10 dark:bg-slate-950/60 ${card.accentClass}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.05, duration: 0.4, ease: 'easeOut' }}
            >
              <div className="flex flex-col gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {card.description}
                  </p>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">{card.title}</h3>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-3xl font-bold ${card.valueClass}`}>{card.value}</span>
                  <svg
                    className="h-10 w-10 text-slate-300 transition-transform duration-500 group-hover:rotate-6 dark:text-slate-600"
                    viewBox="0 0 100 100"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M20 70L45 45L60 60L80 40"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p className="text-xs text-slate-600 transition-colors group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-300">
                  {card.footer}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Positions Section Header */}
        {(openPositions.length > 0 || closedPositions.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6, ease: 'easeOut' }}
            className="mb-6"
          >
            <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-white sm:text-3xl">
              Positions
            </h2>
            <p className="text-base text-slate-600 dark:text-slate-400 mt-2">
              Track your open trades and review closed position history
            </p>
          </motion.div>
        )}

        {/* Action Buttons */}
        <div className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <motion.button
              onClick={handleAddPosition}
              whileHover={{ y: -2 }}
              whileTap={{ y: 0 }}
              className="w-full transform rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-500 to-emerald-600 py-3 px-6 font-semibold text-white shadow-lg transition-all hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-emerald-400/50 sm:w-auto"
            >
              + Add Position
            </motion.button>

            <motion.button
              onClick={() => setShowImportModal(true)}
              whileHover={{ y: -2 }}
              whileTap={{ y: 0 }}
              className="flex w-full transform items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 py-3 px-6 font-semibold text-white shadow-lg transition-all hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-sky-300/50 dark:from-sky-500 dark:via-sky-500 dark:to-indigo-500 sm:w-auto"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Import CSV
            </motion.button>

            <motion.button
              onClick={handleRefreshPrices}
              disabled={isRefreshing || openPositions.length === 0}
              whileHover={
                isRefreshing || openPositions.length === 0 ? undefined : { y: -2 }
              }
              whileTap={{ y: 0 }}
              className={`flex w-full transform items-center justify-center gap-2 rounded-xl border py-3 px-6 font-semibold transition-all sm:w-auto ${
                isRefreshing || openPositions.length === 0
                  ? 'cursor-not-allowed border-slate-300/70 bg-slate-200/80 text-slate-500 dark:border-slate-700/70 dark:bg-slate-800/60 dark:text-slate-400'
                  : 'border-white/60 bg-white/80 text-slate-700 shadow-lg hover:shadow-xl dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-200'
              }`}
            >
              {isRefreshing ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Updating...
                </>
              ) : (
                <>
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Refresh Prices
                </>
              )}
            </motion.button>

            <motion.button
              onClick={handleCheckExitSignals}
              disabled={isCheckingSignals || openPositions.length === 0}
              whileHover={
                isCheckingSignals || openPositions.length === 0 ? undefined : { y: -2 }
              }
              whileTap={{ y: 0 }}
              className={`flex w-full transform items-center justify-center gap-2 rounded-xl py-3 px-6 font-semibold transition-all sm:w-auto ${
                isCheckingSignals || openPositions.length === 0
                  ? 'cursor-not-allowed bg-slate-300/80 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400'
                  : 'bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 text-white shadow-lg hover:shadow-xl dark:from-orange-500 dark:to-amber-500'
              }`}
            >
              {isCheckingSignals ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Checking...
                </>
              ) : (
                <>
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  Check Exit Signals
                </>
              )}
            </motion.button>

            <AnimatePresence>
              {refreshMessage && (
                <motion.div
                  key="refresh-message"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className={`w-full rounded-xl px-4 py-2 text-sm font-medium shadow-inner sm:w-auto ${
                    refreshMessage.toLowerCase().startsWith('error')
                      ? 'bg-rose-100/90 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                      : 'bg-emerald-100/90 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  }`}
                >
                  {refreshMessage}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {signalsMessage && (
                <motion.div
                  key="signals-message"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className={`w-full rounded-xl px-4 py-2 text-sm font-medium shadow-inner sm:w-auto ${
                    signalsMessage.toLowerCase().startsWith('error')
                      ? 'bg-rose-100/90 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                      : 'bg-emerald-100/90 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  }`}
                >
                  {signalsMessage}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Active Alerts - Show positions with pending alerts */}
        {openPositions.some(p => p.pending_alerts && Array.isArray(p.pending_alerts) && p.pending_alerts.length > 0) && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Active Alerts
            </h2>
            <div className="space-y-4">
              {openPositions
                .filter(p => p.pending_alerts && Array.isArray(p.pending_alerts) && p.pending_alerts.length > 0)
                .map(position => (
                  <div
                    key={position.id}
                    className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/80 p-4 shadow-lg backdrop-blur transition-transform hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10 dark:bg-slate-950/60"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {position.symbol} ${position.strike} {position.option_type.toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Exp: {formatDateLocal(position.expiration)}
                      </span>
                    </div>
                    <PositionAlerts
                      positionId={position.id}
                      symbol={position.symbol}
                      alerts={position.pending_alerts as any[]}
                      onDismiss={(alertId) => handleDismissAlert(position.id, alertId)}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Contextual Insights - Show positions with insights */}
        {openPositions.some(p => p.contextual_insights && Array.isArray(p.contextual_insights) && p.contextual_insights.length > 0) && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Position Insights
            </h2>
            <div className="space-y-4">
              {openPositions
                .filter(p => p.contextual_insights && Array.isArray(p.contextual_insights) && p.contextual_insights.length > 0)
                .map(position => (
                  <div
                    key={position.id}
                    className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/80 p-4 shadow-lg backdrop-blur transition-transform hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10 dark:bg-slate-950/60"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {position.symbol} ${position.strike} {position.option_type.toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Exp: {formatDateLocal(position.expiration)}
                      </span>
                    </div>
                    <ContextualInsights insights={position.contextual_insights as any[]} />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Open Positions */}
        {openPositions.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Open Positions ({openPositions.length})
            </h3>
            <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/80 shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-950/60">
              <div className="overflow-x-auto">
                <table className="min-w-[960px] w-full">
                  <thead className="bg-slate-100/80 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                    <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Strike
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Expiration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Contracts
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Entry
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Current
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      P&L
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Exit Signal
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                    {openPositions.map((position) => (
                      <tr
                        key={position.id}
                        className="transition-colors hover:bg-emerald-50/60 dark:hover:bg-slate-900/60"
                      >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">
                        {position.symbol}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            position.option_type === 'call'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                        >
                          {position.option_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        ${position.strike}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        {formatDateLocal(position.expiration)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        {position.contracts}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        ${position.entry_price.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        ${position.current_price?.toFixed(2) || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div
                          className={`font-semibold ${
                            (position.unrealized_pl || 0) >= 0
                              ? 'text-emerald-600'
                              : 'text-red-600'
                          }`}
                        >
                          ${position.unrealized_pl?.toFixed(2) || '—'}
                        </div>
                        {position.unrealized_pl_percent && (
                          <div className="text-xs text-slate-500">
                            ({position.unrealized_pl_percent.toFixed(1)}%)
                          </div>
                        )}
                        {position.peak_unrealized_pl && position.peak_unrealized_pl > 0 && (
                          <div className="text-xs text-slate-400 mt-1">
                            Peak: ${position.peak_unrealized_pl.toFixed(2)} ({position.peak_unrealized_pl_percent?.toFixed(1)}%)
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm align-top">
                        {position.exit_signal && (() => {
                          const signal = position.exit_signal
                          const urgency = position.exit_urgency_score || 0
                          const reasons = (position.exit_reasons as string[]) || []

                          let bgColor = 'bg-emerald-100 dark:bg-emerald-900/30'
                          let textColor = 'text-emerald-700 dark:text-emerald-400'
                          let emoji = '🟢'
                          let label = 'HOLD'

                          if (signal === 'exit_now') {
                            bgColor = 'bg-red-100 dark:bg-red-900/30'
                            textColor = 'text-red-700 dark:text-red-400'
                            emoji = '🔴'
                            label = 'EXIT NOW'
                          } else if (signal === 'consider') {
                            bgColor = 'bg-amber-100 dark:bg-amber-900/30'
                            textColor = 'text-amber-700 dark:text-amber-400'
                            emoji = '🟡'
                            label = 'CONSIDER'
                          }

                          return (
                            <div className="space-y-1 max-w-[240px]">
                              <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${bgColor} ${textColor}`}>
                                <span>{emoji}</span>
                                <span>{label}</span>
                                <span className="text-[10px]">({urgency})</span>
                              </div>
                              {reasons.length > 0 && (
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                  {reasons.map(r => r.replace(/_/g, ' ')).join(', ')}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex flex-col gap-1.5 w-[110px]">
                          <button
                            onClick={() => setPositionToAnalyze(position)}
                            className="w-full px-2 py-1 rounded text-[11px] font-semibold transition-colors bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white"
                            title="Discuss with Monty"
                          >
                            Ask Monty
                          </button>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setPositionToEdit(position)}
                              className="flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setPositionToClose(position)}
                              className={`flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                                position.exit_signal === 'exit_now'
                                  ? 'bg-red-600 hover:bg-red-700 text-white'
                                  : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Drop Risk Monitor - Stocks showing bearish signals */}
        <div className="mb-8">
          <DropRiskRadar
            limit={20}
            minScore={50}
            filterSymbols={[...new Set([...openPositions.map(p => p.symbol), ...watchlistSymbols])]}
            symbolTags={Object.fromEntries([
              ...openPositions.map(p => [p.symbol.toUpperCase(), 'portfolio' as const]),
              ...watchlistSymbols.map(s => [s.toUpperCase(), 'watchlist' as const])
            ])}
          />
        </div>

        {/* Closed Positions History */}
        {closedPositions.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Closed Positions History ({closedPositions.length})
            </h3>
            <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/80 shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-950/60">
              <div className="overflow-x-auto">
                <table className="min-w-[880px] w-full">
                  <thead className="bg-slate-100/80 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                    <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Strike
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Expiration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Contracts
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Entry
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Exit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Realized P&L
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Closed Date
                    </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                    {closedPositions.map((position) => (
                      <tr
                        key={position.id}
                        className="transition-colors hover:bg-purple-50/60 dark:hover:bg-slate-900/60"
                      >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">
                        {position.symbol}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            position.option_type === 'call'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                        >
                          {position.option_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        ${position.strike}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        {formatDateLocal(position.expiration)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        {position.contracts}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        ${position.entry_price.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        ${position.exit_price?.toFixed(2) || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div
                          className={`font-semibold ${
                            (position.realized_pl || 0) >= 0
                              ? 'text-emerald-600'
                              : 'text-red-600'
                          }`}
                        >
                          ${position.realized_pl?.toFixed(2) || '—'}
                        </div>
                        {position.realized_pl_percent && (
                          <div className="text-xs text-slate-500">
                            ({position.realized_pl_percent.toFixed(1)}%)
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        {position.exit_date ? formatDateLocal(position.exit_date) : '—'}
                      </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {openPositions.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6, ease: 'easeOut' }}
            className="space-y-8"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-white sm:text-3xl">
                  Portfolio Construction
                </h2>
                <p className="text-base text-slate-600 dark:text-slate-400">
                  See how premium exposure, hedges, and expirations stack up so you can source ideas that smooth risk.
                </p>
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/60 px-5 py-3 text-sm text-slate-700 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200">
                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-400/40 via-white/40 to-transparent opacity-80 dark:from-emerald-500/30" />
                <div className="font-semibold text-slate-900 dark:text-white">
                  {currencyFormatter.format(totalExposure)} premium at risk
                </div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  {totalContracts} {totalContracts === 1 ? 'contract' : 'contracts'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_2fr_1.2fr]">
              <div className="group relative overflow-hidden rounded-3xl border border-white/30 bg-white/40 p-6 shadow-[0_25px_80px_-35px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_32px_120px_-40px_rgba(14,116,144,0.55)] dark:border-white/10 dark:bg-slate-900/50">
                <div className="pointer-events-none absolute -top-24 right-[-40%] h-72 w-72 rounded-full bg-emerald-400/30 blur-3xl transition-opacity duration-500 group-hover:opacity-90 dark:bg-emerald-500/30" />
                <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/40 opacity-40 mix-blend-overlay" />
                <div className="relative flex items-start justify-between pb-6">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Current Mix</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Premium-weighted view of your live exposure by strategy bias.
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Exposure
                    </div>
                    <div className="text-base font-semibold text-slate-900 dark:text-white">
                      {currencyFormatter.format(totalExposure)}
                    </div>
                  </div>
                </div>

                {totalExposure <= 0 ? (
                  <div className="relative rounded-2xl border border-white/40 bg-white/40 py-12 text-center text-sm text-slate-500 shadow-inner backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-400">
                    Add entry prices to your positions to generate a construction snapshot.
                  </div>
                ) : (
                  <>
                    <div className="relative h-64 overflow-hidden rounded-2xl border border-white/30 bg-white/30 backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/30">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={mixData}
                            dataKey="value"
                            nameKey="label"
                            innerRadius="60%"
                            outerRadius="90%"
                            paddingAngle={3}
                            stroke="hsl(var(--background))"
                            strokeWidth={1}
                            labelLine={false}
                          >
                            {mixData.map((item) => (
                              <Cell
                                key={item.key}
                                fill={POSITION_MIX_CONFIG[item.key].color}
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            contentStyle={CHART_TOOLTIP_STYLE}
                            formatter={(value: number, _name, payload) => {
                              const percentage = payload?.payload?.percentage ?? 0
                              return [
                                currencyFormatter.format(value as number),
                                `${payload?.payload?.label as string} • ${formatPercentage(percentage)}`,
                              ]
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-3xl font-semibold text-slate-900 dark:text-white">100%</span>
                        <span className="text-sm text-slate-600 dark:text-slate-400">Allocated</span>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                      {mixData.map((item) => (
                        <div
                          key={item.key}
                          className="relative overflow-hidden rounded-2xl border border-white/30 bg-white/40 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/40"
                        >
                          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{
                                  backgroundColor: POSITION_MIX_CONFIG[item.key].color,
                                }}
                              />
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {POSITION_MIX_CONFIG[item.key].label}
                              </span>
                            </div>
                            <span className="text-slate-500 dark:text-slate-400">
                              {formatPercentage(item.percentage)}
                            </span>
                          </div>
                          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                            {POSITION_MIX_CONFIG[item.key].description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="group relative overflow-hidden rounded-3xl border border-white/30 bg-white/40 p-6 shadow-[0_25px_80px_-35px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_32px_120px_-38px_rgba(2,132,199,0.55)] dark:border-white/10 dark:bg-slate-900/50">
                <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/40 opacity-40 mix-blend-overlay" />
                <div className="pointer-events-none absolute -bottom-24 left-[-35%] h-72 w-72 rounded-full bg-sky-400/30 blur-3xl transition-opacity duration-500 group-hover:opacity-90 dark:bg-sky-500/30" />
                <div className="relative mb-6 space-y-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Target Mix &amp; Gaps</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Benchmark against a balanced book template, then see how far each sleeve is from target.
                  </p>
                </div>

                <div className="relative space-y-4">
                  {mixGap.map((item) => {
                    const deltaMagnitude = Math.abs(Math.round(item.delta))
                    const statusLabel =
                      deltaMagnitude < 2
                        ? 'On target'
                        : item.delta > 0
                          ? `+${deltaMagnitude}% over`
                          : `${deltaMagnitude}% under`

                    return (
                      <div
                        key={item.key}
                        className="relative overflow-hidden rounded-2xl border border-white/30 bg-white/40 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/40"
                      >
                        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: POSITION_MIX_CONFIG[item.key].color,
                              }}
                            />
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {POSITION_MIX_CONFIG[item.key].label}
                            </span>
                          </div>
                          <span className="text-slate-500 dark:text-slate-400">
                            Target {item.percentage}%
                          </span>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100/70 dark:bg-slate-800/70">
                            <div
                              className="absolute inset-y-0 rounded-full"
                              style={{
                                width: `${Math.min(100, item.actual)}%`,
                                backgroundColor: POSITION_MIX_CONFIG[item.key].color,
                                opacity: 0.8,
                              }}
                            />
                            <span
                              className="absolute inset-y-0 w-[2px] bg-slate-400/50 dark:bg-slate-500/50"
                              style={{ left: `${item.percentage}%` }}
                            />
                          </div>
                          <span
                            className={`text-sm font-medium ${
                              deltaMagnitude < 2
                                ? 'text-slate-600 dark:text-slate-400'
                                : item.delta > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {formatPercentage(item.actual)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          {statusLabel} · {item.description}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/30 bg-white/40 p-6 shadow-[0_25px_80px_-35px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_34px_120px_-42px_rgba(109,40,217,0.55)] dark:border-white/10 dark:bg-slate-900/50">
                <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/40 opacity-40 mix-blend-overlay" />
                <div className="pointer-events-none absolute -top-20 left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-purple-400/30 blur-3xl transition-opacity duration-500 group-hover:opacity-90 dark:bg-purple-500/25" />
                <div className="relative">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Balancing cues</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Quick reads on where to adjust before sourcing the next trade.
                  </p>
                </div>

                <div className="relative mt-6 space-y-4">
                  {portfolioInsights.map((insight, index) => (
                    <div
                      key={`${insight.title}-${index}`}
                      className={`relative overflow-hidden rounded-2xl border p-4 text-sm leading-relaxed shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                        insight.tone === 'warning'
                          ? 'border-amber-200/60 bg-amber-100/30 dark:border-amber-900/40 dark:bg-amber-900/20'
                          : 'border-emerald-200/60 bg-emerald-100/30 dark:border-emerald-900/40 dark:bg-emerald-900/20'
                      }`}
                    >
                      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                      <div className="flex gap-3">
                        <div
                          className={`mt-1 h-8 w-8 shrink-0 rounded-xl bg-gradient-to-br ${
                            insight.tone === 'warning'
                              ? 'from-amber-200/70 via-amber-100/60 to-transparent dark:from-amber-500/30 dark:via-transparent'
                              : 'from-emerald-200/70 via-emerald-100/60 to-transparent dark:from-emerald-500/30 dark:via-transparent'
                          } shadow-inner`}
                        />
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-900 dark:text-white">{insight.title}</div>
                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                            {insight.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-white/30 bg-white/50 p-6 shadow-[0_30px_90px_-45px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_38px_130px_-50px_rgba(79,70,229,0.55)] dark:border-white/10 dark:bg-slate-900/50">
              <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/40 opacity-40 mix-blend-overlay" />
              <div className="pointer-events-none absolute -top-28 right-[-25%] h-72 w-72 rounded-full bg-indigo-400/30 blur-3xl transition-opacity duration-500 hover:opacity-90 dark:bg-indigo-500/25" />
              <div className="relative flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Expiration Ladder
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Distribution of premium across near, medium, and long-dated contracts.
                  </p>
                </div>
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {formatPercentage(
                    expirationProfile.data.reduce((sum, bucket) => sum + bucket.percentage, 0),
                  )}{' '}
                  allocated
                </div>
              </div>

              {expirationProfile.totalExposure <= 0 ? (
                <div className="relative rounded-2xl border border-white/40 bg-white/40 py-12 text-center text-sm text-slate-500 shadow-inner backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-400">
                  We need premium values to build this ladder.
                </div>
              ) : (
                <div className="relative h-64 overflow-hidden rounded-2xl border border-white/30 bg-white/40 backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={expirationProfile.data} barSize={32}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="label"
                        stroke="hsl(var(--muted-foreground))"
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(value) => `${Math.round(value)}%`}
                        domain={[0, 100]}
                        style={{ fontSize: '12px' }}
                      />
                      <RechartsTooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: number, _name, payload) => [
                          `${formatPercentage(value as number)}`,
                          payload?.payload?.label as string,
                        ]}
                      />
                      <Bar dataKey="percentage" radius={[12, 12, 0, 0]} fill="#6366f1" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                {expirationProfile.data.map((bucket) => (
                  <div
                    key={bucket.key}
                    className="relative overflow-hidden rounded-2xl border border-white/30 bg-white/40 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/40"
                  >
                    <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {bucket.label}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                      {formatPercentage(bucket.percentage)}
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {EXPIRATION_BUCKET_DESCRIPTIONS[bucket.key]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        )}

        {/* Empty State */}
        {positions.length === 0 && (
          <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 p-12 text-center shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-950/60">
            <div className="text-slate-400 mb-4">
              <svg
                className="mx-auto h-12 w-12"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              No positions yet
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Start tracking your options trades by adding your first position.
            </p>
            <motion.button
              onClick={handleAddPosition}
              whileHover={{ y: -2 }}
              whileTap={{ y: 0 }}
              className="rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-500 to-emerald-600 py-2 px-6 font-semibold text-white shadow-lg transition-all hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
            >
              Add Your First Position
            </motion.button>
          </div>
        )}
      </div>

      {/* Add Position Modal */}
      {showAddModal && (
        <AddPositionModal
          userId={user.id}
          onClose={() => setShowAddModal(false)}
          onSuccess={handlePositionAdded}
        />
      )}

      {/* Edit Position Modal */}
      {positionToEdit && (
        <EditPositionModal
          position={positionToEdit}
          onClose={() => setPositionToEdit(null)}
          onSuccess={handlePositionEdited}
        />
      )}

      {/* Close Position Modal */}
      {positionToClose && (
        <ClosePositionModal
          position={positionToClose}
          onClose={() => setPositionToClose(null)}
          onSuccess={handlePositionClosed}
        />
      )}

      {/* Ask Monty Analysis Modal */}
      {positionToAnalyze && (
        <PositionAnalysisModal
          position={positionToAnalyze}
          onClose={() => setPositionToAnalyze(null)}
        />
      )}

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportSuccess={async () => {
          // Refresh positions after import
          const { data } = await supabase
            .from('positions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })

          if (data) {
            setPositions(data)
          }
        }}
      />

    </div>
  )
}
