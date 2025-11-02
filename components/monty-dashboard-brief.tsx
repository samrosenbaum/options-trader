"use client"

import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, Sparkles } from 'lucide-react'

type Insight = {
  id: string
  type: 'unusual_flow' | 'risk' | 'portfolio' | 'expiration' | 'market'
  text: string
  symbol?: string
  sentiment: 'positive' | 'negative' | 'neutral'
}

interface DashboardBrief {
  success: true
  greeting: string
  marketSummary: string
  insights: Insight[]
  suggestedNextStep: string
  timestamp: string
}

interface FetchState {
  loading: boolean
  error: string | null
  data: DashboardBrief | null
}

function sentimentStyles(sentiment: Insight['sentiment']) {
  switch (sentiment) {
    case 'positive':
      return 'text-emerald-200'
    case 'negative':
      return 'text-red-300'
    default:
      return 'text-slate-200'
  }
}

export function MontyDashboardBrief() {
  const [{ data, error, loading }, setState] = useState<FetchState>({
    data: null,
    error: null,
    loading: true
  })

  useEffect(() => {
    let isMounted = true

    async function loadBrief() {
      try {
        const response = await fetch('/api/dashboard-brief', { cache: 'no-store' })

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }

        const payload = (await response.json()) as DashboardBrief

        if (!isMounted) return

        setState({ data: payload, error: null, loading: false })
      } catch (err) {
        if (!isMounted) return

        console.error('Failed to load Monty dashboard brief:', err)
        setState({ data: null, error: 'Unable to fetch Monty’s desk update.', loading: false })
      }
    }

    loadBrief()

    return () => {
      isMounted = false
    }
  }, [])

  const insightGroups = useMemo(() => {
    if (!data?.insights) {
      return []
    }

    const labelMap: Record<Insight['type'], string> = {
      unusual_flow: 'Unusual Flow',
      risk: 'Risk Check',
      portfolio: 'Portfolio Construction',
      expiration: 'Clock Is Ticking',
      market: 'Market Backdrop'
    }

    return data.insights.map((insight) => ({
      ...insight,
      label: labelMap[insight.type]
    }))
  }, [data?.insights])

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-emerald-900/10 p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-emerald-500/30" />
          <div>
            <div className="h-3 w-36 animate-pulse rounded bg-emerald-500/30" />
            <div className="mt-3 h-3 w-64 animate-pulse rounded bg-emerald-500/20" />
            <div className="mt-2 h-3 w-48 animate-pulse rounded bg-emerald-500/20" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return null
  }

  return (
    <div className="flex items-start gap-3 max-w-4xl">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold text-sm shadow-lg">
        M
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <div className="rounded-[20px] bg-gradient-to-br from-emerald-500 to-emerald-600 px-5 py-4 shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-white/90" />
            <span className="text-xs font-semibold uppercase tracking-wider text-white/90">
              Monty&apos;s desk ping
            </span>
          </div>

          <h3 className="text-base font-semibold text-white leading-relaxed">{data.greeting}</h3>
          <p className="mt-2 text-[15px] leading-[1.5] text-white/95">{data.marketSummary}</p>

          {insightGroups.length > 0 && (
            <div className="mt-4 space-y-2">
              {insightGroups.map((insight) => (
                <div
                  key={insight.id}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-white/80 mt-0.5">
                      {insight.label}
                    </span>
                    <span className="text-[14px] leading-[1.4] text-white/95 flex-1">{insight.text}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.suggestedNextStep && (
            <p className="mt-4 text-[15px] leading-[1.5] text-white/95 italic border-t border-white/20 pt-3">
              {data.suggestedNextStep}
            </p>
          )}
        </div>
        <span className="px-1 text-xs text-slate-500 dark:text-slate-400">
          Monty · Just now
        </span>
      </div>
    </div>
  )
}

