'use client'

import Image from 'next/image'
import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-8">
            <Image
              src="/money-printer.png"
              alt="Money Printer Pig"
              width={400}
              height={400}
              className="drop-shadow-2xl"
              priority
            />
          </div>

          <h1 className="text-6xl font-bold text-slate-900 dark:text-white mb-6">
            Welcome to the Money Printer
          </h1>

          <p className="text-2xl text-slate-600 dark:text-slate-300 mb-4 font-medium">
            Your institutional-grade options trading companion
          </p>

          <p className="text-xl text-emerald-600 dark:text-emerald-400 mb-12 font-bold">
            🤠 Welcome to the rodeo!
          </p>

          <Link
            href="/auth/login"
            className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-xl font-bold py-4 px-12 rounded-2xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
          >
            Login to Get Started
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-lg border border-slate-200 dark:border-slate-800">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
              Smart Options Scanner
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              Discover high-probability options trades with institutional-grade analysis, Kelly criterion position sizing, and real-time market signals.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-lg border border-slate-200 dark:border-slate-800">
            <div className="text-4xl mb-4">👀</div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
              Options Watchlist
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              Track your favorite contracts, monitor Greeks in real-time, and get alerts when opportunities hit your criteria.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-lg border border-slate-200 dark:border-slate-800">
            <div className="text-4xl mb-4">💼</div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
              Portfolio Tracker
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              Log your trades, track P&L automatically, and get smart exit recommendations based on risk-adjusted analytics.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-20 text-slate-500 dark:text-slate-400">
          <p className="text-sm">
            Powered by institutional-grade mathematics and real-time market data
          </p>
        </div>
      </div>
    </div>
  )
}
