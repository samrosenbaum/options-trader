'use client'

import { useState } from 'react'
import { AlertTriangle, TrendingUp, X } from 'lucide-react'

interface Alert {
  id: string
  type: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  summary: string
  detail?: string
  threshold?: number
  triggered_at: string
}

interface PositionAlertsProps {
  positionId: string
  symbol: string
  alerts: Alert[]
  onDismiss?: (alertId: string) => void
}

export function PositionAlerts({ positionId, symbol, alerts, onDismiss }: PositionAlertsProps) {
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())

  if (!alerts || alerts.length === 0) {
    return null
  }

  const handleDismiss = async (alertId: string) => {
    setDismissing(prev => new Set(prev).add(alertId))

    try {
      const response = await fetch('/api/positions/dismiss-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId, alertId }),
      })

      if (response.ok) {
        onDismiss?.(alertId)
      } else {
        console.error('Failed to dismiss alert')
        setDismissing(prev => {
          const next = new Set(prev)
          next.delete(alertId)
          return next
        })
      }
    } catch (error) {
      console.error('Error dismissing alert:', error)
      setDismissing(prev => {
        const next = new Set(prev)
        next.delete(alertId)
        return next
      })
    }
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const isDismissing = dismissing.has(alert.id)
        const severityColors = {
          critical: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-800 dark:text-red-100',
          high: 'bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-100',
          medium: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-100',
          low: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-100',
          info: 'bg-slate-50 border-slate-200 text-slate-900 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-100',
        }

        const Icon = alert.type === 'profit_alert' ? TrendingUp : AlertTriangle

        return (
          <div
            key={alert.id}
            className={`flex items-start gap-3 p-3 rounded-lg border ${severityColors[alert.severity]} ${
              isDismissing ? 'opacity-50' : ''
            }`}
          >
            <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{alert.summary}</div>
              {alert.detail && (
                <div className="text-xs mt-1 opacity-80">{alert.detail}</div>
              )}
            </div>
            <button
              onClick={() => handleDismiss(alert.id)}
              disabled={isDismissing}
              className="flex-shrink-0 p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors disabled:opacity-50"
              title="Dismiss alert"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
