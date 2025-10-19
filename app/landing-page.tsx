'use client'

import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#05070E] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
        {/* Top Navigation */}
        <header className="mb-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 text-xl font-bold text-black shadow-lg">
              M
            </div>
            <div>
              <p className="text-lg font-semibold text-white">Monty</p>
              <p className="text-xs text-emerald-200">Options Intelligence</p>
            </div>
          </div>
          <Link
            href="/auth/login"
            className="rounded-full border border-emerald-500/40 bg-white/5 px-5 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/10"
          >
            Duplicate Template
          </Link>
        </header>

        {/* Hero Section */}
        <main className="grid flex-1 gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-white/5 px-4 py-1 text-sm text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
              They trust us
            </div>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              Your Personal
              <br />
              Options Quant
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-300">
              Monty analyzes hundreds of options contracts, weighs them with institutional-grade quant models, and delivers only the best opportunities.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/auth/login"
                className="rounded-full bg-emerald-500 px-8 py-3 text-sm font-semibold text-black shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400"
              >
                Get started now
              </Link>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <div className="flex items-center gap-1 text-emerald-300">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <span key={index}>★</span>
                  ))}
                </div>
                <span>4.9 rating</span>
              </div>
            </div>
          </div>

          {/* Dashboard Preview */}
          <div className="flex flex-col gap-6 rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-[0_40px_120px_-40px_rgba(16,185,129,0.45)]">
            <div className="flex items-start justify-between rounded-2xl border border-white/5 bg-white/5 p-4">
              <div>
                <p className="text-sm text-slate-300">Reward</p>
                <p className="mt-1 text-3xl font-semibold text-white">€22,193.05</p>
                <p className="text-sm text-emerald-300">+6.82%</p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>Main Dashboard</p>
                <p className="mt-2">Updated 3m ago</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                <p className="text-sm text-slate-300">Assets</p>
                <div className="mt-4 flex flex-col gap-3 text-sm text-slate-200">
                  <div className="flex items-center justify-between">
                    <span>Monty Fund</span>
                    <span className="text-emerald-300">€12,432</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Delta Vault</span>
                    <span className="text-emerald-300">€6,821</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Gamma Pulse</span>
                    <span className="text-emerald-300">€2,940</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <p>Quick swap</p>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">Live</span>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">From</span>
                    <span className="text-white">SPY 0DTE</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">To</span>
                    <span className="text-white">QQQ Weekly</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Slippage</span>
                    <span>0.2%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
              <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                <p className="text-sm text-slate-300">Recent transactions</p>
                <div className="mt-4 space-y-3 text-sm text-slate-200">
                  <div className="flex items-center justify-between">
                    <span>Sold NVDA Calls</span>
                    <span className="text-emerald-300">€1,840</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Bought TSLA Puts</span>
                    <span className="text-red-300">-€620</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Rolled MSFT Calls</span>
                    <span className="text-emerald-300">€480</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                <p className="text-sm text-slate-300">Repartition</p>
                <div className="mt-4 flex items-center justify-center">
                  <div className="relative h-28 w-28">
                    <div className="absolute inset-0 rounded-full border-8 border-emerald-500/80"></div>
                    <div className="absolute inset-3 rounded-full border-8 border-emerald-300/60"></div>
                    <div className="absolute inset-6 rounded-full border-8 border-emerald-200/50"></div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-slate-400">
                  <div>
                    <p className="text-sm text-white">45%</p>
                    <p>Calls</p>
                  </div>
                  <div>
                    <p className="text-sm text-white">35%</p>
                    <p>Puts</p>
                  </div>
                  <div>
                    <p className="text-sm text-white">20%</p>
                    <p>Spreads</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-16 text-sm text-slate-500">
          © {new Date().getFullYear()} Monty Quantitative Labs. All rights reserved.
        </footer>
      </div>
    </div>
  )
}
