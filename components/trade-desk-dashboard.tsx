'use client'

import { useMemo, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowUpRight,
  BellRing,
  Brain,
  CandlestickChart,
  ChevronRight,
  Flame,
  LineChart as LineChartIcon,
  Lock,
  Radar,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { cn } from '@/lib/utils'
import type { User } from '@supabase/supabase-js'

interface TradeDeskDashboardProps {
  user: User
}

type NotificationTone = 'warning' | 'success' | 'info'

interface LiveNotification {
  id: string
  title: string
  detail: string
  tone: NotificationTone
  actionLabel: string
  href: string
}

const timeframeOptions = [
  { label: '1D', description: 'Today’s moves' },
  { label: '5D', description: 'This week' },
  { label: '1M', description: 'Rolling month' },
  { label: '3M', description: 'Quarter view' },
]

const liveNotifications: LiveNotification[] = [
  {
    id: 'risk-alert',
    title: 'Volatility pulse',
    detail: 'Implied volatility on NVDA weekly calls is spiking 12% vs. 30-day baseline.',
    tone: 'warning' as const,
    actionLabel: 'View scanner',
    href: '/?focus=nvda',
  },
  {
    id: 'fill-update',
    title: 'Order filled',
    detail: 'TSLA 0DTE call spread filled at $1.42 debit. Net delta aligned with target.',
    tone: 'success' as const,
    actionLabel: 'Open trade journal',
    href: '/portfolio',
  },
  {
    id: 'macro-signal',
    title: 'Macro signal synced',
    detail: 'FOMC minutes sentiment upgraded to neutral-bullish. Gamma models refreshed.',
    tone: 'info' as const,
    actionLabel: 'Review playbook',
    href: '/macro',
  },
]

const trendingContracts = [
  { symbol: 'NVDA', sentiment: '+8.4%', label: 'AI momentum' },
  { symbol: 'SPY', sentiment: '+3.1%', label: '0DTE flow' },
  { symbol: 'TSLA', sentiment: '-2.7%', label: 'Put wall' },
  { symbol: 'AAPL', sentiment: '+1.9%', label: 'Earnings crush' },
]

const quickActions = [
  {
    title: 'Launch lightning scan',
    description: 'Run Monty’s institutional filters with your saved profile.',
    icon: Radar,
    href: '/?trigger=scan',
  },
  {
    title: 'Build strategy remix',
    description: 'Mash today’s flow with your risk tolerances and targets.',
    icon: Brain,
    href: '/ai-strategy-hub',
  },
  {
    title: 'Secure trade ticket',
    description: 'Send a compliant, two-step verified order to your broker.',
    icon: Lock,
    href: '/portfolio',
  },
]

const securityChecklist = [
  {
    name: 'Multi-factor auth',
    status: 'Enabled',
    helper: 'Backed by hardware key fallback.',
  },
  {
    name: 'Session alerts',
    status: 'Active',
    helper: 'You’ll get a push whenever a new device logs in.',
  },
  {
    name: 'Data vault',
    status: 'Encrypted',
    helper: 'AES-256 + rotating keys inside Monty Secure.',
  },
]

const watchlistMoves = [
  {
    symbol: 'MSFT',
    move: '+1.24%',
    ivRank: '42',
    note: 'Flow leaning bullish with 68% call premium.',
  },
  {
    symbol: 'AMD',
    move: '+0.84%',
    ivRank: '57',
    note: 'Unusual sweep detected on 45DTE calls.',
  },
  {
    symbol: 'QQQ',
    move: '-0.31%',
    ivRank: '35',
    note: 'Gamma flip zone approaching 404 level.',
  },
]

const areaGradientStops = [
  { offset: '0%', color: 'rgba(52, 211, 153, 0.4)' },
  { offset: '75%', color: 'rgba(52, 211, 153, 0.05)' },
]

export function TradeDeskDashboard({ user }: TradeDeskDashboardProps) {
  const [timeframe, setTimeframe] = useState('1D')
  const [pulse, setPulse] = useState(64)

  const performanceData = useMemo(() => {
    const base: Record<string, Array<{ label: string; value: number }>> = {
      '1D': [
        { label: '9:30', value: 120 },
        { label: '11:00', value: 150 },
        { label: '12:30', value: 134 },
        { label: '14:00', value: 172 },
        { label: '15:30', value: 210 },
      ],
      '5D': [
        { label: 'Mon', value: 130 },
        { label: 'Tue', value: 176 },
        { label: 'Wed', value: 198 },
        { label: 'Thu', value: 184 },
        { label: 'Fri', value: 226 },
      ],
      '1M': [
        { label: 'Week 1', value: 104 },
        { label: 'Week 2', value: 176 },
        { label: 'Week 3', value: 222 },
        { label: 'Week 4', value: 261 },
      ],
      '3M': [
        { label: 'Jan', value: 82 },
        { label: 'Feb', value: 164 },
        { label: 'Mar', value: 242 },
      ],
    }

    return base[timeframe]
  }, [timeframe])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPulse((prev) => {
        const next = prev + (Math.random() * 6 - 3)
        return Math.max(20, Math.min(99, Math.round(next)))
      })
    }, 5000)

    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live market desk · {pulse}% signal clarity
            </div>
            <h1 className="text-3xl font-display font-semibold tracking-tight text-white sm:text-4xl">
              Welcome back, {user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'trader'}
            </h1>
            <p className="max-w-2xl text-base text-slate-300">
              Your HQ blends WallStreetBets energy with institutional precision. Stay on top of flow, risk, and next-play ideas—all in one radiant command center.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300" aria-live="polite">
            <span className="rounded-full bg-emerald-500/15 px-4 py-2 text-emerald-200">
              Market: OPEN · +1.8% risk appetite
            </span>
            <span className="rounded-full bg-slate-800/80 px-4 py-2">
              Account protected · Last security check 2h ago
            </span>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Net liquidity',
              value: '$509,793.11',
              change: '+$6,885 (1.36%)',
              icon: LineChartIcon,
              gradient: 'from-emerald-500/90 to-emerald-400/60',
            },
            {
              label: 'Buying power',
              value: '$135,250',
              change: 'Ready to deploy',
              icon: Wand2,
              gradient: 'from-sky-500/70 to-emerald-400/60',
            },
            {
              label: 'Win rate (30d)',
              value: 'N/A',
              change: 'Start trading',
              icon: Flame,
              gradient: 'from-amber-500/70 to-rose-500/60',
            },
            {
              label: 'Risk dial',
              value: 'Balanced',
              change: `${pulse}% model confidence`,
              icon: Activity,
              gradient: 'from-purple-500/70 to-indigo-500/60',
            },
          ].map((card) => (
            <motion.div
              key={card.label}
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="group relative overflow-hidden rounded-3xl border border-white/5 bg-slate-900/60 p-6 shadow-[0_20px_60px_-30px_rgba(16,185,129,0.45)]"
            >
              <div className={cn('absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100', card.gradient)} />
              <div className="relative flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-300">{card.label}</span>
                  <span className="rounded-xl bg-white/5 p-2 text-emerald-200">
                    <card.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>
                <div>
                  <p className="text-3xl font-semibold text-white">{card.value}</p>
                  <p className="mt-2 text-sm text-emerald-100/80">{card.change}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <motion.div
            layout
            className="rounded-3xl border border-white/5 bg-slate-900/80 p-6 shadow-inner shadow-emerald-500/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Equity curve</h2>
                <p className="text-sm text-slate-400">Performance with delta-neutral hedges baked in.</p>
              </div>
              <div className="flex items-center gap-2" role="group" aria-label="Select equity curve timeframe">
                {timeframeOptions.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setTimeframe(option.label)}
                    className={cn(
                      'rounded-full px-4 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80',
                      timeframe === option.label
                        ? 'bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/30'
                        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    )}
                    aria-pressed={timeframe === option.label}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      {areaGradientStops.map((stop) => (
                        <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
                      ))}
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" stroke="rgba(226,232,240,0.45)" tick={{ fill: 'rgba(226,232,240,0.65)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="rgba(226,232,240,0.35)" tick={{ fill: 'rgba(226,232,240,0.55)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ stroke: 'rgba(16, 185, 129, 0.35)', strokeWidth: 2 }}
                    contentStyle={{
                      backgroundColor: 'rgba(15,23,42,0.95)',
                      borderRadius: 16,
                      border: '1px solid rgba(148, 163, 184, 0.15)',
                      color: '#F8FAFC',
                    }}
                    labelStyle={{ color: '#A5B4FC' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="rgba(52,211,153,0.9)" strokeWidth={3} fill="url(#equityGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div className="flex h-full flex-col gap-6">
            <div className="rounded-3xl border border-white/5 bg-slate-900/80 p-6 shadow-inner shadow-emerald-500/10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Live desk notifications</h2>
                  <p className="text-sm text-slate-400">Instant feedback from Monty’s scanners.</p>
                </div>
                <BellRing className="h-5 w-5 text-emerald-200" aria-hidden="true" />
              </div>
              <div className="mt-5 space-y-4" aria-live="polite">
                {liveNotifications.map((notification) => (
                  <motion.a
                    key={notification.id}
                    href={notification.href}
                    className="group block rounded-2xl border border-white/5 bg-slate-900/70 p-4 transition hover:border-emerald-400/50 hover:bg-slate-900"
                    whileHover={{ x: 4 }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-white">{notification.title}</p>
                        <p className="mt-2 text-sm text-slate-300">{notification.detail}</p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium',
                          notification.tone === 'warning' && 'bg-amber-500/20 text-amber-200',
                          notification.tone === 'success' && 'bg-emerald-500/20 text-emerald-200',
                          notification.tone === 'info' && 'bg-sky-500/20 text-sky-200'
                        )}
                      >
                        {notification.actionLabel}
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    </div>
                  </motion.a>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-gradient-to-br from-slate-900/90 via-slate-900 to-slate-950 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Monty hype board</h2>
                  <p className="text-sm text-slate-400">WallStreetBets vibes with real signal strength.</p>
                </div>
                <CandlestickChart className="h-5 w-5 text-emerald-200" aria-hidden="true" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {trendingContracts.map((contract) => (
                  <motion.button
                    key={contract.symbol}
                    type="button"
                    className="flex items-center justify-between rounded-2xl border border-white/5 bg-slate-900/70 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-emerald-400/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80"
                    whileHover={{ scale: 1.02 }}
                  >
                    <span className="font-semibold text-white">{contract.symbol}</span>
                    <div className="flex flex-col items-end">
                      <span className="text-emerald-200">{contract.sentiment}</span>
                      <span className="text-xs text-slate-400">{contract.label}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <motion.div className="rounded-3xl border border-white/5 bg-slate-900/80 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Security center</h2>
                <p className="text-sm text-slate-400">Follow security principles every session.</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-emerald-200" aria-hidden="true" />
            </div>
            <ul className="mt-5 space-y-4" aria-label="Security controls">
              {securityChecklist.map((item) => (
                <li key={item.name} className="rounded-2xl border border-white/5 bg-slate-900/70 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.helper}</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200">
                      {item.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <a
              href="/settings"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80"
            >
              Manage security preferences
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </motion.div>

          <motion.div className="rounded-3xl border border-white/5 bg-slate-900/80 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Watchlist momentum</h2>
                <p className="text-sm text-slate-400">Prioritize opportunities with smart filters.</p>
              </div>
              <Sparkles className="h-5 w-5 text-emerald-200" aria-hidden="true" />
            </div>
            <div className="mt-6 space-y-3">
              {watchlistMoves.map((item) => (
                <div
                  key={item.symbol}
                  className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-slate-900/70 p-4 text-sm text-slate-200 transition hover:border-emerald-400/50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-base font-semibold text-emerald-200">
                        {item.symbol}
                      </div>
                      <div>
                        <p className="text-white">{item.note}</p>
                        <p className="text-xs text-slate-400">IV Rank {item.ivRank}</p>
                      </div>
                    </div>
                    <span className={cn('text-sm font-semibold', item.move.startsWith('-') ? 'text-rose-200' : 'text-emerald-200')}>
                      {item.move}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {quickActions.map((action) => (
                <motion.a
                  key={action.title}
                  href={action.href}
                  className="flex h-full flex-col justify-between rounded-2xl border border-white/5 bg-slate-900/70 p-4 text-left transition hover:border-emerald-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80"
                  whileHover={{ y: -3 }}
                >
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>{action.title}</span>
                    <action.icon className="h-4 w-4 text-emerald-200" aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-xs text-slate-400">{action.description}</p>
                </motion.a>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="rounded-3xl border border-white/5 bg-slate-900/80 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Interactive playbook</h2>
              <p className="text-sm text-slate-400">
                Calibrate next moves with real-time feedback loops and accessibility-first controls.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-200">
                <Radar className="h-3.5 w-3.5" aria-hidden="true" />
                Auto-refresh 15s
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-3 py-1">
                <Sparkles className="h-3.5 w-3.5 text-emerald-200" aria-hidden="true" />
                Adaptive mode
              </span>
            </div>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {[
              {
                title: 'Flow radar',
                description: 'Detect where whales are leaning with aggregated dark pool prints.',
                metric: '+23 heat',
              },
              {
                title: 'Probability lab',
                description: 'Monte Carlo outcomes for your top saved strategy stack.',
                metric: '74% edge',
              },
              {
                title: 'Community sentiment',
                description: 'WallStreetBets threads filtered for actionable nuggets.',
                metric: '+312 hype',
              },
            ].map((tile) => (
              <motion.button
                key={tile.title}
                type="button"
                className="flex h-full flex-col justify-between rounded-2xl border border-white/5 bg-slate-900/70 p-5 text-left text-sm text-slate-200 transition hover:border-emerald-400/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80"
                whileHover={{ scale: 1.01 }}
              >
                <div>
                  <p className="text-base font-semibold text-white">{tile.title}</p>
                  <p className="mt-3 text-xs text-slate-400">{tile.description}</p>
                </div>
                <span className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-emerald-200">
                  {tile.metric}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </motion.button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
