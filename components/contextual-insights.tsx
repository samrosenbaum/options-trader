'use client'

import { Info, AlertCircle, TrendingUp, Calendar } from 'lucide-react'

interface Insight {
  id: string
  type: 'status' | 'warning' | 'opportunity' | 'catalyst'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  summary: string
  detail?: string
}

interface ContextualInsightsProps {
  insights: Insight[]
}

export function ContextualInsights({ insights }: ContextualInsightsProps) {
  if (!insights || insights.length === 0) {
    return null
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return AlertCircle
      case 'opportunity':
        return TrendingUp
      case 'catalyst':
        return Calendar
      default:
        return Info
    }
  }

  const getSeverityColors = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-800 dark:text-red-100'
      case 'high':
        return 'bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-100'
      case 'medium':
        return 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-100'
      case 'low':
        return 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-100'
      default:
        return 'bg-slate-50 border-slate-200 text-slate-900 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-100'
    }
  }

  return (
    <div className="space-y-2">
      {insights.map((insight) => {
        const Icon = getIcon(insight.type)
        const colors = getSeverityColors(insight.severity)

        return (
          <div
            key={insight.id}
            className={`flex items-start gap-3 p-3 rounded-lg border ${colors}`}
          >
            <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{insight.summary}</div>
              {insight.detail && (
                <div className="text-xs mt-1 opacity-80">{insight.detail}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
