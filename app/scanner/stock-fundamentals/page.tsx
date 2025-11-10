'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/navigation'
import { FundamentalsScanner } from '@/components/fundamentals-scanner'
import { ChatStockScanner } from '@/components/chat-stock-scanner'

export default function UnifiedFundamentalsPage() {
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined)
  const [showTooltip, setShowTooltip] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      setUserEmail(user.email)
    }

    checkAuth()
  }, [router])

  useEffect(() => {
    // Load tooltip dismissed state from localStorage
    const dismissed = localStorage.getItem('fundamentals-scanner-tooltip-dismissed')
    if (dismissed === 'true') {
      setShowTooltip(false)
    }
  }, [])

  const dismissTooltip = () => {
    setShowTooltip(false)
    localStorage.setItem('fundamentals-scanner-tooltip-dismissed', 'true')
  }

  return (
    <>
      <Navigation userEmail={userEmail} />
      <main className="relative min-h-screen overflow-hidden bg-[#05070E] text-slate-100">
        {/* Background Effects */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute bottom-[-18rem] left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute top-1/3 -right-40 h-[26rem] w-[26rem] rounded-full bg-purple-500/10 blur-3xl" />
        </div>

        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Page Header */}
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-white mb-3">
              Stock Fundamentals Scanner
            </h1>
            <p className="text-slate-400 text-lg">
              Discover high-quality stock buying opportunities based on fundamental analysis
            </p>
          </div>

          {/* Info Tooltip */}
          {showTooltip && (
            <div className="mb-6 rounded-2xl border border-emerald-200/30 bg-gradient-to-br from-emerald-900/30 via-slate-900/50 to-emerald-950/30 p-5 shadow-lg backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-emerald-100">
                      How the Fundamentals Scanner Works
                    </h3>
                    <button
                      onClick={dismissTooltip}
                      className="rounded-lg px-3 py-1 text-sm text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200 transition-colors"
                      aria-label="Dismiss tooltip"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>
                      <span className="font-semibold text-emerald-300">Purpose:</span> Identify stocks with strong fundamentals that represent high-quality buying opportunities
                    </p>
                    <p>
                      <span className="font-semibold text-emerald-300">Analysis:</span> Multi-factor evaluation across 5 dimensions:
                    </p>
                    <ul className="ml-6 mt-1 space-y-1 list-disc text-slate-400">
                      <li><strong className="text-slate-300">Financial Health (25%):</strong> Debt levels, cash flow, liquidity</li>
                      <li><strong className="text-slate-300">Profitability (25%):</strong> Margins, ROE, capital efficiency</li>
                      <li><strong className="text-slate-300">Growth (20%):</strong> Revenue and earnings growth trends</li>
                      <li><strong className="text-slate-300">Valuation (15%):</strong> P/E, PEG, price-to-sales ratios</li>
                      <li><strong className="text-slate-300">Leverage (15%):</strong> Debt management and financial stability</li>
                    </ul>
                    <p className="mt-2">
                      <span className="font-semibold text-emerald-300">Output:</span> Quality-rated stocks (Excellent/Good/Fair) with detailed breakdowns of strengths, weaknesses, and risk factors
                    </p>
                    <p>
                      <span className="font-semibold text-emerald-300">Best For:</span> Long-term investors seeking fundamentally sound companies with growth potential and reasonable valuations
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quality Tiers Explanation */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-900/20 p-4">
              <div className="text-emerald-400 font-semibold mb-1">
                Excellent (80+)
              </div>
              <p className="text-xs text-slate-400">
                Outstanding fundamentals across all metrics. Strong buy candidates with minimal concerns.
              </p>
            </div>
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-900/10 p-4">
              <div className="text-emerald-300 font-semibold mb-1">
                Good (65-79)
              </div>
              <p className="text-xs text-slate-400">
                Solid fundamentals with minor weaknesses. Quality buy opportunities for most investors.
              </p>
            </div>
            <div className="rounded-xl border border-slate-400/30 bg-slate-900/20 p-4">
              <div className="text-slate-300 font-semibold mb-1">
                Fair (50-64)
              </div>
              <p className="text-xs text-slate-400">
                Mixed fundamentals. Suitable for selective positioning with careful consideration.
              </p>
            </div>
            <div className="rounded-xl border border-slate-400/20 bg-slate-900/10 p-4">
              <div className="text-slate-400 font-semibold mb-1">
                Watch (&lt;50)
              </div>
              <p className="text-xs text-slate-400">
                Weak fundamentals. Monitor for improvement before considering investment.
              </p>
            </div>
          </div>

          {/* Side-by-Side Layout: Chat Scanner and Card View */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Chat Scanner */}
            <div>
              <h2 className="text-xl font-semibold text-white mb-4">Chat Scanner</h2>
              <ChatStockScanner />
            </div>

            {/* Card View Scanner */}
            <div>
              <h2 className="text-xl font-semibold text-white mb-4">All Signals</h2>
              <FundamentalsScanner limit={50} minScore={50} />
            </div>
          </div>

          {/* Methodology Note */}
          <div className="mt-8 rounded-xl border border-slate-700/50 bg-slate-900/30 p-6">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
              About Our Methodology
            </h4>
            <div className="space-y-2 text-sm text-slate-400">
              <p>
                <strong className="text-slate-300">Multi-Factor Analysis:</strong> We don't rely on any single metric. Stocks must score well across multiple dimensions to rank highly.
              </p>
              <p>
                <strong className="text-slate-300">Transparent Reasoning:</strong> Every stock shows its strengths, weaknesses, and specific risk factors so you can make informed decisions.
              </p>
              <p>
                <strong className="text-slate-300">External Validation:</strong> Analyst consensus is included as a reality check against our algorithmic scoring.
              </p>
              <p>
                <strong className="text-slate-300">Risk-Adjusted:</strong> High scores require both strong performance AND manageable risk. We highlight concerns prominently.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
