'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'
import AddPositionModal from './add-position-modal'

type Position = Database['public']['Tables']['positions']['Row']
type User = { id: string; email?: string }

export default function PortfolioClient({
  initialPositions,
  user,
}: {
  initialPositions: Position[]
  user: User
}) {
  const [positions, setPositions] = useState<Position[]>(initialPositions)
  const [showAddModal, setShowAddModal] = useState(false)
  const supabase = createClient()

  const handleAddPosition = () => {
    setShowAddModal(true)
  }

  const handlePositionAdded = (newPosition: Position) => {
    setPositions([newPosition, ...positions])
    setShowAddModal(false)
  }

  const openPositions = positions.filter((p) => p.status === 'open')
  const closedPositions = positions.filter((p) => p.status === 'closed')

  const totalUnrealizedPL = openPositions.reduce(
    (sum, p) => sum + (p.unrealized_pl || 0),
    0
  )

  const totalRealizedPL = closedPositions.reduce(
    (sum, p) => sum + (p.realized_pl || 0),
    0
  )

  const totalPL = totalUnrealizedPL + totalRealizedPL

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">

      {/* Summary Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Open Positions
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {openPositions.length}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Unrealized P&L
            </div>
            <div
              className={`text-3xl font-bold ${
                totalUnrealizedPL >= 0
                  ? 'text-emerald-600'
                  : 'text-red-600'
              }`}
            >
              ${totalUnrealizedPL.toFixed(2)}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Realized P&L
            </div>
            <div
              className={`text-3xl font-bold ${
                totalRealizedPL >= 0
                  ? 'text-emerald-600'
                  : 'text-red-600'
              }`}
            >
              ${totalRealizedPL.toFixed(2)}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Total P&L
            </div>
            <div
              className={`text-3xl font-bold ${
                totalPL >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              ${totalPL.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mb-6">
          <button
            onClick={handleAddPosition}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            + Add Position
          </button>
        </div>

        {/* Open Positions */}
        {openPositions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Open Positions ({openPositions.length})
            </h2>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Strike
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Expiration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Contracts
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Entry
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Current
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      P&L
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {openPositions.map((position) => (
                    <tr key={position.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">
                        {position.symbol}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            position.option_type === 'call'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                        >
                          {position.option_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        ${position.strike}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        {new Date(position.expiration).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        {position.contracts}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        ${position.entry_price.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                        ${position.current_price?.toFixed(2) || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div
                          className={`font-semibold ${
                            (position.unrealized_pl || 0) >= 0
                              ? 'text-emerald-600'
                              : 'text-red-600'
                          }`}
                        >
                          ${position.unrealized_pl?.toFixed(2) || '—'}
                        </div>
                        {position.unrealized_pl_percent && (
                          <div className="text-xs text-slate-500">
                            ({position.unrealized_pl_percent.toFixed(1)}%)
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {positions.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
            <div className="text-slate-400 mb-4">
              <svg
                className="mx-auto h-12 w-12"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              No positions yet
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Start tracking your options trades by adding your first position.
            </p>
            <button
              onClick={handleAddPosition}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Add Your First Position
            </button>
          </div>
        )}
      </div>

      {/* Add Position Modal */}
      {showAddModal && (
        <AddPositionModal
          userId={user.id}
          onClose={() => setShowAddModal(false)}
          onSuccess={handlePositionAdded}
        />
      )}
    </div>
  )
}
