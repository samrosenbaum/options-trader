'use client'

import Navigation from '@/components/navigation'
import Link from 'next/link'

export default function ScannerGuidePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <Navigation />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/scanner"
            className="inline-flex items-center text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-4"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Scanner
          </Link>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Scanner Guide
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Understand what each scanner does and when to use it
          </p>
        </div>

        {/* Scanner Cards */}
        <div className="space-y-6">
          {/* Layups Scanner */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 flex items-center justify-center text-white font-bold">
                L
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Layups Scanner
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Simple momentum plays - the obvious opportunities
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  What It Does
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Finds high-probability momentum plays with clear setups: pullbacks, breakouts, and bounces.
                  These are &ldquo;obvious&rdquo; trades where the stock is making a big move with volume confirmation.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Criteria
                </h3>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                  <li>Daily move of 3%+ (big movers only)</li>
                  <li>Volume at least 1.5x average (confirmation required)</li>
                  <li>Clear play type: PULLBACK, BREAKOUT, or BOUNCE</li>
                  <li>0-14 days to expiration (short-term plays)</li>
                  <li>Relaxed spread requirement (60% max) for volatile plays</li>
                  <li>Minimum volume: 50 contracts, minimum OI: 50</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  When to Use
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Perfect for fast-moving markets and catching momentum. Use when you want simple,
                  obvious setups without overthinking. Great for day trading and swing trades.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  <strong>Examples:</strong> HOOD up $10 in one day → buy puts for pullback |
                  NVDA breaking ATH on earnings → ride momentum |
                  TSLA down 15% on bad news → buy calls for bounce
                </p>
              </div>
            </div>
          </div>

          {/* UOA Scanner */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-600 flex items-center justify-center text-white font-bold">
                U
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Unusual Options Activity (UOA) Scanner
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Catch smart money moves before the big price action
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  What It Does
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Detects when smart money (institutions, insiders) is positioning BEFORE news breaks.
                  Looks for abnormally high options volume relative to open interest - indicating
                  someone knows something you don&apos;t... yet.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Criteria
                </h3>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                  <li>Volume/OI ratio ≥ 2.0x (2x more volume than open interest)</li>
                  <li>Minimum 500 contracts traded</li>
                  <li>Focuses on nearest expiration (most liquid)</li>
                  <li>Flags ATM strikes (highest conviction plays)</li>
                  <li>Identifies bullish (call sweeps) vs bearish (put sweeps) bias</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  When to Use
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Perfect for catching moves BEFORE they happen. Use daily to spot unusual positioning.
                  Great for finding plays before analyst upgrades, earnings beats, or other catalysts.
                </p>
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                <p className="text-xs text-orange-800 dark:text-orange-300">
                  <strong>Real Example (COIN):</strong> On 10/23, COIN $345 calls had 7,249 volume
                  vs 2,171 OI (3.3x ratio). Next day, JP Morgan upgraded COIN and it ripped +$25.
                  The smart money bought calls the day before the upgrade was announced.
                </p>
              </div>
            </div>
          </div>

          {/* Top Movers Scanner */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 flex items-center justify-center text-white font-bold">
                M
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Top Movers Scanner
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  High-volume momentum plays
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  What It Does
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Targets stocks making significant moves with institutional-level volume.
                  Similar to Layups but requires higher absolute volume.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Criteria
                </h3>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                  <li>Daily move of 3%+ (momentum required)</li>
                  <li>Absolute volume of 800k+ (institutional participation)</li>
                  <li>Wider spread tolerance (35% max) for volatile stocks</li>
                  <li>Minimum volume: 5 contracts, minimum OI: 10</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  When to Use
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Best for finding high-liquidity plays with institutional money flow.
                  Use when you want the safety of high volume and tight spreads on volatile stocks.
                </p>
              </div>
            </div>
          </div>

          {/* Earnings Scanner */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center text-white font-bold">
                E
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Earnings Scanner
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Pre-earnings volatility plays
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  What It Does
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Finds stocks with upcoming earnings announcements (7-14 days out).
                  Perfect for IV expansion plays and earnings run-ups.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Criteria
                </h3>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                  <li>Earnings announcement in 7-14 days</li>
                  <li>Historical earnings volatility analysis</li>
                  <li>IV expansion opportunities before earnings</li>
                  <li>Options with expiration covering earnings date</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  When to Use
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Use when you want to capitalize on pre-earnings IV expansion.
                  Great for selling premium (credit spreads, iron condors) or buying directional plays
                  based on technical setup before earnings.
                </p>
              </div>

              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <p className="text-xs text-purple-800 dark:text-purple-300">
                  <strong>Pro Tip:</strong> IV typically expands 3-7 days before earnings.
                  Enter positions early to capture IV expansion, or sell premium when IV is elevated.
                </p>
              </div>
            </div>
          </div>

          {/* Institutional Scanner */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 flex items-center justify-center text-white font-bold">
                I
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Institutional Scanner (Default)
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Professional-grade analysis with strict filters
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  What It Does
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Full institutional-grade analysis combining historical data, backtesting,
                  Greeks calculations, and probability analysis. The most comprehensive scanner
                  with strict quality filters.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Criteria
                </h3>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                  <li>Tight spreads (15% max) for quality execution</li>
                  <li>Historical move analysis (30-day lookback)</li>
                  <li>Strategy backtesting (win rate, avg profit)</li>
                  <li>Real-time Greeks (Delta, Gamma, Theta, Vega)</li>
                  <li>Black-Scholes probability analysis</li>
                  <li>Fresh data (max 15 minutes old)</li>
                  <li>Minimum volume: 5 contracts, minimum OI: 10</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Components
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white mb-1">
                      Historical Analysis
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      Analyzes past price movements to calculate probability of target being hit
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white mb-1">
                      Backtesting
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      Tests strategy on historical data to show win rate and average profit
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white mb-1">
                      Greeks Calculator
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      Real-time Delta, Gamma, Theta, Vega for risk management
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white mb-1">
                      Probability Analysis
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      Black-Scholes model for theoretical probability of profit
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  When to Use
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Use for high-quality, thoroughly analyzed trades. Best for swing trades and
                  position trading where you want comprehensive data and risk metrics.
                  Takes longer to scan but provides the most complete analysis.
                </p>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4">
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  <strong>Best For:</strong> Serious traders who want professional-grade analysis.
                  If you&apos;re managing a portfolio or trading with significant capital,
                  this scanner gives you the data edge you need.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="mt-8 bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
            Quick Comparison
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    Scanner
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    Speed
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    Best For
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    Trade Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <td className="py-3 px-4 text-slate-900 dark:text-white font-medium">
                    Layups
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    Fast (30s)
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    Momentum trades
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    0-14 days
                  </td>
                </tr>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <td className="py-3 px-4 text-slate-900 dark:text-white font-medium">
                    Top Movers
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    Medium (1-2m)
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    High-volume plays
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    0-30 days
                  </td>
                </tr>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <td className="py-3 px-4 text-slate-900 dark:text-white font-medium">
                    Earnings
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    Medium (1-2m)
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    IV expansion
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    7-14 days
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-slate-900 dark:text-white font-medium">
                    Institutional
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    Slow (3-5m)
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    Quality analysis
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    7-45 days
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Back Button */}
        <div className="mt-8 text-center">
          <Link
            href="/scanner"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Scanner
          </Link>
        </div>
      </div>
    </div>
  )
}
