'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { useWatchlist } from '@/components/watchlist-context'
import { RefreshCw, Brain } from 'lucide-react'
import { wouldBalancePortfolio, type PositionBiasKey, type PortfolioGap } from '@/lib/portfolio-balance'
import WatchlistReviewModal from './watchlist-review-modal'

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

interface PriceData {
  currentPremium: number | null
  plAmount: number | null
  plPercent: number | null
  stockPrice: number | null
}

export default function WatchlistView() {
  const { items, removeItem, isReady } = useWatchlist()
  const [priceData, setPriceData] = useState<Record<string, PriceData>>({})
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [neededTypes, setNeededTypes] = useState<PositionBiasKey[]>([])
  const [portfolioGaps, setPortfolioGaps] = useState<PortfolioGap[]>([])
  const [hasPortfolio, setHasPortfolio] = useState(false)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aTime = new Date(a.addedAt).getTime()
        const bTime = new Date(b.addedAt).getTime()
        return Number.isFinite(bTime) && Number.isFinite(aTime) ? bTime - aTime : 0
      }),
    [items],
  )

  const fetchPortfolioBalance = async () => {
    try {
      const response = await fetch('/api/portfolio-balance')
      if (!response.ok) {
        console.warn('Portfolio balance API returned error:', response.status)
        return
      }
      const data = await response.json()
      if (data.success) {
        setNeededTypes(data.neededTypes || [])
        setPortfolioGaps(data.gaps || [])
        setHasPortfolio(data.hasPositions || false)
      }
    } catch (err) {
      console.error('Error fetching portfolio balance:', err)
      // Don't let portfolio balance errors block other functionality
    }
  }

  const fetchPrices = async () => {
    if (items.length === 0) return

    setLoadingPrices(true)
    try {
      const response = await fetch('/api/watchlist/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })

      const data = await response.json()
      if (data.success && data.results) {
        const priceMap: Record<string, PriceData> = {}
        data.results.forEach((result: PriceData & { id: string }) => {
          priceMap[result.id] = {
            currentPremium: result.currentPremium,
            plAmount: result.plAmount,
            plPercent: result.plPercent,
            stockPrice: result.stockPrice,
          }
        })
        setPriceData(priceMap)
      }
    } catch (err) {
      console.error('Error fetching watchlist prices:', err)
    } finally {
      setLoadingPrices(false)
    }
  }

  // Auto-fetch prices and portfolio balance when component mounts
  useEffect(() => {
    if (isReady) {
      fetchPortfolioBalance()
      if (items.length > 0) {
        fetchPrices()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, items.length])

  // Calculate portfolio totals
  const portfolioTotals = useMemo(() => {
    let totalCost = 0
    let totalCurrentValue = 0
    let totalPL = 0
    let itemsWithPrices = 0

    sortedItems.forEach(item => {
      totalCost += item.premium
      const prices = priceData[item.id]
      if (prices && prices.currentPremium !== null) {
        totalCurrentValue += prices.currentPremium
        totalPL += prices.plAmount || 0
        itemsWithPrices++
      }
    })

    const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0

    return { totalCost, totalCurrentValue, totalPL, totalPLPercent, itemsWithPrices }
  }, [sortedItems, priceData])

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

  const balancerItems = sortedItems.filter(item =>
    hasPortfolio && wouldBalancePortfolio(item.optionType as 'call' | 'put', neededTypes)
  )

  return (
    <div className="mt-8 space-y-6">
      {/* Portfolio Balance Banner */}
      {hasPortfolio && neededTypes.length > 0 && balancerItems.length > 0 && (
        <div className="rounded-2xl border border-blue-300 bg-blue-50 p-6 dark:border-blue-700 dark:bg-blue-950/30">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                Portfolio Balance Opportunities
              </h3>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                {balancerItems.length} {balancerItems.length === 1 ? 'item' : 'items'} on your watchlist would help balance your portfolio.
                These are marked with the <span className="font-semibold">BALANCER</span> badge below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Totals Summary */}
      <div className="relative bg-gradient-to-br from-slate-900/80 via-emerald-900/30 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-emerald-500/40 p-8 shadow-[0_8px_32px_rgba(16,185,129,0.2),0_0_0_1px_rgba(16,185,129,0.1)_inset] overflow-hidden transition-all duration-300 hover:shadow-[0_12px_48px_rgba(16,185,129,0.25),0_0_0_1px_rgba(16,185,129,0.15)_inset] hover:scale-[1.01] hover:border-emerald-500/50">
        {/* Glass reflection effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-40"></div>
        <div className="absolute inset-0 bg-gradient-to-tl from-emerald-400/5 via-transparent to-transparent"></div>

        {/* Gradient accent glow */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"></div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"></div>
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl"></div>

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Watchlist Portfolio</h2>
              <p className="text-sm text-slate-300">
                {sortedItems.length} {sortedItems.length === 1 ? 'position' : 'positions'} tracked
                {portfolioTotals.itemsWithPrices > 0 && ` • ${portfolioTotals.itemsWithPrices} with live prices`}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-purple-600 hover:to-blue-700"
              >
                <Brain className="h-4 w-4" />
                Ask Monty to Review
              </button>
              <button
                type="button"
                onClick={() => {
                  fetchPrices()
                  fetchPortfolioBalance()
                }}
                disabled={loadingPrices}
                className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-400/30 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 hover:border-emerald-400/50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loadingPrices ? 'animate-spin' : ''}`} />
                {loadingPrices ? 'Updating...' : 'Refresh Prices'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Premium Cost */}
            <div className="bg-slate-800/40 rounded-xl p-6 border border-slate-700/50">
              <div className="text-sm font-medium text-slate-400 mb-2">Total Premium Cost</div>
              <div className="text-3xl font-bold text-white">{formatCurrency(portfolioTotals.totalCost)}</div>
              <div className="text-xs text-slate-500 mt-1">What you would&apos;ve paid</div>
            </div>

            {/* Current Total Value */}
            <div className="bg-slate-800/40 rounded-xl p-6 border border-slate-700/50">
              <div className="text-sm font-medium text-slate-400 mb-2">Current Total Value</div>
              {portfolioTotals.itemsWithPrices > 0 ? (
                <>
                  <div className="text-3xl font-bold text-white">{formatCurrency(portfolioTotals.totalCurrentValue)}</div>
                  <div className="text-xs text-slate-500 mt-1">Based on live prices</div>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold text-slate-500">—</div>
                  <div className="text-xs text-slate-500 mt-1">Click Refresh for live prices</div>
                </>
              )}
            </div>

            {/* Total P&L */}
            <div className="bg-slate-800/40 rounded-xl p-6 border border-slate-700/50">
              <div className="text-sm font-medium text-slate-400 mb-2">Total P&L</div>
              {portfolioTotals.itemsWithPrices > 0 ? (
                <>
                  <div className={`text-3xl font-bold ${
                    portfolioTotals.totalPL > 0 ? 'text-emerald-400' :
                    portfolioTotals.totalPL < 0 ? 'text-red-400' :
                    'text-slate-400'
                  }`}>
                    {portfolioTotals.totalPL >= 0 ? '+' : ''}{formatCurrency(portfolioTotals.totalPL)}
                  </div>
                  <div className={`text-sm font-semibold mt-1 ${
                    portfolioTotals.totalPL > 0 ? 'text-emerald-400' :
                    portfolioTotals.totalPL < 0 ? 'text-red-400' :
                    'text-slate-400'
                  }`}>
                    {portfolioTotals.totalPLPercent >= 0 ? '+' : ''}{portfolioTotals.totalPLPercent.toFixed(2)}%
                  </div>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold text-slate-500">—</div>
                  <div className="text-xs text-slate-500 mt-1">Click Refresh for live prices</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Watchlist Items */}
      <div className="space-y-3">

      {sortedItems.map((item) => {
        const addedDescription = formatAddedAt(item.addedAt)
        const riskLabel = item.riskLevel ? item.riskLevel.toUpperCase() : 'RISK'
        const prices = priceData[item.id]
        const balancesPortfolio = hasPortfolio && wouldBalancePortfolio(item.optionType as 'call' | 'put', neededTypes)
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
                  {balancesPortfolio && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      title="This position would help balance your portfolio"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      BALANCER
                    </span>
                  )}
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
                <div className="space-y-2">
                  <div className="text-right">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(item.premium)}</div>
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Added At
                    </div>
                  </div>

                  {prices && prices.currentPremium !== null && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-right">
                      <div className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(prices.currentPremium)}</div>
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Current Price
                      </div>
                      <div className={`mt-2 text-lg font-bold ${
                        prices.plAmount && prices.plAmount > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                        prices.plAmount && prices.plAmount < 0 ? 'text-red-600 dark:text-red-400' :
                        'text-slate-600 dark:text-slate-400'
                      }`}>
                        {prices.plAmount !== null && prices.plPercent !== null && (
                          <>
                            {prices.plAmount >= 0 ? '+' : ''}{formatCurrency(prices.plAmount)}
                            <span className="text-sm ml-1">
                              ({prices.plPercent >= 0 ? '+' : ''}{prices.plPercent.toFixed(1)}%)
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {loadingPrices && !prices && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-right">
                      <div className="text-xs text-slate-500 dark:text-slate-400 italic">Loading...</div>
                    </div>
                  )}
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

      {/* Monty Watchlist Review Modal */}
      <WatchlistReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        items={sortedItems}
        priceData={priceData}
      />
    </div>
  )
}
