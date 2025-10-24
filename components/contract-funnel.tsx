'use client'

import { motion } from 'framer-motion'
import { useMemo } from 'react'
import type { CSSProperties } from 'react'

const contractStreams = [
  {
    path: 'M-80 20 Q120 60 280 140 Q380 190 430 210 T720 200',
    duration: 20,
    stagger: 9,
    chips: [
      {
        label: 'AAPL 190C · Apr 19',
        tone: 'from-emerald-400/50 to-emerald-500/30 border-emerald-400/40 text-emerald-100',
        dot: 'bg-emerald-300/90',
      },
      {
        label: 'NVDA 800C · Mar 22',
        tone: 'from-cyan-400/50 to-sky-500/30 border-cyan-400/40 text-cyan-100',
        dot: 'bg-cyan-300/90',
      },
      {
        label: 'TSLA 180P · Apr 19',
        tone: 'from-red-400/55 to-rose-500/30 border-red-400/40 text-rose-100',
        dot: 'bg-rose-300/90',
      },
    ],
  },
  {
    path: 'M-80 60 Q140 100 300 170 Q390 210 440 230 T720 220',
    duration: 21,
    stagger: 9.5,
    chips: [
      {
        label: 'SPY 520C · Mar 22',
        tone: 'from-blue-400/50 to-indigo-500/30 border-blue-400/40 text-blue-100',
        dot: 'bg-blue-300/90',
      },
      {
        label: 'AMD 200C · Jun 21',
        tone: 'from-orange-400/50 to-amber-500/25 border-orange-400/40 text-amber-100',
        dot: 'bg-amber-300/90',
      },
      {
        label: 'QQQ 450C · Mar 29',
        tone: 'from-purple-400/45 to-fuchsia-500/25 border-purple-400/40 text-purple-100',
        dot: 'bg-purple-300/90',
      },
    ],
  },
]

const bestTrades = [
  { label: 'High conviction spreads', value: '+38% avg. edge' },
  { label: 'Liquidity screened', value: '< 0.5s routing' },
  { label: 'Risk-adjusted yield', value: 'Sharpe 2.3' },
]

function buildPathStyle(path: string): CSSProperties {
  return {
    offsetPath: `path('${path}')`,
    WebkitOffsetPath: `path('${path}')`,
  } as CSSProperties
}

export default function ContractFunnel() {
  const streamConfigs = useMemo(
    () =>
      contractStreams.map((stream) => ({
        ...stream,
        style: buildPathStyle(stream.path),
      })),
    [],
  )

  return (
    <section className="relative overflow-hidden bg-[#05070E] px-6 py-24">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(39,174,96,0.12),transparent_65%)]" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-16 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div className="space-y-6">
          <span className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-200/70">
            Signal refinery
          </span>
          <h2 className="text-3xl font-display font-semibold text-white sm:text-4xl">
            Billions of option contracts, sifted into a handful of trades you can act on.
          </h2>
          <p className="text-base text-white/70 sm:text-lg">
            Every sweep, quote, and volatility shift streams through Monty&apos;s machine. We score each contract in real time,
            discard the noise, and elevate the structures with the strongest edge.
          </p>
          <div className="space-y-3 text-sm text-white/60">
            <p className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
              Streaming data from CBOE, IEX, and dark pool feeds.
            </p>
            <p className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-cyan-400" aria-hidden />
              Reinforced by proprietary scanners that continuously learn which setups pay.
            </p>
          </div>
        </div>

        <div className="relative flex h-[420px] w-full max-w-3xl items-center justify-center rounded-[2.75rem] border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <div className="absolute inset-0 rounded-[2.75rem] bg-gradient-to-br from-white/5 via-white/0 to-transparent" />
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
            {contractStreams.map((stream) => (
              <path
                key={stream.path}
                d={stream.path}
                stroke="url(#funnelStroke)"
                strokeWidth="1.4"
                strokeLinecap="round"
                className="opacity-60"
              />
            ))}
          </svg>

          {streamConfigs.map((stream) => (
            <div key={stream.path} aria-hidden>
              {stream.chips.map((chip, index) => (
                <motion.div
                  key={chip.label}
                  className={`contract-chip absolute flex h-10 min-w-[190px] items-center gap-2 rounded-full border bg-gradient-to-r px-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur ${chip.tone}`}
                  style={{
                    ...stream.style,
                    offsetDistance: '0%',
                    WebkitOffsetDistance: '0%',
                  }}
                  animate={{
                    offsetDistance: ['0%', '100%'],
                    WebkitOffsetDistance: ['0%', '100%'],
                  }}
                  transition={{
                    duration: stream.duration,
                    ease: 'linear',
                    repeat: Infinity,
                    repeatType: 'loop',
                    delay: index * stream.stagger,
                  }}
                >
                  <span className={`h-2 w-2 rounded-full ${chip.dot} opacity-90`} />
                  <span className="tracking-[0.08em] text-[11px] text-white/80">{chip.label}</span>
                </motion.div>
              ))}
            </div>
          ))}

          {/* Market Input - Top Left */}
          <div className="absolute left-6 top-12 space-y-3 rounded-2xl border border-white/15 bg-black/80 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.45)]">
            <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.4em] text-white/70">
              Market
            </div>
            <div className="space-y-1.5 text-xs text-white/60">
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                10K+ contracts
              </p>
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                Live flow data
              </p>
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                All symbols
              </p>
            </div>
          </div>

          <div className="pointer-events-none absolute left-1/2 h-60 w-36 -translate-x-1/2 rounded-full border border-emerald-400/40 bg-emerald-400/10 blur-[2px]" />
          <div className="absolute left-1/2 flex h-44 w-32 -translate-x-1/2 items-center justify-center rounded-[2.5rem] border border-white/10 bg-black/70 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.45)]">
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
                <div className="rounded-full bg-emerald-400/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-emerald-200/80">
                  Scanner
                </div>
                <p className="max-w-[8rem] text-xs text-white/70">
                  Filters contracts on spread, flow velocity, and volatility regime.
                </p>
              </div>
            </div>
          </div>

          <div className="absolute right-6 top-1/2 -translate-y-1/2 space-y-4 rounded-3xl border border-white/15 bg-black/80 p-6 shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
            <div className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.4em] text-emerald-200">
              Best trades
            </div>
            <ul className="space-y-3 text-sm text-white/70">
              {bestTrades.map((item) => (
                <li key={item.label}>
                  <p className="text-white/80">{item.label}</p>
                  <p className="text-xs text-white/50">{item.value}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
