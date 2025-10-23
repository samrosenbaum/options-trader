'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TickerTape } from '@/components/ticker-tape'
import { TradingDeskBanner } from '@/components/trading-desk-banner'
import { motion } from 'framer-motion'
import { Trophy, TrendingDown } from 'lucide-react'

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
  const supabase = createClient()

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true)
        const startTime = Date.now()

        // Run all queries in parallel for much faster loading
        const [snapshotsData, positionsResult, winnersResult, losersResult] = await Promise.all([
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
            .limit(3)
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

        // Ensure garage door animation plays for at least 3 seconds
        const elapsedTime = Date.now() - startTime
        const minLoadTime = 3000 // 3 seconds minimum
        if (elapsedTime < minLoadTime) {
          await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsedTime))
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
        <div className="text-center max-w-4xl mx-auto px-4">
          <img
            src="/garage.gif"
            alt="Opening trading desk"
            className="w-full max-w-3xl mx-auto rounded-lg shadow-2xl"
          />
        </div>
      </div>
    )
  }

  const chartData = snapshots.map(s => ({
    date: formatDate(s.snapshot_date),
    value: s.total_value,
  }))

  const totalPL = (currentSnapshot?.unrealized_pl || 0) + (currentSnapshot?.realized_pl || 0)
  const totalPLPercent = currentSnapshot && currentSnapshot.total_value > 0
    ? (totalPL / (currentSnapshot.total_value - totalPL)) * 100
    : 0

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070E] text-slate-100">
      {/* Live Ticker Tape */}
      <TickerTape />

      {/* Trading Desk Banner */}
      <TradingDeskBanner deskName="Samski Tendies Capital" />

      {/* Background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* Vintage trading desk background - very subtle */}
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: 'url(/trade_desk.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            filter: 'brightness(1.2)',
          }}
        />
        <div className="absolute -top-32 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute bottom-[-18rem] left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[26rem] w-[26rem] rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.75),transparent_60%)]" />
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome back to the trade desk</h1>
          <p className="text-emerald-100/70">Here&apos;s your portfolio at a glance</p>
        </div>

        {/* Portfolio Value Card */}
        <div className="bg-slate-900/40 backdrop-blur-sm rounded-2xl border border-emerald-500/20 p-8 shadow-lg mb-6">
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

        {/* Top Positions & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Positions */}
          <div className="bg-slate-900/40 backdrop-blur-sm rounded-2xl border border-emerald-500/20 p-6 shadow-lg">
            <h2 className="text-xl font-bold text-white mb-4">Top Positions</h2>
            {topPositions.length > 0 ? (
              <div className="space-y-3">
                {topPositions.map((pos) => (
                  <div
                    key={pos.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/50"
                  >
                    <div className="font-semibold text-white">{pos.symbol}</div>
                    <div className="text-right">
                      <div className={`font-bold ${
                        (pos.unrealized_pl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {(pos.unrealized_pl || 0) >= 0 ? '+' : ''}
                        {formatCurrency(pos.unrealized_pl || 0)}
                      </div>
                      <div className={`text-xs ${
                        (pos.unrealized_pl_percent || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {(pos.unrealized_pl_percent || 0) >= 0 ? '+' : ''}
                        {(pos.unrealized_pl_percent || 0).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-slate-400">No open positions</p>
            )}
            <Link
              href="/portfolio"
              className="block mt-4 text-center text-emerald-400 hover:text-emerald-300 text-sm font-medium"
            >
              View All Positions →
            </Link>
          </div>

          {/* Quick Actions */}
          <div className="bg-slate-900/40 backdrop-blur-sm rounded-2xl border border-emerald-500/20 p-6 shadow-lg">
            <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link
                href="/scanner"
                className="block p-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-center transition-colors"
              >
                Run Scanner
              </Link>
              <Link
                href="/portfolio"
                className="block p-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold text-center transition-colors"
              >
                Manage Portfolio
              </Link>
              <Link
                href="/market-info"
                className="block p-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold text-center transition-colors"
              >
                Market Intelligence
              </Link>
              <Link
                href="/macro"
                className="block p-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold text-center transition-colors"
              >
                Macro Indicators
              </Link>
            </div>
          </div>
        </div>

        {/* Trophy Case & Wall of Shame */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Trophy Case - Biggest Winners */}
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
                  <h2 className="text-xl font-bold text-white">Trophy Case</h2>
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
