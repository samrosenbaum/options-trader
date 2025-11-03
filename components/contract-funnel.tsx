'use client'

import { motion } from 'framer-motion'

// Define multiple flowing paths from left (Market) → center (Scanner) → right (Best Trades)
const flowPaths = [
  {
    // Top path
    path: 'M -400 -320 Q 250 60, 430 180 Q 600 280, 810 330',
    duration: 20,
    chips: [
      {
        label: 'TSLA 180P · Apr 19',
        tone: 'from-red-400/55 to-rose-500/30 border-red-400/40 text-rose-100',
        dot: 'bg-rose-300/90',
        fadeOut: true,
      },
      {
        label: 'AMD 200C · Jun 21',
        tone: 'from-orange-400/50 to-amber-500/25 border-orange-400/40 text-amber-100',
        dot: 'bg-amber-300/90',
        fadeOut: true,
      },
      {
        label: 'AAPL 190C · Apr 19',
        tone: 'from-emerald-400/50 to-emerald-500/30 border-emerald-400/40 text-emerald-100',
        dot: 'bg-emerald-300/90',
        fadeOut: false,
      },
    ],
  },
  {
    // Middle path
    path: 'M -400 -100 Q 250 170, 430 210 Q 600 250, 810 360',
    duration: 22,
    chips: [
      {
        label: 'NVDA 800C · Mar 22',
        tone: 'from-cyan-400/50 to-sky-500/30 border-cyan-400/40 text-cyan-100',
        dot: 'bg-cyan-300/90',
        fadeOut: true,
      },
      {
        label: 'META 520C · May 17',
        tone: 'from-violet-400/45 to-fuchsia-500/25 border-violet-400/40 text-violet-100',
        dot: 'bg-violet-300/90',
        fadeOut: true,
      },
      {
        label: 'SPY 520C · Mar 22',
        tone: 'from-lime-400/50 to-emerald-500/30 border-lime-400/40 text-lime-100',
        dot: 'bg-lime-300/90',
        fadeOut: false,
      },
    ],
  },
  {
    // Bottom path
    path: 'M -400 0 Q 250 280, 430 240 Q 600 220, 810 370',
    duration: 24,
    chips: [
      {
        label: 'MSFT 400P · Apr 05',
        tone: 'from-blue-400/45 to-indigo-500/25 border-blue-400/40 text-blue-100',
        dot: 'bg-blue-300/90',
        fadeOut: true,
      },
      {
        label: 'IWM 205P · Apr 05',
        tone: 'from-sky-400/45 to-blue-500/25 border-sky-400/40 text-sky-100',
        dot: 'bg-sky-300/90',
        fadeOut: true,
      },
      {
        label: 'NFLX 650C · Mar 29',
        tone: 'from-purple-400/45 to-fuchsia-500/25 border-purple-400/40 text-purple-100',
        dot: 'bg-purple-300/90',
        fadeOut: true,
      },
    ],
  },
]

const bestTrades = [
  { label: 'High conviction spreads', value: '+38% avg. edge' },
  { label: 'Liquidity screened', value: '< 0.5s routing' },
  { label: 'Risk-adjusted yield', value: 'Sharpe 2.3' },
]

