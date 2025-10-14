'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type Position = Database['public']['Tables']['positions']['Row']

export default function AddPositionModal({
  userId,
  onClose,
  onSuccess,
}: {
  userId: string
  onClose: () => void
  onSuccess: (position: Position) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const [formData, setFormData] = useState({
    symbol: '',
    strike: '',
    expiration: '',
    option_type: 'call' as 'call' | 'put',
    contracts: '1',
    entry_price: '',
    entry_stock_price: '',
    entry_delta: '',
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error: insertError } = await supabase
        .from('positions')
        .insert({
          user_id: userId,
          symbol: formData.symbol.toUpperCase(),
          strike: parseFloat(formData.strike),
          expiration: formData.expiration,
          option_type: formData.option_type,
          contracts: parseInt(formData.contracts),
          entry_price: parseFloat(formData.entry_price),
          entry_stock_price: parseFloat(formData.entry_stock_price),
          entry_delta: formData.entry_delta ? parseFloat(formData.entry_delta) : null,
          notes: formData.notes || null,
          status: 'open',
        })
        .select()
        .single()

      if (insertError) throw insertError
      if (data) {
        onSuccess(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add position')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Add Position
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

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Symbol *
              </label>
              <input
                type="text"
                required
                value={formData.symbol}
                onChange={(e) =>
                  setFormData({ ...formData, symbol: e.target.value.toUpperCase() })
                }
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                placeholder="TSLA"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Option Type *
              </label>
              <select
                value={formData.option_type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    option_type: e.target.value as 'call' | 'put',
                  })
                }
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="call">Call</option>
                <option value="put">Put</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Strike Price *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.strike}
                onChange={(e) =>
                  setFormData({ ...formData, strike: e.target.value })
                }
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                placeholder="850.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Expiration Date *
              </label>
              <input
                type="date"
                required
                value={formData.expiration}
                onChange={(e) =>
                  setFormData({ ...formData, expiration: e.target.value })
                }
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Contracts *
              </label>
              <input
                type="number"
                min="1"
                required
                value={formData.contracts}
                onChange={(e) =>
                  setFormData({ ...formData, contracts: e.target.value })
                }
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                placeholder="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Entry Price (per contract) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.entry_price}
                onChange={(e) =>
                  setFormData({ ...formData, entry_price: e.target.value })
                }
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                placeholder="3.45"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Stock Price at Entry *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.entry_stock_price}
                onChange={(e) =>
                  setFormData({ ...formData, entry_stock_price: e.target.value })
                }
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                placeholder="842.50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Delta (optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.entry_delta}
                onChange={(e) =>
                  setFormData({ ...formData, entry_delta: e.target.value })
                }
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                placeholder="0.65"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Notes (optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              placeholder="Trade thesis, catalysts, etc."
            />
          </div>

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
              className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Adding...' : 'Add Position'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
