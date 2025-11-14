'use client'

import type { ComponentType } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TickerTape } from '@/components/ticker-tape'
import { TradingDeskBanner } from '@/components/trading-desk-banner'
import { motion } from 'framer-motion'
import { MontyDashboardBrief } from '@/components/monty-dashboard-brief'
import { ArrowUpRight, BarChart3, Briefcase, Compass, ListPlus, Radar, Scan } from 'lucide-react'
import WelcomeSetup from '@/components/onboarding/WelcomeSetup'

interface PortfolioSnapshot {
  id: string
  snapshot_date: string
  total_value: number
  daily_change: number
  daily_change_percent: number
  unrealized_pl: number
  realized_pl: number
  open_positions_count: number
}

interface ClosedPosition {
  id: string
  symbol: string
  strike: number
  option_type: string
  realized_pl: number | null
  realized_pl_percent: number | null
  exit_date: string | null
}

interface Position {
  id: string
  symbol: string
  strike: number
  option_type: string
  unrealized_pl: number | null
  unrealized_pl_percent: number | null
  exit_signal: 'hold' | 'consider' | 'exit_now'
  realized_pl?: number | null
  realized_pl_percent?: number | null
  exit_date?: string | null
}

type QuickActionAccent = 'emerald' | 'sky' | 'violet' | 'amber'

type QuickAction = {
  title: string
  description: string
  href: string
  icon: ComponentType<{ className?: string }>
  accent: QuickActionAccent
}

