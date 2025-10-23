'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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

interface Position {
  id: string
  symbol: string
  unrealized_pl: number | null
  unrealized_pl_percent: number | null
  exit_signal: 'hold' | 'consider' | 'exit_now'
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([])
  const [currentSnapshot, setCurrentSnapshot] = useState<PortfolioSnapshot | null>(null)
  const [topPositions, setTopPositions] = useState<Position[]>([])
  const supabase = createClient()

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true)

        // Create today's snapshot first
        await fetch('/api/portfolio-snapshot', { method: 'POST' })

        // Fetch historical snapshots (last 30 days)
        const snapshotsRes = await fetch('/api/portfolio-snapshot?days=30')
        const snapshotsData = await snapshotsRes.json()

        if (snapshotsData.success && snapshotsData.snapshots) {
          setSnapshots(snapshotsData.snapshots)
          // Set current snapshot to the most recent
          if (snapshotsData.snapshots.length > 0) {
            setCurrentSnapshot(snapshotsData.snapshots[snapshotsData.snapshots.length - 1])
          }
        }

        // Fetch top performing positions
        const { data: positions } = await supabase
          .from('positions')
          .select('id, symbol, unrealized_pl, unrealized_pl_percent, exit_signal')
          .eq('status', 'open')
          .order('unrealized_pl', { ascending: false })
          .limit(5)

        if (positions) {
          setTopPositions(positions)
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
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-emerald-100/70">Loading dashboard...</p>
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
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
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
          <p className="text-emerald-100/70">Here's your portfolio at a glance</p>
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
      </div>
    </div>
  )
}
