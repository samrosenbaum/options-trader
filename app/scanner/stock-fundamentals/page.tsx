'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/navigation'
import { FundamentalsScanner } from '@/components/fundamentals-scanner'

const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function FindStocksPage() {
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined)
  const [showTooltip, setShowTooltip] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) {
      return
    }

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

    checkAuth().catch(() => {})
  }, [router])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismissed = localStorage.getItem('find-stocks-tooltip-dismissed')
    if (dismissed === 'true') {
      setShowTooltip(false)
    }
  }, [])

  const dismissTooltip = () => {
    setShowTooltip(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem('find-stocks-tooltip-dismissed', 'true')
    }
  }

  const heroBadgeText = SUPABASE_CONFIGURED ? 'Live Fundamentals' : 'Demo Fundamentals'

  return (
    <>
      <Navigation userEmail={userEmail} />
      <main className="min-h-screen bg-slate-50 pb-16 text-slate-900">
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">
                {heroBadgeText}
              </span>
              <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">Find Stocks</h1>
              <p className="mt-4 text-lg text-slate-600">
                Discover fundamentally sound companies ranked by Monty’s multi-factor scoring engine.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-8 max-w-6xl px-6">
          {!SUPABASE_CONFIGURED && (
            <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-700 shadow-sm">
              Demo data is displayed because Supabase credentials are not configured. Configure your Supabase URL and Anon Key to stream live fundamentals directly into this view.
            </div>
          )}

          {showTooltip && (
            <div className="mb-8 rounded-3xl border border-emerald-100 bg-white p-6 shadow-lg">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-emerald-700">How Monty Finds Stocks</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Every company is evaluated across five pillars. We highlight the strengths, weaknesses, and risks so you can make confident decisions quickly.
                  </p>
                  <ul className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <li><span className="font-semibold text-slate-800">Financial Health:</span> Balance sheet strength, cash flow, liquidity</li>
                    <li><span className="font-semibold text-slate-800">Profitability:</span> Margins, ROE, and capital efficiency</li>
                    <li><span className="font-semibold text-slate-800">Growth:</span> Revenue, earnings, and per-share expansion</li>
                    <li><span className="font-semibold text-slate-800">Valuation:</span> Price multiples versus quality</li>
                    <li><span className="font-semibold text-slate-800">Leverage:</span> Debt sustainability and risk controls</li>
                  </ul>
                </div>
                <button
                  onClick={dismissTooltip}
                  className="self-start rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-600 transition-colors hover:border-emerald-300 hover:bg-emerald-100"
                >
                  Got it
                </button>
              </div>
            </div>
          )}

          <div className="mb-10 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-emerald-700">Excellent (80+)</p>
              <p className="mt-2 text-sm text-slate-600">
                Top-tier fundamentals across every category. Institutional-grade balance sheets with consistent execution.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-emerald-600">Good (65-79)</p>
              <p className="mt-2 text-sm text-slate-600">
                Reliable growers with manageable risks. Great for building a watchlist of high-quality ideas.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-sky-600">Fair (50-64)</p>
              <p className="mt-2 text-sm text-slate-600">
                Mixed fundamentals where select catalysts matter. Review carefully before committing capital.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-600">Watch (&lt;50)</p>
              <p className="mt-2 text-sm text-slate-600">
                Weak fundamentals or unresolved risks. Monitor for improvement or new catalysts.
              </p>
            </div>
          </div>

          <FundamentalsScanner limit={50} minScore={50} />

          <div className="mt-12 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Our Methodology
            </h3>
            <div className="mt-4 grid gap-4 text-sm text-slate-600 md:grid-cols-2">
              <div className="space-y-3">
                <p>
                  <span className="font-semibold text-slate-800">Multi-factor scoring:</span> Scores balance growth, profitability, valuation, leverage, and overall financial health.
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Transparent insights:</span> Strengths, weaknesses, and risk factors are surfaced for every ticker.
                </p>
              </div>
              <div className="space-y-3">
                <p>
                  <span className="font-semibold text-slate-800">Analyst validation:</span> Consensus ratings and price targets provide an external check on our models.
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Refresh cadence:</span> Scores refresh daily so you always see up-to-date fundamentals.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