type OnboardingSuggestion = {
  title: string
  description: string
  href: string
  cta: string
  icon: ComponentType<{ className?: string }>
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([])
  const [currentSnapshot, setCurrentSnapshot] = useState<PortfolioSnapshot | null>(null)
  const [topPositions, setTopPositions] = useState<Position[]>([])
  const [biggestWinners, setBiggestWinners] = useState<ClosedPosition[]>([])
  const [biggestLosers, setBiggestLosers] = useState<ClosedPosition[]>([])
  const [tradingDeskName, setTradingDeskName] = useState<string>('')
  const [isWelcomeSetupOpen, setIsWelcomeSetupOpen] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [showNextStepsGuide, setShowNextStepsGuide] = useState(false)
  const supabase = createClient()

  const quickActions: QuickAction[] = [
    {
      title: 'Run Scanner',
      description: 'Deploy the AI radar to surface asymmetric trade ideas in seconds.',
      href: '/scanner',
      icon: Scan,
      accent: 'emerald'
    },
    {
      title: 'Manage Portfolio',
      description: 'Rebalance, size positions, and monitor risk in one streamlined workspace.',
      href: '/portfolio',
      icon: Briefcase,
      accent: 'sky'
    },
    {
      title: 'Market Intelligence',
      description: 'Digest macro signals, flow data, and volatility regimes at a glance.',
      href: '/market-info',
      icon: BarChart3,
      accent: 'violet'
    },
    {
      title: 'Macro Indicators',
      description: 'Track leading indicators and regime shifts to anticipate the next move.',
      href: '/macro',
      icon: Radar,
      accent: 'amber'
    }
  ]

  const quickActionStyles: Record<QuickActionAccent, { icon: string; border: string; badge: string }> = {
    emerald: {
      icon: 'bg-emerald-100 text-emerald-600',
      border: 'hover:border-emerald-200 hover:bg-emerald-50',
      badge: 'text-emerald-600'
    },
    sky: {
      icon: 'bg-sky-100 text-sky-600',
      border: 'hover:border-sky-200 hover:bg-sky-50',
      badge: 'text-sky-600'
    },
    violet: {
      icon: 'bg-violet-100 text-violet-600',
      border: 'hover:border-violet-200 hover:bg-violet-50',
      badge: 'text-violet-600'
    },
    amber: {
      icon: 'bg-amber-100 text-amber-600',
      border: 'hover:border-amber-200 hover:bg-amber-50',
      badge: 'text-amber-600'
    }
  }

  const signalStyles: Record<Position['exit_signal'], string> = {
    hold: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    consider: 'border-amber-200 bg-amber-50 text-amber-700',
    exit_now: 'border-red-200 bg-red-50 text-red-700'
  }

  const signalLabels: Record<Position['exit_signal'], string> = {
    hold: 'Hold',
    consider: 'Watch Closely',
    exit_now: 'Exit Now'
  }

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true)

        const [snapshotsData, positionsResult, winnersResult, losersResult, settingsResponse] = await Promise.all([
          fetch('/api/portfolio-snapshot', { method: 'POST' })
            .then(() => fetch('/api/portfolio-snapshot?days=30'))
            .then(res => res.json()),
          supabase
            .from('positions')
            .select('id, symbol, strike, option_type, unrealized_pl, unrealized_pl_percent, exit_signal')
            .eq('status', 'open')
            .order('unrealized_pl', { ascending: false })
            .limit(5),
          supabase
            .from('positions')
            .select('id, symbol, strike, option_type, realized_pl, realized_pl_percent, exit_date')
            .eq('status', 'closed')
            .gt('realized_pl', 0)
            .order('realized_pl', { ascending: false })
            .limit(3),
          supabase
            .from('positions')
            .select('id, symbol, strike, option_type, realized_pl, realized_pl_percent, exit_date')
            .eq('status', 'closed')
            .lt('realized_pl', 0)
            .order('realized_pl', { ascending: true })
            .limit(3),
          fetch('/api/user-settings').then(res => res.json())
        ])

        if (snapshotsData.success && snapshotsData.snapshots) {
          setSnapshots(snapshotsData.snapshots)
          if (snapshotsData.snapshots.length > 0) {
            setCurrentSnapshot(snapshotsData.snapshots[snapshotsData.snapshots.length - 1])
          }
        }

        if (positionsResult.data) {
          setTopPositions(positionsResult.data)
        }

        if (winnersResult.data) {
          setBiggestWinners(winnersResult.data)
        }

        if (losersResult.data) {
          setBiggestLosers(losersResult.data)
        }

        if (settingsResponse.settings) {
          const settings = settingsResponse.settings

          setTradingDeskName(
            settings.trading_desk_name || settings.user_name || 'Trading Desk'
          )

          const needsSetup =
            !settings.user_name ||
            settings.user_name.trim() === '' ||
            settings.trading_desk_name === null ||
            settings.trading_desk_name === undefined ||
            settings.trading_desk_name.trim() === ''

          const shouldShowNextStepsGuide =
            typeof settings.show_next_steps_guide === 'boolean'
              ? settings.show_next_steps_guide
              : !needsSetup

          setShowNextStepsGuide(shouldShowNextStepsGuide)
          setIsWelcomeSetupOpen(needsSetup)
        } else {
          setIsWelcomeSetupOpen(true)
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err)
        setIsWelcomeSetupOpen(true)
      } finally {
        setLoading(false)
        setSettingsLoaded(true)
      }
    }

    fetchDashboardData()
  }, [supabase])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const persistNextStepsGuideVisibility = useCallback(async (shouldShow: boolean) => {
    try {
      const response = await fetch('/api/user-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ show_next_steps_guide: shouldShow })
      })

      if (!response.ok) {
        console.error('Failed to update next steps guide visibility')
      }
    } catch (error) {
      console.error('Error updating next steps guide visibility:', error)
    }
  }, [])

  const handleWelcomeComplete = useCallback(
    async (data: { userName: string; portfolioSize: number; dailyBudget: number }) => {
      setIsWelcomeSetupOpen(false)
      setTradingDeskName(prev => prev || `${data.userName}'s Trading Desk`)
      setShowNextStepsGuide(true)

      try {
        const response = await fetch('/api/user-settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            user_name: data.userName,
            trading_desk_name: `${data.userName}'s Trading Desk`,
            portfolio_size: data.portfolioSize,
            daily_contract_budget: data.dailyBudget,
            show_next_steps_guide: true
          })
        })

        if (!response.ok) {
          console.error('Failed to save welcome setup data from dashboard')
        }
      } catch (error) {
        console.error('Error saving welcome setup data from dashboard:', error)
      }
    },
    []
  )

  const handleWelcomeSkip = useCallback(() => {
    setIsWelcomeSetupOpen(false)
    setShowNextStepsGuide(true)
    void persistNextStepsGuideVisibility(true)
  }, [persistNextStepsGuideVisibility])

  const handleDismissNextStepsGuide = useCallback(() => {
    setShowNextStepsGuide(false)
    void persistNextStepsGuideVisibility(false)
  }, [persistNextStepsGuideVisibility])

  const onboardingSuggestions: OnboardingSuggestion[] = [
    {
      title: 'Run a live scan',
      description:
        'Open the AI scanner to see asymmetric setups sized to your account. Ask Monty follow-up questions in real time.',
      href: '/scanner',
      cta: 'Launch Scanner',
      icon: Scan,
    },
    {
      title: 'Start a watchlist',
      description:
        'Save the tickers you keep circling back to. Monty tracks catalysts, IV crush risk, and greeks drift for each.',
      href: '/watchlist',
      cta: 'Open Watchlist',
      icon: ListPlus,
    },
    {
      title: 'Check market pulse',
      description:
        'Review macro sentiment, sector flow, and volatility regimes before you size risk for the day.',
      href: '/market-info',
      cta: 'View Market Intel',
      icon: Compass,
    },
  ]

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm font-medium text-slate-500">Preparing your trading desk…</p>
        </div>
      </div>
    )
  }

  const chartData = snapshots.map(s => ({
    date: formatDate(s.snapshot_date),
    value: s.total_value
  }))

  const totalPL = (currentSnapshot?.unrealized_pl || 0) + (currentSnapshot?.realized_pl || 0)
  const initialInvestment = currentSnapshot ? currentSnapshot.total_value - totalPL : 0
  const totalPLPercent = initialInvestment > 0 ? (totalPL / initialInvestment) * 100 : 0

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <TickerTape />
      <TradingDeskBanner deskName={tradingDeskName || 'Trading Desk'} />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 pb-16 pt-10">
        <div className="flex flex-col gap-10">
          <MontyDashboardBrief />
          {showNextStepsGuide && (
            <div className="rounded-3xl border border-emerald-200/60 bg-white/70 p-6 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-4 border-b border-emerald-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-500">Next steps</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">Dial in your workflow</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Monty lined up a few suggestions so you can get value out of your new desk immediately.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDismissNextStepsGuide}
                  className="self-start rounded-full border border-transparent px-4 py-2 text-sm font-medium text-slate-500 transition hover:border-slate-200 hover:bg-white"
                >
                  Dismiss
                </button>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {onboardingSuggestions.map(suggestion => (
                  <div
                    key={suggestion.title}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4"
                  >
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <suggestion.icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-slate-900">{suggestion.title}</p>
                      <p className="text-sm text-slate-500">{suggestion.description}</p>
                    </div>
                    <Link
                      href={suggestion.href}
                      className="inline-flex items-center text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      {suggestion.cta}
                      <ArrowUpRight className="ml-1 h-4 w-4" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-slate-900">Welcome back to your trade desk</h1>
            <p className="text-sm text-slate-500">Here&apos;s your portfolio at a glance</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Value</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">
                  {formatCurrency(currentSnapshot?.total_value || 0)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Today</p>
                <p
                  className={`mt-2 text-2xl font-semibold ${
                    (currentSnapshot?.daily_change || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {(currentSnapshot?.daily_change || 0) >= 0 ? '+' : ''}
                  {formatCurrency(currentSnapshot?.daily_change || 0)}
                </p>
                <p
                  className={`text-sm ${
                    (currentSnapshot?.daily_change_percent || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {(currentSnapshot?.daily_change_percent || 0) >= 0 ? '+' : ''}
                  {(currentSnapshot?.daily_change_percent || 0).toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Total P&amp;L</p>
                <p className={`mt-2 text-2xl font-semibold ${totalPL >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {totalPL >= 0 ? '+' : ''}
                  {formatCurrency(totalPL)}
                </p>
                <p className={`text-sm ${totalPLPercent >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {totalPLPercent >= 0 ? '+' : ''}
                  {totalPLPercent.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Open Positions</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{currentSnapshot?.open_positions_count || 0}</p>
              </div>
            </div>

            <div className="mt-10">
              {chartData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                      <XAxis dataKey="date" stroke="#94a3b8" style={{ fontSize: '12px' }} />
                      <YAxis
                        stroke="#94a3b8"
                        style={{ fontSize: '12px' }}
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          color: '#0f172a'
                        }}
                        labelStyle={{ color: '#475569', fontWeight: 600 }}
                        formatter={(value: number) => [formatCurrency(value), 'Portfolio Value']}
                      />
                      <Line type="monotone" dataKey="value" stroke="#059669" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
                  No portfolio history yet. Start trading to see your progress!
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, type: 'spring', stiffness: 120 }}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-emerald-500">
                    Active Alpha
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live Feed
                  </span>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Top Positions</h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  {topPositions.length} Active
                </div>
              </div>

              {topPositions.length > 0 ? (
                <div className="mt-6 space-y-3">
                  {topPositions.map((pos, idx) => {
                    const isPositive = (pos.unrealized_pl || 0) >= 0
                    return (
                      <motion.div
                        key={pos.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.15 + idx * 0.05 }}
                        whileHover={{ y: -4 }}
                        className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 transition-all duration-200 hover:border-emerald-200 hover:bg-emerald-50/70"
                      >
                        <div className="relative flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-base font-semibold text-slate-900">
                              #{idx + 1}
                            </div>
                            <div>
                              <div className="flex items-center gap-3 text-base font-semibold text-slate-900">
                                <span>{pos.symbol}</span>
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] tracking-wide text-slate-500">
                                  {pos.option_type.toUpperCase()} ${pos.strike}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-medium uppercase tracking-[0.25em] text-[10px] sm:text-[11px] ${signalStyles[pos.exit_signal]}`}
                                >
                                  {signalLabels[pos.exit_signal]}
                                </span>
                                <span className="text-slate-400">Last mark moments ago</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className={`text-base font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                              {isPositive ? '+' : ''}
                              {formatCurrency(pos.unrealized_pl || 0)}
                            </p>
                            <p className={`mt-1 text-xs font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                              {isPositive ? '+' : ''}
                              {(pos.unrealized_pl_percent || 0).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
                  <span className="text-[10px] uppercase tracking-[0.4em] text-slate-400">No signals yet</span>
                  <p className="mt-3 max-w-xs text-sm text-slate-500">
                    As soon as positions go live, they will populate this interactive leaderboard.
                  </p>
                </div>
              )}

              <Link
                href="/portfolio"
                className="group relative mt-8 inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 transition-colors hover:text-emerald-700"
              >
                View full portfolio intelligence
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-1" />
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18, type: 'spring', stiffness: 120 }}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-6 space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400">
                  Command Center
                </span>
                <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Quick Actions</h2>
              </div>

              <div className="space-y-4">
                {quickActions.map((action) => {
                  const Icon = action.icon
                  const accent = quickActionStyles[action.accent]
                  return (
                    <Link
                      key={action.title}
                      href={action.href}
                      className={`group block rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${accent.border}`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent.icon}`}>
                            <Icon className="h-6 w-6" />
                          </span>
                          <div>
                            <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{action.title}</h3>
                            <p className="mt-1 text-sm text-slate-500">{action.description}</p>
                          </div>
                        </div>
                        <ArrowUpRight className="h-5 w-5 text-slate-400 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-slate-600" />
                      </div>
                      <span className={`mt-4 inline-block text-xs font-semibold uppercase tracking-[0.3em] ${accent.badge}`}>
                        Jump in
                      </span>
                    </Link>
                  )
                })}
              </div>
            </motion.div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm"
            >
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900">Wall of Gains</h2>
                <p className="text-sm text-slate-500">Your greatest victories</p>
              </div>

              {biggestWinners.length > 0 ? (
                <div className="space-y-3">
                  {biggestWinners.map((position, idx) => (
                    <motion.div
                      key={position.id}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.08 }}
                      className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                              idx === 0
                                ? 'bg-emerald-200 text-emerald-700'
                                : idx === 1
                                ? 'bg-emerald-100 text-emerald-600'
                                : 'bg-emerald-50 text-emerald-600'
                            }`}
                          >
                            #{idx + 1}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">
                              {position.symbol} ${position.strike} {position.option_type.toUpperCase()}
                            </div>
                            <div className="text-xs text-slate-500">
                              {position.exit_date && new Date(position.exit_date).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-emerald-600">
                            +{formatCurrency(position.realized_pl || 0)}
                          </div>
                          <div className="text-sm font-medium text-emerald-500">
                            +{(position.realized_pl_percent || 0).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 py-10 text-sm text-emerald-600">
                  No closed winners yet. Keep trading!
                </div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.26 }}
              className="rounded-3xl border border-red-100 bg-white p-6 shadow-sm"
            >
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900">Lessons Learned</h2>
                <p className="text-sm text-slate-500">Use losses to sharpen the playbook</p>
              </div>

              {biggestLosers.length > 0 ? (
                <div className="space-y-3">
                  {biggestLosers.map((position, idx) => (
                    <motion.div
                      key={position.id}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.08 }}
                      className="rounded-2xl border border-red-100 bg-red-50/70 p-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-200 text-sm font-bold text-red-700">
                            #{idx + 1}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">
                              {position.symbol} ${position.strike} {position.option_type.toUpperCase()}
                            </div>
                            <div className="text-xs text-slate-500">
                              {position.exit_date && new Date(position.exit_date).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-red-600">
                            {formatCurrency(position.realized_pl || 0)}
                          </div>
                          <div className="text-sm font-medium text-red-500">
                            {(position.realized_pl_percent || 0).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-2xl border border-dashed border-red-200 bg-red-50/70 py-10 text-sm text-red-500">
                  No losses to show. Perfect track record!
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
      <WelcomeSetup
        open={isWelcomeSetupOpen && !loading && settingsLoaded}
        onComplete={handleWelcomeComplete}
        onSkip={handleWelcomeSkip}
      />
    </div>
  )
}