export default function ContractFunnel() {
  return (
    <section className="relative overflow-hidden bg-slate-100 px-6 py-24">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),transparent_65%)]" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-16 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div className="space-y-6">
          <span className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-600/80">
            Cut through the noise
          </span>
          <h2 className="text-3xl font-display font-semibold text-slate-900 sm:text-4xl">
            Millions of option contracts, sifted into a handful of trades you can act on.
          </h2>
          <p className="text-base text-slate-600 sm:text-lg">
            Every sweep, quote, and volatility shift streams through Monty&apos;s machine. We score each contract in real time,
            discard the noise, and elevate the structures with the strongest edge.
          </p>
          <div className="space-y-3 text-sm text-slate-600">
            <p className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
              Streaming data from CBOE, IEX, and dark pool feeds.
            </p>
            <p className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-cyan-500" aria-hidden />
              Reinforced by proprietary scanners that continuously learn which setups pay.
            </p>
          </div>
        </div>

        <div className="relative flex h-[420px] w-full items-center justify-center rounded-[2.75rem] border border-slate-200 bg-white p-6 shadow-[0_40px_100px_-40px_rgba(15,23,42,0.35)] backdrop-blur-lg">
          <div className="absolute inset-0 rounded-[2.75rem] bg-gradient-to-br from-emerald-50 via-white to-transparent" />

          {/* SVG Paths */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 860 420"
            fill="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="funnelStroke" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="rgba(99,255,202,0.35)" />
                <stop offset="40%" stopColor="rgba(78,197,255,0.28)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.15)" />
              </linearGradient>
            </defs>
            {flowPaths.map((stream, idx) => (
              <path
                key={idx}
                d={stream.path}
                stroke="url(#funnelStroke)"
                strokeWidth="1.4"
                strokeLinecap="round"
                className="opacity-60"
              />
            ))}
          </svg>

          {/* Animated Contract Chips */}
          {flowPaths.map((stream, streamIdx) => (
            <div key={streamIdx} aria-hidden>
              {stream.chips.map((chip, chipIdx) => {
                const delay = chipIdx * 4

                return (
                  <motion.div
                    key={`${streamIdx}-${chipIdx}`}
                    className={`contract-chip absolute flex h-10 min-w-[190px] items-center gap-2 rounded-full border bg-gradient-to-r px-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.2)] backdrop-blur ${chip.tone}`}
                    style={{
                      offsetPath: `path('${stream.path}')`,
                      offsetDistance: '0%',
                    }}
                    animate={{
                      offsetDistance: ['0%', '100%'],
                      opacity: chip.fadeOut ? [0, 1, 1, 0.6, 0] : [0, 1, 1, 1, 1],
                      scale: chip.fadeOut ? [0.8, 1, 1, 0.85, 0.7] : [0.8, 1, 1, 1, 1],
                    }}
                    transition={{
                      duration: stream.duration,
                      ease: 'linear',
                      repeat: Infinity,
                      delay,
                      times: chip.fadeOut ? [0, 0.1, 0.45, 0.55, 0.65] : [0, 0.1, 0.5, 0.9, 1],
                    }}
                  >
                    <span className={`h-2 w-2 rounded-full ${chip.dot} opacity-90`} />
                    <span className="tracking-[0.08em] text-[11px] text-white/80">{chip.label}</span>
                  </motion.div>
                )
              })}
            </div>
          ))}

          {/* Market Input - Top Left */}
          <div className="absolute left-6 top-12 space-y-3 rounded-2xl border border-emerald-200/70 bg-white p-5 shadow-[0_20px_40px_-25px_rgba(15,23,42,0.2)] z-10">
            <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.4em] text-emerald-600">
              Market
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-200" />
                10K+ contracts
              </p>
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-200" />
                Live flow data
              </p>
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-200" />
                All symbols
              </p>
            </div>
          </div>

          {/* Scanner - Center */}
          <div className="pointer-events-none absolute left-1/2 h-60 w-36 -translate-x-1/2 rounded-full border border-emerald-300/50 bg-emerald-100 blur-[2px]" />
          <div className="absolute left-1/2 flex h-44 w-32 -translate-x-1/2 items-center justify-center rounded-[2.5rem] border border-emerald-200/70 bg-white p-6 shadow-[0_25px_60px_-30px_rgba(15,23,42,0.25)] z-10">
            <div className="relative flex h-full w-full flex-col items-center justify-center gap-4">
              {[0, 1, 2].map((pulse) => (
                <motion.span
                  key={pulse}
                  className="absolute inset-0 rounded-[2.5rem] bg-emerald-400/10"
                  animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.25, 0.6] }}
                  transition={{ duration: 3.6, repeat: Infinity, delay: pulse * 0.6, ease: 'easeInOut' }}
                />
              ))}
              <div className="relative z-10 flex flex-col items-center gap-2 text-center">
                <div className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-emerald-600">
                  Scanner
                </div>
                <p className="max-w-[8rem] text-xs text-slate-600">
                  Filters contracts on spread, flow velocity, and volatility regime.
                </p>
              </div>
            </div>
          </div>

          {/* Best Trades - Bottom Right (diagonal from Market) */}
          <div className="absolute -right-3 -bottom-3 space-y-4 rounded-3xl border border-emerald-200/70 bg-white p-6 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.25)] z-10">
            <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.4em] text-emerald-600">
              Best trades
            </div>
            <ul className="space-y-3 text-sm text-slate-600">
              {bestTrades.map((item) => (
                <li key={item.label}>
                  <p className="text-slate-900">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.value}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
