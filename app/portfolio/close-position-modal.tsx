'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type Position = Database['public']['Tables']['positions']['Row']

export default function ClosePositionModal({
  position,
  onClose,
  onSuccess,
}: {
  position: Position
  onClose: () => void
  onSuccess: (position: Position) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const [exitPrice, setExitPrice] = useState(
    position.current_price?.toString() || ''
  )

  const calculateRealizedPL = () => {
    if (!exitPrice) return { pl: 0, plPercent: 0 }

    const entryValue = position.entry_price * position.contracts * 100
    const exitValue = parseFloat(exitPrice) * position.contracts * 100
    const pl = exitValue - entryValue
    const plPercent = (pl / entryValue) * 100

    return { pl, plPercent }
  }

  const { pl, plPercent } = calculateRealizedPL()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const exitPriceValue = parseFloat(exitPrice)
      const { pl, plPercent } = calculateRealizedPL()

      const { data, error: updateError } = await supabase
        .from('positions')
        .update({
          status: 'closed',
          exit_price: exitPriceValue,
          exit_date: new Date().toISOString(),
          realized_pl: pl,
          realized_pl_percent: plPercent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', position.id)
        .select()
        .single()

      if (updateError) throw updateError
      if (data) {
        onSuccess(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close position')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Close Position
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
              <div className="text-slate-500 dark:text-slate-400">Type</div>
              <div className="font-semibold text-slate-900 dark:text-white">
                ${position.strike} {position.option_type.toUpperCase()}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Contracts</div>
              <div className="font-semibold text-slate-900 dark:text-white">
                {position.contracts}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Entry Price</div>
              <div className="font-semibold text-slate-900 dark:text-white">
                ${position.entry_price.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Exit Signal Warning */}
          {position.exit_signal === 'exit_now' && (
            <div className="mt-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔴</span>
                <div>
                  <div className="font-bold text-red-700 dark:text-red-400">
                    Exit Recommended
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400">
                    {position.exit_reasons &&
                      (position.exit_reasons as string[]).map(r =>
                        r.replace(/_/g, ' ')
                      ).join(', ')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Exit Price (per contract) *
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              placeholder="3.45"
            />
          </div>

          {/* Realized P&L Preview */}
          {exitPrice && (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6">
              <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                Realized P&L
              </div>
              <div
                className={`text-3xl font-bold ${
                  pl >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                ${pl.toFixed(2)}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {plPercent >= 0 ? '+' : ''}
                {plPercent.toFixed(2)}% return
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Closing...' : 'Close Position'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
