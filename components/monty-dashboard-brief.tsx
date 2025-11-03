"use client"

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'

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
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-lg overflow-hidden">
        <Image
          src="/monty-avatar.png"
          alt="Monty"
          width={40}
          height={40}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <div className="rounded-[20px] bg-gradient-to-br from-emerald-500 to-emerald-600 px-5 py-4 shadow-lg">
          <p className="text-[15px] leading-[1.5] text-white/95">
            <strong className="font-semibold">{data.greeting}</strong>
            <br />
            {data.marketSummary}
          </p>

          {insightGroups.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {insightGroups.map((insight) => (
                <p key={insight.id} className="text-[15px] leading-[1.5] text-white/95">
                  <strong className="font-semibold">{insight.label}</strong>
                  <br />
                  {insight.text}
                </p>
              ))}
            </div>
          )}

          {data.suggestedNextStep && (
            <p className="mt-3 text-[15px] leading-[1.5] text-white/95">
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

