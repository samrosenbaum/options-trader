'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TickerTape } from '@/components/ticker-tape'
import { TradingDeskBanner } from '@/components/trading-desk-banner'
import { motion } from 'framer-motion'
import {
  Trophy,
  TrendingDown,
  ArrowUpRight,
  Scan,
  Briefcase,
  BarChart3,
  Radar
} from 'lucide-react'

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

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([])
  const [currentSnapshot, setCurrentSnapshot] = useState<PortfolioSnapshot | null>(null)
  const [topPositions, setTopPositions] = useState<Position[]>([])
  const [biggestWinners, setBiggestWinners] = useState<ClosedPosition[]>([])
  const [biggestLosers, setBiggestLosers] = useState<ClosedPosition[]>([])
  const [tradingDeskName, setTradingDeskName] = useState<string>('')
  const supabase = createClient()

  const quickActions = [
    {
      title: 'Run Scanner',
      description: 'Deploy the AI radar to surface asymmetric trade ideas in seconds.',
      href: '/scanner',
      icon: Scan,
      accent: {
        ring: 'ring-emerald-500/20 group-hover:ring-emerald-400/60',
        glow: 'from-emerald-500/30 via-emerald-500/0 to-transparent',
        icon: 'bg-emerald-500/10 text-emerald-300',
        chip: 'from-emerald-400/20 via-emerald-500/10 to-transparent'
      }
    },
    {
      title: 'Manage Portfolio',
      description: 'Rebalance, size positions, and monitor risk in one streamlined workspace.',
      href: '/portfolio',
      icon: Briefcase,
      accent: {
        ring: 'ring-sky-500/20 group-hover:ring-sky-400/50',
        glow: 'from-sky-500/20 via-sky-500/0 to-transparent',
        icon: 'bg-sky-500/10 text-sky-300',
        chip: 'from-sky-400/20 via-sky-500/10 to-transparent'
      }
    },
    {
      title: 'Market Intelligence',
      description: 'Digest macro signals, flow data, and volatility regimes at a glance.',
      href: '/market-info',
      icon: BarChart3,
      accent: {
        ring: 'ring-purple-500/20 group-hover:ring-purple-400/50',
        glow: 'from-purple-500/20 via-purple-500/0 to-transparent',
        icon: 'bg-purple-500/10 text-purple-300',
        chip: 'from-purple-400/20 via-purple-500/10 to-transparent'
      }
    },
    {
      title: 'Macro Indicators',
      description: 'Track leading indicators and regime shifts to anticipate the next move.',
      href: '/macro',
      icon: Radar,
      accent: {
        ring: 'ring-amber-500/20 group-hover:ring-amber-400/50',
        glow: 'from-amber-500/20 via-amber-500/0 to-transparent',
        icon: 'bg-amber-500/10 text-amber-300',
        chip: 'from-amber-400/20 via-amber-500/10 to-transparent'
      }
    }
  ]

  const signalStyles: Record<Position['exit_signal'], string> = {
    hold: 'border-emerald-400/40 text-emerald-300 bg-emerald-500/10',
    consider: 'border-amber-400/40 text-amber-200 bg-amber-500/10',
    exit_now: 'border-red-400/40 text-red-200 bg-red-500/10'
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

        // Run all queries in parallel for much faster loading
        const [snapshotsData, positionsResult, winnersResult, losersResult, settingsResponse] = await Promise.all([
          // Create snapshot and fetch historical data
          fetch('/api/portfolio-snapshot', { method: 'POST' })
            .then(() => fetch('/api/portfolio-snapshot?days=30'))
            .then(res => res.json()),

          // Fetch top performing open positions
          supabase
            .from('positions')
            .select('id, symbol, strike, option_type, unrealized_pl, unrealized_pl_percent, exit_signal')
            .eq('status', 'open')
            .order('unrealized_pl', { ascending: false })
            .limit(5),

          // Fetch biggest winners
          supabase
            .from('positions')
            .select('id, symbol, strike, option_type, realized_pl, realized_pl_percent, exit_date')
            .eq('status', 'closed')
            .gt('realized_pl', 0)
            .order('realized_pl', { ascending: false })
            .limit(3),

          // Fetch biggest losers
          supabase
            .from('positions')
            .select('id, symbol, strike, option_type, realized_pl, realized_pl_percent, exit_date')
            .eq('status', 'closed')
            .lt('realized_pl', 0)
            .order('realized_pl', { ascending: true })
            .limit(3),

          // Fetch user settings for trading desk name
          fetch('/api/user-settings').then(res => res.json())
        ])

        // Update state with results
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
          setTradingDeskName(settingsResponse.settings.trading_desk_name || settingsResponse.settings.user_name || 'Trading Desk')
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [supabase])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05070E]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-emerald-100/70">Preparing your trading desk...</p>
        </div>
      </div>
    )
  }

  const chartData = snapshots.map(s => ({
    date: formatDate(s.snapshot_date),
    value: s.total_value,
  }))

  const totalPL = (currentSnapshot?.unrealized_pl || 0) + (currentSnapshot?.realized_pl || 0)
  // Calculate percentage based on initial investment (total value minus total P&L)
  const initialInvestment = currentSnapshot ? currentSnapshot.total_value - totalPL : 0
  const totalPLPercent = initialInvestment > 0
    ? (totalPL / initialInvestment) * 100
    : 0

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070E] text-slate-100">
      {/* Live Ticker Tape */}
      <TickerTape />

      {/* Trading Desk Banner */}
      <TradingDeskBanner deskName={tradingDeskName || 'Trading Desk'} />

      {/* Background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.75),transparent_60%)]" />

        {/* Blur orbs - subtle accents */}
        <div className="absolute -top-32 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute bottom-[-18rem] left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[26rem] w-[26rem] rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome back to your trade desk</h1>
          <p className="text-emerald-100/70">Here&apos;s your portfolio at a glance</p>
        </div>

        {/* Portfolio Value Card */}
        <div className="relative bg-gradient-to-br from-slate-900/80 via-emerald-900/30 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-emerald-500/40 p-8 shadow-[0_8px_32px_rgba(16,185,129,0.2),0_0_0_1px_rgba(16,185,129,0.1)_inset] mb-6 overflow-hidden transition-all duration-300 hover:shadow-[0_12px_48px_rgba(16,185,129,0.25),0_0_0_1px_rgba(16,185,129,0.15)_inset] hover:scale-[1.01] hover:border-emerald-500/50">
          {/* Vintage trading desk background */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'url(/trade_desk.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              filter: 'brightness(1.1) saturate(0.8)',
            }}
          ></div>

          {/* Glass reflection effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-40"></div>
          <div className="absolute inset-0 bg-gradient-to-tl from-emerald-400/5 via-transparent to-transparent"></div>

          {/* Gradient accent glow */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"></div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"></div>
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl"></div>

          <div className="relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {/* Total Value */}
            <div>
              <div className="text-sm text-slate-400 mb-1">Total Value</div>
              <div className="text-3xl font-bold text-white">
                {formatCurrency(currentSnapshot?.total_value || 0)}
              </div>
            </div>

            {/* Daily Change */}
            <div>
              <div className="text-sm text-slate-400 mb-1">Today</div>
              <div className={`text-2xl font-bold ${
                (currentSnapshot?.daily_change || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {(currentSnapshot?.daily_change || 0) >= 0 ? '+' : ''}
                {formatCurrency(currentSnapshot?.daily_change || 0)}
              </div>
              <div className={`text-sm ${
                (currentSnapshot?.daily_change_percent || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {(currentSnapshot?.daily_change_percent || 0) >= 0 ? '+' : ''}
                {(currentSnapshot?.daily_change_percent || 0).toFixed(2)}%
              </div>
            </div>

            {/* Total P&L */}
            <div>
              <div className="text-sm text-slate-400 mb-1">Total P&L</div>
              <div className={`text-2xl font-bold ${
                totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {totalPL >= 0 ? '+' : ''}{formatCurrency(totalPL)}
              </div>
              <div className={`text-sm ${
                totalPLPercent >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {totalPLPercent >= 0 ? '+' : ''}{totalPLPercent.toFixed(2)}%
              </div>
            </div>

            {/* Open Positions */}
            <div>
              <div className="text-sm text-slate-400 mb-1">Open Positions</div>
              <div className="text-2xl font-bold text-white">
                {currentSnapshot?.open_positions_count || 0}
              </div>
            </div>
          </div>

          {/* Portfolio Chart */}
          {chartData.length > 0 && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    style={{ fontSize: '12px' }}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f1f5f9',
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Portfolio Value']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {chartData.length === 0 && (
            <div className="h-64 flex items-center justify-center text-slate-400">
              <p>No portfolio history yet. Start trading to see your progress!</p>
            </div>
          )}
          </div>
        </div>

        {/* Top Positions & Quick Actions */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-6">
          {/* Top Positions */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, type: 'spring', stiffness: 120 }}
            className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-slate-950/70 shadow-[0_25px_70px_rgba(16,185,129,0.15)] backdrop-blur-xl"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-slate-950/60 to-slate-950/90" />
            <div className="absolute -top-32 -right-28 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl opacity-60" />
            <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />

            <div className="relative p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.38em] text-emerald-300/70">
                    Active Alpha
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.7)] animate-pulse" />
                    Live Feed
                  </span>
                  <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Top Positions</h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 shadow-inner shadow-emerald-500/20">
                  <span className="h-2 w-2 rounded-full bg-emerald-300 animate-ping" />
                  {topPositions.length} Active
                </div>
              </div>

              {topPositions.length > 0 ? (
                <div className="mt-6 space-y-3">
                  {topPositions.map((pos, idx) => {
                    const isPositive = (pos.unrealized_pl || 0) >= 0
                    const gradient = isPositive
                      ? 'from-emerald-500/25 via-emerald-500/0 to-transparent'
                      : 'from-red-500/25 via-red-500/0 to-transparent'

                    return (
                      <motion.div
                        key={pos.id}
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 + idx * 0.08 }}
                        whileHover={{ y: -3, scale: 1.01 }}
                        className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/70 px-5 py-4 backdrop-blur"
                      >
                        <div className={`absolute inset-0 bg-gradient-to-r ${gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />
                        <div className="relative flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 text-lg font-semibold text-white">
                              <span>#{idx + 1}</span>
                              <span className="absolute inset-x-2 -bottom-5 h-10 rounded-full bg-emerald-500/30 blur-xl opacity-60" />
                            </div>
                            <div>
                              <div className="flex items-center gap-3 text-base font-semibold text-white">
                                <span>{pos.symbol}</span>
                                <span className="rounded-full border border-slate-700/60 bg-slate-800/60 px-2 py-0.5 text-[11px] tracking-wide text-slate-300">
                                  {pos.option_type.toUpperCase()} ${pos.strike}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-medium uppercase tracking-[0.25em] text-[10px] sm:text-[11px] transition-colors duration-300 ${signalStyles[pos.exit_signal]}`}
                                >
                                  {signalLabels[pos.exit_signal]}
                                </span>
                                <span className="text-slate-500/80">Last mark updated moments ago</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className={`text-base font-semibold ${isPositive ? 'text-emerald-300' : 'text-red-300'}`}>
                              {isPositive ? '+' : ''}
                              {formatCurrency(pos.unrealized_pl || 0)}
                            </p>
                            <p className={`mt-1 text-xs font-medium ${isPositive ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
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
                <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/50 px-6 py-12 text-center">
                  <span className="text-[10px] uppercase tracking-[0.4em] text-slate-500">No Signals Yet</span>
                  <p className="mt-3 max-w-xs text-sm text-slate-400">
                    As soon as positions go live, they will populate this interactive leaderboard.
                  </p>
                </div>
              )}

              <Link
                href="/portfolio"
                className="group/link relative mt-8 inline-flex items-center gap-2 text-sm font-semibold text-emerald-200 transition-colors duration-300 hover:text-emerald-50"
              >
                View full portfolio intelligence
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover/link:-translate-y-0.5 group-hover/link:translate-x-1" />
              </Link>
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25, type: 'spring', stiffness: 120 }}
            className="relative overflow-hidden rounded-3xl border border-slate-800/60 bg-slate-950/70 shadow-[0_25px_60px_rgba(14,116,144,0.12)] backdrop-blur-xl"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-slate-800/80 via-slate-950/70 to-slate-950/90" />
            <div className="absolute -top-24 right-0 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl opacity-70" />

            <div className="relative p-6 sm:p-8">
              <div className="mb-6 space-y-3">
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-500">
                  Command Center
                  <span className="h-1 w-1 rounded-full bg-slate-500/60" />
                  Instant Access
                </span>
                <h2 className="text-2xl font-semibold text-white sm:text-3xl">Quick Actions</h2>
              </div>

              <div className="space-y-4">
                {quickActions.map((action, idx) => {
                  const Icon = action.icon
                  return (
                    <Link
                      key={action.title}
                      href={action.href}
                      className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    >
                      <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 + idx * 0.05 }}
                        whileHover={{ y: -4, scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        className={`relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/70 p-5 sm:p-6 transition-all duration-300 backdrop-blur ring-1 ring-inset ${action.accent.ring}`}
                      >
                        <div className={`absolute inset-0 bg-gradient-to-r ${action.accent.glow} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />
                        <div className="relative flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className={`relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 ${action.accent.icon}`}>
                              <Icon className="h-6 w-6" />
                              <span className={`pointer-events-none absolute inset-x-2 -bottom-6 h-10 bg-gradient-to-r ${action.accent.chip} blur-xl opacity-60`} />
                            </div>
                            <div>
                              <h3 className="text-base font-semibold text-white sm:text-lg">{action.title}</h3>
                              <p className="mt-1 text-xs text-slate-400 sm:text-sm">{action.description}</p>
                            </div>
                          </div>
                          <ArrowUpRight className="h-5 w-5 text-slate-500 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-white" />
                        </div>
                      </motion.div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Wall of Gains & Wall of Shame */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Wall of Gains - Biggest Winners */}
          <motion.div
            initial={{ opacity: 0, y: 20, rotateX: 10 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.6, delay: 0.2, type: "spring" }}
            whileHover={{
              rotateY: 2,
              rotateX: -2,
              scale: 1.02,
              transition: { duration: 0.3 }
            }}
            style={{
              transformStyle: "preserve-3d",
              perspective: "1000px"
            }}
            className="bg-gradient-to-br from-amber-500/10 via-slate-900/80 to-slate-900/80 backdrop-blur-sm rounded-2xl border border-amber-500/20 p-6 shadow-[0_20px_50px_rgba(217,119,6,0.3)] hover:shadow-[0_30px_60px_rgba(217,119,6,0.4)] relative overflow-hidden transition-shadow duration-300"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-amber-400/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-xl bg-amber-500/20">
                  <Trophy className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Wall of Gains</h2>
                  <p className="text-sm text-slate-400">Your greatest victories</p>
                </div>
              </div>

              {biggestWinners.length > 0 ? (
                <div className="space-y-3">
                  {biggestWinners.map((position, idx) => (
                    <motion.div
                      key={position.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.1 }}
                      className="relative group"
                    >
                      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:border-amber-500/50 transition-all">
                        <div className="flex items-center gap-4">
                          <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                            idx === 0 ? 'bg-amber-500/20 text-amber-300' :
                            idx === 1 ? 'bg-slate-400/20 text-slate-300' :
                            'bg-orange-500/20 text-orange-300'
                          }`}>
                            #{idx + 1}
                          </div>
                          <div>
                            <div className="font-semibold text-white">
                              {position.symbol} ${position.strike} {position.option_type.toUpperCase()}
                            </div>
                            <div className="text-xs text-slate-400">
                              {position.exit_date && new Date(position.exit_date).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-emerald-400">
                            +{formatCurrency(position.realized_pl || 0)}
                          </div>
                          <div className="text-sm text-emerald-400">
                            +{(position.realized_pl_percent || 0).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <p>No closed winners yet. Keep trading!</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Wall of Shame - Biggest Losers */}
          <motion.div
            initial={{ opacity: 0, y: 20, rotateX: 10 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.6, delay: 0.3, type: "spring" }}
            whileHover={{
              rotateY: -2,
              rotateX: -2,
              scale: 1.02,
              transition: { duration: 0.3 }
            }}
            style={{
              transformStyle: "preserve-3d",
              perspective: "1000px"
            }}
            className="bg-gradient-to-br from-red-500/10 via-slate-900/80 to-slate-900/80 backdrop-blur-sm rounded-2xl border border-red-500/20 p-6 shadow-[0_20px_50px_rgba(239,68,68,0.3)] hover:shadow-[0_30px_60px_rgba(239,68,68,0.4)] relative overflow-hidden transition-shadow duration-300"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-xl bg-red-500/20">
                  <TrendingDown className="h-6 w-6 text-red-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Wall of Shame</h2>
                  <p className="text-sm text-slate-400">Learn from these lessons</p>
                </div>
              </div>

              {biggestLosers.length > 0 ? (
                <div className="space-y-3">
                  {biggestLosers.map((position, idx) => (
                    <motion.div
                      key={position.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.1 }}
                      className="relative group"
                    >
                      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:border-red-500/50 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20 text-red-300 font-bold text-sm">
                            #{idx + 1}
                          </div>
                          <div>
                            <div className="font-semibold text-white">
                              {position.symbol} ${position.strike} {position.option_type.toUpperCase()}
                            </div>
                            <div className="text-xs text-slate-400">
                              {position.exit_date && new Date(position.exit_date).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-red-400">
                            {formatCurrency(position.realized_pl || 0)}
                          </div>
                          <div className="text-sm text-red-400">
                            {(position.realized_pl_percent || 0).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <p>No losses to show. Perfect track record!</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
