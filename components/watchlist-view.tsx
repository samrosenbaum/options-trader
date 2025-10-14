'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { useWatchlist } from '@/components/watchlist-context'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

const getScoreClasses = (score: number | null | undefined) => {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  }

  if (score >= 90) return 'bg-emerald-600 text-white'
  if (score >= 80) return 'bg-emerald-500 text-white'
  if (score >= 70) return 'bg-emerald-400 text-emerald-950'
  if (score >= 60) return 'bg-amber-400 text-amber-950'
  return 'bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
}

const getRiskBadgeClasses = (riskLevel?: string | null) => {
  if (!riskLevel) {
    return 'border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
  }

  const normalized = riskLevel.toLowerCase()
  switch (normalized) {
    case 'low':
      return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'medium':
    case 'moderate':
      return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
    case 'high':
    case 'elevated':
      return 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
    default:
      return 'border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
  }
}

const formatAddedAt = (value: string) => {
  try {
    const parsed = parseISO(value)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }
    return formatDistanceToNowStrict(parsed, { addSuffix: true })
  } catch (error) {
    console.warn('Unable to format watchlist timestamp', error)
    return null
  }
}

export default function WatchlistView() {
  const { items, removeItem, isReady } = useWatchlist()

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aTime = new Date(a.addedAt).getTime()
        const bTime = new Date(b.addedAt).getTime()
        return Number.isFinite(bTime) && Number.isFinite(aTime) ? bTime - aTime : 0
      }),
    [items],
  )

  if (!isReady) {
    return (
      <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading your watchlist…</p>
      </div>
    )
  }

  if (sortedItems.length === 0) {
    return (
      <div className="mt-12 rounded-3xl border border-dashed border-slate-300 bg-white/60 p-12 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
        <div className="text-5xl mb-4">👀</div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">No contracts saved yet</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Explore the <Link href="/scanner-page" className="font-semibold text-emerald-600 dark:text-emerald-300 hover:underline">scanner</Link> and add promising setups to build your short list.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-8 space-y-5">
      {sortedItems.map((item) => {
        const addedDescription = formatAddedAt(item.addedAt)
        const riskLabel = item.riskLevel ? item.riskLevel.toUpperCase() : 'RISK'
        return (
          <div
            key={item.id}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-md transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{item.symbol}</span>
                  <span className={`rounded-xl px-3 py-1 text-sm font-semibold ${getScoreClasses(item.score)}`}>
                    {typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : '—'}
                  </span>
                  <span className={`rounded-lg px-3 py-1 text-xs font-bold ${getRiskBadgeClasses(item.riskLevel)}`}>{riskLabel}</span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {item.optionType.toUpperCase()} ${item.strike}
                  </span>
                  <span>Exp: {item.expiration}</span>
                  {typeof item.daysToExpiration === 'number' && Number.isFinite(item.daysToExpiration) && (
                    <span>{item.daysToExpiration}d remaining</span>
                  )}
                  {addedDescription && <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Added {addedDescription}</span>}
                </div>
                {item.tradeSummary && (
                  <p className="max-w-3xl text-sm leading-relaxed text-slate-700 dark:text-slate-200">{item.tradeSummary}</p>
                )}
              </div>

              <div className="flex min-w-[13rem] flex-col items-end gap-3">
                <div className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(item.premium)}</div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Contract Price
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 dark:border-slate-700 dark:text-slate-200 dark:hover:border-rose-700 dark:hover:bg-rose-900/30 dark:hover:text-rose-200"
                >
                  Remove from Watchlist
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
