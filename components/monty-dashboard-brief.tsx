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
    <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-emerald-900/20 p-6 shadow-[0_18px_60px_rgba(16,185,129,0.18)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-sky-500/10" />
      <div className="pointer-events-none absolute -left-16 -top-16 h-32 w-32 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-200">
          <MessageCircle className="h-6 w-6" />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.32em] text-emerald-200/70">
            <Sparkles className="h-3.5 w-3.5" />
            Monty&apos;s desk ping
          </div>

          <h2 className="mt-3 text-lg font-semibold text-white sm:text-xl">{data.greeting}</h2>
          <p className="mt-2 text-sm text-emerald-100/80 sm:text-base">{data.marketSummary}</p>

          {insightGroups.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm text-emerald-100/90">
              {insightGroups.map((insight) => (
                <li
                  key={insight.id}
                  className="flex items-start gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/80">
                    {insight.label}
                  </span>
                  <span className={`text-sm ${sentimentStyles(insight.sentiment)}`}>{insight.text}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-sm font-medium text-emerald-200/90 italic">
            {data.suggestedNextStep}
          </p>
        </div>
      </div>
    </div>
  )
}

