'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'
import AddPositionModal from './add-position-modal'
import ClosePositionModal from './close-position-modal'

type Position = Database['public']['Tables']['positions']['Row']
type UserSettings = Database['public']['Tables']['user_settings']['Row']
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
  const [positionToClose, setPositionToClose] = useState<Position | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const [portfolioSizeInput, setPortfolioSizeInput] = useState<string>('')
  const [dailyBudgetInput, setDailyBudgetInput] = useState<string>('')
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [settingsFeedback, setSettingsFeedback] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    let isMounted = true

    const loadSettings = async () => {
      try {
        setSettingsError(null)
        const { data, error } = await supabase
          .from('user_settings')
          .select('portfolio_size, daily_contract_budget')
          .eq('user_id', user.id)
          .maybeSingle()

        if (!isMounted) {
          return
        }

        if (error && error.code !== 'PGRST116') {
          console.error('Failed to load portfolio settings', error)
          setSettingsError('Unable to load portfolio preferences. Please try again later.')
        }

        if (data) {
          const settings = data as UserSettings
          const portfolioSize =
            settings.portfolio_size !== null && settings.portfolio_size !== undefined
              ? Number(settings.portfolio_size)
              : null
          const dailyBudget =
            settings.daily_contract_budget !== null && settings.daily_contract_budget !== undefined
              ? Number(settings.daily_contract_budget)
              : null
          setPortfolioSizeInput(
            portfolioSize !== null && Number.isFinite(portfolioSize)
              ? String(portfolioSize)
              : '',
          )
          setDailyBudgetInput(
            dailyBudget !== null && Number.isFinite(dailyBudget)
              ? String(dailyBudget)
              : '',
          )
        } else {
          setPortfolioSizeInput('')
          setDailyBudgetInput('')
        }
      } catch (loadError) {
        if (!isMounted) {
          return
        }
        console.error('Failed to fetch user settings', loadError)
        setSettingsError('Unable to load portfolio preferences. Please try again later.')
      } finally {
        if (isMounted) {
          setSettingsLoading(false)
        }
      }
    }

    loadSettings()

    return () => {
      isMounted = false
    }
  }, [supabase, user.id])

  const handleSaveSettings = async () => {
    const parseInput = (value: string) => {
      if (value.trim() === '') {
        return null
      }
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NaN
      }
      return parsed
    }

    setSettingsError(null)
    setSettingsFeedback('idle')

    const portfolioSize = parseInput(portfolioSizeInput)
    if (Number.isNaN(portfolioSize)) {
      setSettingsError('Portfolio size must be a positive number.')
      return
    }

    const dailyBudget = parseInput(dailyBudgetInput)
    if (Number.isNaN(dailyBudget)) {
      setSettingsError('Daily contract budget must be a positive number.')
      return
    }

    try {
      setIsSavingSettings(true)
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            portfolio_size: portfolioSize ?? null,
            daily_contract_budget: dailyBudget ?? null,
          },
          { onConflict: 'user_id' },
        )

      if (error) {
        console.error('Failed to save portfolio settings', error)
        setSettingsError('Unable to save your preferences. Please try again.')
        setSettingsFeedback('error')
        return
      }

      setSettingsFeedback('success')
      setTimeout(() => setSettingsFeedback('idle'), 4000)
    } catch (saveError) {
      console.error('Unexpected error saving portfolio settings', saveError)
      setSettingsError('Unexpected error while saving preferences.')
      setSettingsFeedback('error')
    } finally {
      setIsSavingSettings(false)
    }
  }

  const handleAddPosition = () => {
    setShowAddModal(true)
  }

  const handlePositionAdded = (newPosition: Position) => {
    setPositions([newPosition, ...positions])
    setShowAddModal(false)
  }

  const handlePositionClosed = (closedPosition: Position) => {
    setPositions(
      positions.map((p) =>
        p.id === closedPosition.id ? closedPosition : p
      )
    )
    setPositionToClose(null)
  }

  const handleRefreshPrices = async () => {
    setIsRefreshing(true)
    setRefreshMessage(null)

    try {
      const response = await fetch('/api/portfolio/update-prices', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to update prices')
      }

      const result = await response.json()

      // Refresh positions from database
      const { data: updatedPositions, error } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false })

      if (error) {
        throw new Error('Failed to fetch updated positions')
      }

      setPositions(updatedPositions || [])
      setRefreshMessage(
        `✓ Updated ${result.updated} of ${result.total} positions`
      )

      // Clear message after 3 seconds
      setTimeout(() => setRefreshMessage(null), 3000)
    } catch (error) {
      console.error('Error refreshing prices:', error)
      setRefreshMessage(
        `✗ Error: ${error instanceof Error ? error.message : 'Failed to update prices'}`
      )
    } finally {
      setIsRefreshing(false)
    }
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
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Portfolio Preferences</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Configure the portfolio size and daily contract budget used by the scanner for personalized sizing guidance.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {settingsLoading ? (
                <span className="text-slate-500 dark:text-slate-400">Loading...</span>
              ) : settingsFeedback === 'success' ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Preferences saved</span>
              ) : settingsFeedback === 'error' ? (
                <span className="text-red-600 dark:text-red-400 font-medium">Save failed</span>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Portfolio size (USD)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="100"
                value={portfolioSizeInput}
                onChange={(event) => {
                  setPortfolioSizeInput(event.target.value)
                  setSettingsFeedback('idle')
                }}
                disabled={settingsLoading || isSavingSettings}
                placeholder="e.g. 50000"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2 text-slate-900 dark:text-white shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Daily contract budget
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={dailyBudgetInput}
                onChange={(event) => {
                  setDailyBudgetInput(event.target.value)
                  setSettingsFeedback('idle')
                }}
                disabled={settingsLoading || isSavingSettings}
                placeholder="e.g. 10"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2 text-slate-900 dark:text-white shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div className="flex flex-col justify-end gap-3">
              <button
                onClick={handleSaveSettings}
                disabled={settingsLoading || isSavingSettings}
                className={`inline-flex items-center justify-center rounded-lg px-4 py-2 font-semibold text-white transition-colors ${
                  settingsLoading || isSavingSettings
                    ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isSavingSettings ? 'Saving...' : 'Save preferences'}
              </button>
              {settingsError && (
                <p className="text-sm text-red-600 dark:text-red-400">{settingsError}</p>
              )}
            </div>
          </div>
        </div>

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
          <div className="flex items-center gap-4">
            <button
              onClick={handleAddPosition}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              + Add Position
            </button>

            <button
              onClick={handleRefreshPrices}
              disabled={isRefreshing || openPositions.length === 0}
              className={`flex items-center gap-2 font-semibold py-3 px-6 rounded-lg transition-colors ${
                isRefreshing || openPositions.length === 0
                  ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {isRefreshing ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Updating...
                </>
              ) : (
                <>
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Refresh Prices
                </>
              )}
            </button>

            {refreshMessage && (
              <div
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  refreshMessage.startsWith('✓')
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}
              >
                {refreshMessage}
              </div>
            )}
          </div>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Exit Signal
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Actions
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {position.exit_signal && (() => {
                          const signal = position.exit_signal
                          const urgency = position.exit_urgency_score || 0
                          const reasons = (position.exit_reasons as string[]) || []

                          let bgColor = 'bg-emerald-100 dark:bg-emerald-900/30'
                          let textColor = 'text-emerald-700 dark:text-emerald-400'
                          let emoji = '🟢'
                          let label = 'HOLD'

                          if (signal === 'exit_now') {
                            bgColor = 'bg-red-100 dark:bg-red-900/30'
                            textColor = 'text-red-700 dark:text-red-400'
                            emoji = '🔴'
                            label = 'EXIT NOW'
                          } else if (signal === 'consider') {
                            bgColor = 'bg-amber-100 dark:bg-amber-900/30'
                            textColor = 'text-amber-700 dark:text-amber-400'
                            emoji = '🟡'
                            label = 'CONSIDER'
                          }

                          return (
                            <div className="space-y-1">
                              <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${bgColor} ${textColor}`}>
                                <span>{emoji}</span>
                                <span>{label}</span>
                                <span className="text-[10px]">({urgency})</span>
                              </div>
                              {reasons.length > 0 && (
                                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {reasons.map(r => r.replace(/_/g, ' ')).join(', ')}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        <button
                          onClick={() => setPositionToClose(position)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                            position.exit_signal === 'exit_now'
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          Close
                        </button>
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

      {/* Close Position Modal */}
      {positionToClose && (
        <ClosePositionModal
          position={positionToClose}
          onClose={() => setPositionToClose(null)}
          onSuccess={handlePositionClosed}
        />
      )}
    </div>
  )
}
