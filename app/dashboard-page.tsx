'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TickerTape } from '@/components/ticker-tape'
import { TradingDeskBanner } from '@/components/trading-desk-banner'
import { motion } from 'framer-motion'

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
          setTradingDeskName(
            settingsResponse.settings.trading_desk_name || settingsResponse.settings.user_name || 'Trading Desk'
          )
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
  const initialInvestment = currentSnapshot ? currentSnapshot.total_value - totalPL : 0
  const totalPLPercent = initialInvestment > 0 ? (totalPL / initialInvestment) * 100 : 0

  const dailyChange = currentSnapshot?.daily_change || 0
  const dailyChangePercent = currentSnapshot?.daily_change_percent || 0

  const sentiment = dailyChange > 0 ? 'Bullish' : dailyChange < 0 ? 'Cautious' : 'Balanced'
  const sentimentTone =
    sentiment === 'Bullish'
      ? 'Momentum is building as buyers stay in control. Consider letting winners ride but tighten risk.'
      : sentiment === 'Cautious'
        ? 'Sellers are leaning in. Prioritize defense, tighten stops, and be selective on new entries.'
        : 'Markets are balanced. Stay patient and stalk high-conviction setups.'

  const trendLeaders = topPositions.slice(0, 3)
  const featuredWinners = biggestWinners.slice(0, 2)
  const featuredLosers = biggestLosers.slice(0, 2)

  const upcomingEvents = [
    {
      label: 'FOMC Minutes',
      time: 'Today · 2:00 PM ET',
      impact: 'High impact on USD pairs',
    },
    {
      label: 'European CPI Flash',
      time: 'Tomorrow · 5:00 AM ET',
      impact: 'Watch EUR-cross volatility',
    },
    {
      label: 'Nonfarm Payrolls',
      time: 'Fri · 8:30 AM ET',
      impact: 'Expect spreads to widen pre-release',
    },
  ]

  const learningPrompt =
    dailyChangePercent > 1.5
      ? 'Your portfolio thrives in momentum bursts. Log how you sized winners today and replicate that discipline.'
      : dailyChangePercent < -1
        ? 'Review whether losses were news-driven. Tag trades impacted by macro surprises to sharpen your playbook.'
        : 'You’re trading inside a balanced tape. This is a perfect moment to journal the setups you’re stalking next.'

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070E] text-slate-100">
      <TickerTape />
      <TradingDeskBanner deskName={tradingDeskName || 'Trading Desk'} />

      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_65%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(15,23,42,0.75),transparent_55%)]" />
        <div className="absolute -top-40 left-1/4 h-[32rem] w-[32rem] rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute top-1/2 -right-40 h-[26rem] w-[26rem] rounded-full bg-sky-500/15 blur-3xl" />
        <div className="absolute bottom-[-18rem] -left-24 h-[30rem] w-[30rem] rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
          <section className="relative overflow-hidden rounded-3xl border border-white/5 bg-white/5 px-8 py-10 shadow-[0_30px_80px_rgba(15,23,42,0.45)] backdrop-blur-3xl">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.2),_transparent_70%)] opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
            <div className="relative z-10 space-y-10">
              <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.28em] text-emerald-200/70">Today&apos;s narrative</p>
                  <h1 className="mt-2 text-3xl md:text-4xl font-semibold text-white">
                    {sentiment === 'Bullish' && 'Green energy flows through the desk.'}
                    {sentiment === 'Cautious' && 'Markets are leaning defensive.'}
                    {sentiment === 'Balanced' && 'Calm seas with selective swells.'}
                  </h1>
                  <p className="mt-4 text-sm md:text-base text-emerald-100/80 max-w-xl leading-relaxed">
                    {sentimentTone}
                  </p>
                </div>
                <div className="min-w-[14rem] rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-4 text-sm font-medium text-emerald-100 shadow-inner">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-emerald-200/70">
                    <span>Market pulse</span>
                    <span>{sentiment}</span>
                  </div>
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-emerald-500/20">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(Math.abs(dailyChangePercent), 8) * 12.5}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className={`rounded-full ${
                        sentiment === 'Bullish'
                          ? 'bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-500'
                          : sentiment === 'Cautious'
                            ? 'bg-gradient-to-r from-orange-300 via-amber-400 to-red-500'
                            : 'bg-gradient-to-r from-slate-200 via-emerald-200 to-cyan-300'
                      }`}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-emerald-100/70">
                    <div>
                      <p className="uppercase tracking-[0.12em] text-emerald-200/60">Today</p>
                      <p className={`mt-1 font-semibold ${dailyChange >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                        {dailyChange >= 0 ? '+' : ''}{formatCurrency(dailyChange)}
                      </p>
                    </div>
                    <div>
                      <p className="uppercase tracking-[0.12em] text-emerald-200/60">Return</p>
                      <p className={`mt-1 font-semibold ${dailyChangePercent >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                        {dailyChangePercent >= 0 ? '+' : ''}{dailyChangePercent.toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="uppercase tracking-[0.12em] text-emerald-200/60">Open risk</p>
                      <p className="mt-1 font-semibold text-white">{currentSnapshot?.open_positions_count || 0} trades</p>
                    </div>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
                <motion.div whileHover={{ y: -4 }} className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-xl">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300/80">Portfolio value</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{formatCurrency(currentSnapshot?.total_value || 0)}</p>
                  <p className="mt-3 text-xs text-slate-300/70 leading-relaxed">
                    This is your live book including open P&amp;L and settled gains.
                  </p>
                </motion.div>

                <motion.div whileHover={{ y: -4 }} className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-xl">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300/80">Lifetime P&amp;L</p>
                  <p className={`mt-3 text-3xl font-semibold ${totalPL >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {totalPL >= 0 ? '+' : ''}{formatCurrency(totalPL)}
                  </p>
                  <p className={`mt-1 text-sm font-medium ${totalPLPercent >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                    {totalPLPercent >= 0 ? '+' : ''}{totalPLPercent.toFixed(2)}%
                  </p>
                  <p className="mt-3 text-xs text-slate-300/70 leading-relaxed">
                    Based on total capital deployed minus realized and unrealized performance.
                  </p>
                </motion.div>

                <motion.div whileHover={{ y: -4 }} className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-xl">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300/80">Heat check</p>
                  <p className="mt-3 text-3xl font-semibold text-white">
                    {trendLeaders.length > 0 ? trendLeaders[0].symbol : 'Loading'}
                  </p>
                  <p className="mt-1 text-sm text-emerald-200">
                    {trendLeaders.length > 0 && (
                      <>
                        {(trendLeaders[0].unrealized_pl_percent || 0) >= 0 ? '+' : ''}
                        {(trendLeaders[0].unrealized_pl_percent || 0).toFixed(1)}%
                      </>
                    )}
                  </p>
                  <p className="mt-3 text-xs text-slate-300/70 leading-relaxed">
                    Your strongest open play right now. Review the thesis and trail stops.
                  </p>
                </motion.div>

                <motion.div whileHover={{ y: -4 }} className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-xl">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300/80">Focus cue</p>
                  <p className="mt-3 text-lg font-semibold text-white leading-relaxed">
                    Journal a one-sentence plan before you take the next trade.
                  </p>
                  <p className="mt-3 text-xs text-slate-300/70 leading-relaxed">
                    Clarity before execution keeps your desk in sync.
                  </p>
                </motion.div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-6 shadow-inner">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Equity curve</h2>
                    <p className="text-sm text-slate-300/70">Smooth, annotated, and tuned for clarity.</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-300/70">
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" /> Latest
                    <span className="inline-flex h-2 w-2 rounded-full bg-white/40" /> 30-day view
                  </div>
                </div>

                <div className="mt-6 h-64">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.4} />
                        <XAxis dataKey="date" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                        <YAxis
                          stroke="#9ca3af"
                          style={{ fontSize: '12px' }}
                          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(15,23,42,0.95)',
                            border: '1px solid rgba(148,163,184,0.2)',
                            borderRadius: '16px',
                            color: '#f8fafc',
                          }}
                          labelStyle={{ color: '#bae6fd' }}
                          formatter={(value: number) => [formatCurrency(value), 'Portfolio value']}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#34d399"
                          strokeWidth={3}
                          dot={false}
                          activeDot={{ r: 6, fill: '#22c55e', strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">
                      <p>No portfolio history yet. Start trading to light up this chart.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="relative flex flex-col gap-5 rounded-3xl border border-white/5 bg-slate-950/60 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.6)] backdrop-blur-2xl">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-400/5 via-transparent to-cyan-400/5" />
            <div className="relative z-10 space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-300/70">Upcoming catalysts</p>
                <div className="mt-4 space-y-4">
                  {upcomingEvents.map(event => (
                    <div key={event.label} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{event.label}</p>
                        <p className="text-xs text-slate-300/70">{event.impact}</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-200/80">
                        {event.time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-300/70">Risk dashboard</p>
                <div className="mt-4 space-y-4 text-sm text-slate-200/90">
                  <div className="flex items-center justify-between">
                    <span>Utilized margin</span>
                    <span className="font-semibold text-white">{Math.min((trendLeaders.length || 1) * 12, 65)}%</span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-500"
                      style={{ width: `${Math.min((trendLeaders.length || 1) * 12, 65)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Stress test ±1%</span>
                    <span className={`font-semibold ${totalPL >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                      {totalPL >= 0 ? '+' : ''}{formatCurrency(totalPL * 0.12 || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Capital at work</span>
                    <span className="font-semibold text-white">{currentSnapshot?.open_positions_count || 0} positions</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-slate-900/60 p-5 text-sm text-emerald-100/90">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/80">Coaching nudge</p>
                <p className="mt-3 text-base font-medium text-white leading-relaxed">{learningPrompt}</p>
              </div>
            </div>
          </section>
        </div>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-[0_20px_60px_rgba(8,47,73,0.55)] backdrop-blur-2xl">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">What’s moving?</h2>
                  <p className="text-sm text-slate-300/70">Your strongest open trades ranked by impact.</p>
                </div>
                <Link href="/portfolio" className="text-xs uppercase tracking-[0.22em] text-emerald-200/80 hover:text-emerald-100">
                  View all positions →
                </Link>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {trendLeaders.length > 0 ? (
                  trendLeaders.map((position, idx) => (
                    <motion.article
                      key={position.id}
                      whileHover={{ y: -4 }}
                      className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-5 shadow-lg"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-emerald-500/10" />
                      <div className="relative z-10 space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-300/60">Rank #{idx + 1}</p>
                            <h3 className="mt-1 text-2xl font-semibold text-white">{position.symbol}</h3>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-200/80">
                            {position.option_type.toUpperCase()} ${position.strike}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className={`text-lg font-semibold ${
                              (position.unrealized_pl || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'
                            }`}>
                              {(position.unrealized_pl || 0) >= 0 ? '+' : ''}
                              {formatCurrency(position.unrealized_pl || 0)}
                            </p>
                            <p className={`text-sm ${
                              (position.unrealized_pl_percent || 0) >= 0 ? 'text-emerald-200' : 'text-red-200'
                            }`}>
                              {(position.unrealized_pl_percent || 0) >= 0 ? '+' : ''}
                              {(position.unrealized_pl_percent || 0).toFixed(1)}%
                            </p>
                          </div>
                          <div className="text-right text-xs text-slate-300/70 leading-relaxed">
                            <p>{position.exit_signal === 'hold' && 'Let it breathe, trail stops.'}</p>
                            <p>{position.exit_signal === 'consider' && 'Check catalysts before scaling.'}</p>
                            <p>{position.exit_signal === 'exit_now' && 'Scale out tactically.'}</p>
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  ))
                ) : (
                  <div className="col-span-full rounded-2xl border border-white/10 bg-slate-950/50 p-6 text-center text-sm text-slate-400">
                    No open positions yet. Scan the market to populate this story.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-[0_20px_60px_rgba(15,118,110,0.45)] backdrop-blur-2xl">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">What’s the opportunity?</h2>
                  <p className="text-sm text-slate-300/70">Fresh setups based on your biggest winners &amp; losers.</p>
                </div>
                <Link href="/scanner" className="text-xs uppercase tracking-[0.22em] text-emerald-200/80 hover:text-emerald-100">
                  Launch scanner →
                </Link>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[...featuredWinners, ...featuredLosers].length > 0 ? (
                  [...featuredWinners, ...featuredLosers].map((position) => (
                    <motion.article
                      key={position.id}
                      whileHover={{ y: -4 }}
                      className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-5 shadow-lg"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-emerald-500/10" />
                      <div className="relative z-10 space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-300/60">Playbook</p>
                            <h3 className="mt-1 text-2xl font-semibold text-white">{position.symbol}</h3>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-200/80">
                            {position.option_type.toUpperCase()} ${position.strike}
                          </span>
                        </div>
                        <p className="text-sm text-emerald-100/80 leading-relaxed">
                          {position.realized_pl && position.realized_pl > 0
                            ? 'Trend-follow continuation. Let strength confirm before reloading.'
                            : 'Review breakdown triggers. Wait for base or divergence before redeploying.'}
                        </p>
                        <div className="flex items-center justify-between text-sm">
                          <span className={`${(position.realized_pl || 0) >= 0 ? 'text-emerald-200' : 'text-red-200'} font-semibold`}>
                            {(position.realized_pl || 0) >= 0 ? '+' : ''}{formatCurrency(position.realized_pl || 0)}
                          </span>
                          <span className={`${(position.realized_pl_percent || 0) >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                            {(position.realized_pl_percent || 0) >= 0 ? '+' : ''}{(position.realized_pl_percent || 0).toFixed(1)}%
                          </span>
                          <span className="text-xs text-slate-400">
                            {position.exit_date && new Date(position.exit_date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </motion.article>
                  ))
                ) : (
                  <div className="col-span-full rounded-2xl border border-white/10 bg-slate-950/50 p-6 text-center text-sm text-slate-400">
                    No closed trades yet. Your next playbook populates once you log results.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-[0_20px_60px_rgba(5,150,105,0.35)] backdrop-blur-2xl">
              <h2 className="text-lg font-semibold text-white">Action hub</h2>
              <p className="mt-1 text-sm text-slate-300/70">From insight to execution in two taps.</p>

              <div className="mt-6 space-y-3">
                <Link
                  href="/scanner"
                  className="group flex items-center justify-between rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-4 text-sm font-semibold text-emerald-100 shadow-inner transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-500/20"
                >
                  <span>Run smart scanner</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-emerald-100/80 group-hover:text-white">Launch →</span>
                </Link>
                <Link
                  href="/market-info"
                  className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm font-semibold text-slate-100/90 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/20"
                >
                  <span>Scan macro briefings</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-emerald-100/80 group-hover:text-white">Read →</span>
                </Link>
                <Link
                  href="/portfolio"
                  className="group flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 px-5 py-4 text-sm font-semibold text-slate-100/90 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-slate-900/70"
                >
                  <span>Manage live book</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-emerald-100/80 group-hover:text-white">Open →</span>
                </Link>
                <Link
                  href="/watchlist"
                  className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm font-semibold text-slate-100/90 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/20"
                >
                  <span>Curate watchlist</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-emerald-100/80 group-hover:text-white">Edit →</span>
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-[0_20px_60px_rgba(56,189,248,0.3)] backdrop-blur-2xl">
              <h2 className="text-lg font-semibold text-white">Scenario lab</h2>
              <p className="mt-1 text-sm text-slate-300/70">Run quick what-if playbooks to stay ahead.</p>

              <div className="mt-6 space-y-4 text-sm text-slate-200/90">
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300/70">If USD weakens…</p>
                  <p className="mt-2 text-white">Prioritize EUR/USD breakouts and AUD strength. Check spreads &amp; adjust position sizes.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300/70">If volatility spikes…</p>
                  <p className="mt-2 text-white">Flip to defensive mode—reduce leverage, widen stops, and lean on options hedges.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300/70">If trend resumes…</p>
                  <p className="mt-2 text-white">Ride leaders by pyramiding into strength with tight trailing logic.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.5)] backdrop-blur-2xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Wall of gains</h2>
                <p className="text-sm text-slate-300/70">Celebrate executions worth repeating.</p>
              </div>
              <div className="space-y-3">
                {biggestWinners.length > 0 ? (
                  biggestWinners.map((position, idx) => (
                    <motion.div
                      key={position.id}
                      whileHover={{ y: -4 }}
                      className="flex items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100"
                    >
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">#{idx + 1}</p>
                        <p className="mt-1 text-base font-semibold text-white">
                          {position.symbol} ${position.strike} {position.option_type.toUpperCase()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-semibold text-emerald-200">
                          +{formatCurrency(position.realized_pl || 0)}
                        </p>
                        <p className="text-xs text-emerald-100/70">
                          +{(position.realized_pl_percent || 0).toFixed(1)}%
                        </p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-6 text-sm text-slate-400">
                    No closed winners yet. Your highlight reel is waiting.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Wall of lessons</h2>
                <p className="text-sm text-slate-300/70">Snapshots to refine your rules.</p>
              </div>
              <div className="space-y-3">
                {biggestLosers.length > 0 ? (
                  biggestLosers.map((position, idx) => (
                    <motion.div
                      key={position.id}
                      whileHover={{ y: -4 }}
                      className="flex items-center justify-between rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100"
                    >
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-red-200/80">#{idx + 1}</p>
                        <p className="mt-1 text-base font-semibold text-white">
                          {position.symbol} ${position.strike} {position.option_type.toUpperCase()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-semibold text-red-200">
                          {formatCurrency(position.realized_pl || 0)}
                        </p>
                        <p className="text-xs text-red-100/70">
                          {(position.realized_pl_percent || 0).toFixed(1)}%
                        </p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-6 text-sm text-slate-400">
                    Zero losses logged. Keep respecting your plan.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <footer className="sticky bottom-6 z-20">
          <div className="mx-auto max-w-5xl rounded-full border border-white/10 bg-slate-950/70 px-6 py-4 shadow-[0_20px_60px_rgba(8,47,73,0.5)] backdrop-blur-xl">
            <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300/80">Desk mantra</p>
                <p className="text-sm text-white/90">Slow is smooth. Smooth is fast. Trade what you understand.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em]">
                <Link href="/journal" className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-emerald-100/80 transition hover:border-white/20 hover:bg-white/20 hover:text-white">
                  Open journal
                </Link>
                <Link href="/settings" className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-emerald-100/80 transition hover:border-white/20 hover:bg-white/20 hover:text-white">
                  Personalize desk
                </Link>
                <Link href="/portfolio" className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-emerald-100/90 transition hover:border-emerald-300 hover:bg-emerald-500/20 hover:text-white">
                  Review risk
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
