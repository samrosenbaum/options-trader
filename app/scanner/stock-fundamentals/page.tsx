'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/navigation'
import { FundamentalsScanner } from '@/components/fundamentals-scanner'
import { ChatStockScanner } from '@/components/chat-stock-scanner'
import { Info, BarChart3, X, MessageSquare, Grid3X3 } from 'lucide-react'

type ViewMode = 'cards' | 'chat'

export default function UnifiedFundamentalsPage() {
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined)
  const [showTooltip, setShowTooltip] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('chat')
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
            <div className="flex items-center justify-center gap-3 mb-3">
              <BarChart3 className="h-8 w-8 text-emerald-400" />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                Stock Fundamentals Scanner
              </h1>
            </div>
            <p className="text-slate-400 text-lg">
              Discover high-quality stock buying opportunities based on fundamental analysis
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="mb-6 flex justify-center">
            <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur-sm">
              <button
                onClick={() => setViewMode('chat')}
                className={`flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-all ${
                  viewMode === 'chat'
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="h-4 w-4" />
                Chat Scanner
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-all ${
                  viewMode === 'cards'
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Grid3X3 className="h-4 w-4" />
                Card View
              </button>
            </div>
          </div>

          {/* Info Tooltip */}
          {showTooltip && (
            <div className="mb-6 rounded-2xl border border-emerald-200/30 bg-gradient-to-br from-emerald-900/30 via-slate-900/50 to-emerald-950/30 p-5 shadow-lg backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-emerald-500/10 p-2">
                  <Info className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h3 className="mb-2 text-lg font-semibold text-emerald-100">
                    How the Fundamentals Scanner Works
                  </h3>
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
                <button
                  onClick={dismissTooltip}
                  className="rounded-lg p-1 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200 transition-colors"
                  aria-label="Dismiss tooltip"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* Quality Tiers Explanation - Only show in card view */}
          {viewMode === 'cards' && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-900/20 p-4">
                <div className="text-emerald-400 font-semibold mb-1 flex items-center gap-2">
                  <span>⭐</span> Excellent (80+)
                </div>
                <p className="text-xs text-slate-400">
                  Outstanding fundamentals across all metrics. Strong buy candidates with minimal concerns.
                </p>
              </div>
              <div className="rounded-xl border border-blue-400/30 bg-blue-900/20 p-4">
                <div className="text-blue-400 font-semibold mb-1 flex items-center gap-2">
                  <span>💎</span> Good (65-79)
                </div>
                <p className="text-xs text-slate-400">
                  Solid fundamentals with minor weaknesses. Quality buy opportunities for most investors.
                </p>
              </div>
              <div className="rounded-xl border border-amber-400/30 bg-amber-900/20 p-4">
                <div className="text-amber-400 font-semibold mb-1 flex items-center gap-2">
                  <span>📊</span> Fair (50-64)
                </div>
                <p className="text-xs text-slate-400">
                  Mixed fundamentals. Suitable for selective positioning with careful consideration.
                </p>
              </div>
              <div className="rounded-xl border border-slate-400/30 bg-slate-900/20 p-4">
                <div className="text-slate-400 font-semibold mb-1 flex items-center gap-2">
                  <span>⚠️</span> Watch (&lt;50)
                </div>
                <p className="text-xs text-slate-400">
                  Weak fundamentals. Monitor for improvement before considering investment.
                </p>
              </div>
            </div>
          )}

          {/* Scanner Components */}
          {viewMode === 'chat' ? (
            <ChatStockScanner />
          ) : (
            <FundamentalsScanner limit={50} minScore={50} />
          )}

          {/* Methodology Note */}
          <div className="mt-8 rounded-xl border border-slate-700/50 bg-slate-900/30 p-6">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
              📊 About Our Methodology
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
