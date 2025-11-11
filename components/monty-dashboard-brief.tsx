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
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-emerald-100" />
          <div className="space-y-2">
            <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-64 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-48 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return null
  }

  return (
    <div className="flex max-w-4xl items-start gap-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-lg">
        <Image
          src="/monty-avatar.png"
          alt="Monty"
          width={40}
          height={40}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <div className="rounded-[20px] border border-emerald-100 bg-white px-5 py-4 shadow-sm">
          <p className="text-[15px] leading-[1.6] text-slate-700">
            <strong className="font-semibold text-slate-900">{data.greeting}</strong>
            <br />
            {data.marketSummary}
          </p>

          {insightGroups.length > 0 && (
            <div className="mt-4 space-y-2">
              {insightGroups.map((insight) => (
                <p key={insight.id} className="text-[15px] leading-[1.6] text-slate-600">
                  <strong className="font-semibold text-slate-900">{insight.label}</strong>
                  <br />
                  {insight.text}
                </p>
              ))}
            </div>
          )}

          {data.suggestedNextStep && (
            <p className="mt-4 text-[15px] leading-[1.6] text-slate-600">
              {data.suggestedNextStep}
            </p>
          )}
        </div>
        <span className="px-1 text-xs uppercase tracking-[0.25em] text-slate-400">
          Monty · Just now
        </span>
      </div>
    </div>
  )
}

