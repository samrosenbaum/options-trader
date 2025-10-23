'use client'

import { useState } from 'react'
import type { Database } from '@/lib/types/database.types'
import ReactMarkdown from 'react-markdown'

type Position = Database['public']['Tables']['positions']['Row']

export default function PositionAnalysisModal({
  position,
  onClose,
}: {
  position: Position
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    setAnalysis(null)

    try {
      const now = new Date()
      const entryDate = new Date(position.entry_date)
      const expirationDate = new Date(position.expiration)

      const daysHeld = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))
      const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      const response = await fetch('/api/analyze-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: position.symbol,
          strike: position.strike,
          expiration: position.expiration,
          option_type: position.option_type,
          contracts: position.contracts,
          entry_price: position.entry_price,
          entry_date: position.entry_date,
          entry_stock_price: position.entry_stock_price,
          current_price: position.current_price,
          current_stock_price: position.current_stock_price,
          unrealized_pl: position.unrealized_pl,
          unrealized_pl_percent: position.unrealized_pl_percent,
          entry_delta: position.entry_delta,
          entry_theta: position.entry_theta,
          current_delta: position.current_delta,
          current_theta: position.current_theta,
          exit_signal: position.exit_signal,
          exit_urgency_score: position.exit_urgency_score,
          exit_reasons: position.exit_reasons,
          days_held: daysHeld,
          days_until_expiration: daysUntilExpiration,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setAnalysis(data.analysis)
      } else {
        setError(data.error || 'Failed to analyze position')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze position')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-8 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Ask Monty: Position Analysis
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Position Summary */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Symbol</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                {position.symbol}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Position</div>
              <div className="font-semibold text-slate-900 dark:text-white">
                ${position.strike} {position.option_type.toUpperCase()}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">P&L</div>
              <div className={`font-bold ${
                (position.unrealized_pl || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}>
                ${(position.unrealized_pl || 0).toFixed(2)} ({(position.unrealized_pl_percent || 0).toFixed(1)}%)
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Exit Signal</div>
              <div className={`font-semibold ${
                position.exit_signal === 'exit_now' ? 'text-red-600' :
                position.exit_signal === 'consider' ? 'text-amber-600' :
                'text-emerald-600'
              }`}>
                {position.exit_signal === 'exit_now' ? 'Exit Now' :
                 position.exit_signal === 'consider' ? 'Consider Exit' :
                 'Hold'}
              </div>
            </div>
          </div>
        </div>

        {!analysis && !loading && (
          <div className="text-center py-12">
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Get expert AI analysis on whether to hold, exit, or double down on this position
            </p>
            <button
              onClick={handleAnalyze}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition-all shadow-lg"
            >
              Ask Monty for Advice
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
              <p className="text-slate-600 dark:text-slate-400">
                Monty is analyzing your position...
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {analysis && (
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <ReactMarkdown>{analysis}</ReactMarkdown>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
