'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { MontyLoading } from '@/components/monty-loading'

interface WatchlistReviewModalProps {
  isOpen: boolean
  onClose: () => void
  items: Array<{
    id: string
    symbol: string
    optionType: string
    strike: number
    premium: number
    score?: number | null
    riskLevel?: string | null
    daysToExpiration?: number | null
    tradeSummary?: string | null
    expiration: string
    addedAt: string
  }>
  priceData?: Record<string, {
    currentPremium: number | null
    plAmount: number | null
    plPercent: number | null
  }>
}

export default function WatchlistReviewModal({
  isOpen,
  onClose,
  items,
  priceData,
}: WatchlistReviewModalProps) {
  const [analysis, setAnalysis] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const runAnalysis = async () => {
    setIsLoading(true)
    setError('')
    setAnalysis('')

    try {
      const response = await fetch('/api/review-watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, priceData }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to review watchlist')
      }

      setAnalysis(data.analysis)
    } catch (err) {
      console.error('Review error:', err)
      setError(err instanceof Error ? err.message : 'Failed to review watchlist')
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-run analysis when modal opens
  useEffect(() => {
    if (isOpen && !analysis && !isLoading) {
      runAnalysis()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-600">
              <span className="text-lg">🧠</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Monty's Watchlist Review</h2>
              <p className="text-sm text-slate-400">
                Analyzing {items.length} {items.length === 1 ? 'option' : 'options'} from your watchlist
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <MontyLoading />
              <p className="mt-6 text-center text-sm text-slate-400">
                Monty is analyzing your watchlist...
                <br />
                <span className="text-xs">Considering portfolio balance, time decay, and opportunity quality</span>
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/50 bg-red-950/30 p-6 text-center">
              <p className="font-semibold text-red-400">Analysis Failed</p>
              <p className="mt-2 text-sm text-red-300">{error}</p>
              <button
                onClick={runAnalysis}
                className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Try Again
              </button>
            </div>
          )}

          {analysis && !isLoading && (
            <div className="prose prose-invert max-w-none">
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                {analysis}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {analysis && !isLoading && (
          <div className="border-t border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                💡 Tip: Consider entering your highest-priority options first, then reassess
              </p>
              <button
                onClick={onClose}
                className="rounded-lg bg-emerald-600 px-6 py-2.5 font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
