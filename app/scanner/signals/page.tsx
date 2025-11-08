'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { redirect, useRouter } from 'next/navigation'
import Navigation from '@/components/navigation'
import { BearishSignalScanner } from '@/components/bearish-signal-scanner'
import { Info, TrendingDown, TrendingUp, X } from 'lucide-react'
import { useEffect } from 'react'

type SignalType = 'bearish' | 'bullish'

export default function SignalsPage() {
  const [selectedSignal, setSelectedSignal] = useState<SignalType>('bearish')
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
    const dismissed = localStorage.getItem('signals-scanner-tooltip-dismissed')
    if (dismissed === 'true') {
      setShowTooltip(false)
    }
  }, [])

  const dismissTooltip = () => {
    setShowTooltip(false)
    localStorage.setItem('signals-scanner-tooltip-dismissed', 'true')
  }

  return (
    <>
      <Navigation userEmail={userEmail} />
      <main className="relative min-h-screen overflow-hidden bg-[#05070E] text-slate-100">
        {/* Background Effects */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute bottom-[-18rem] left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-sky-500/10 blur-3xl" />
          <div className="absolute top-1/3 -right-40 h-[26rem] w-[26rem] rounded-full bg-purple-500/10 blur-3xl" />
        </div>

        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Signal Type Tabs */}
          <div className="mb-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setSelectedSignal('bearish')}
              className={`group relative flex items-center gap-2 rounded-xl px-6 py-4 text-base font-semibold transition-all duration-200 ${
                selectedSignal === 'bearish'
                  ? 'bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-lg shadow-red-500/40'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700'
              }`}
            >
              <TrendingDown className="h-5 w-5" />
              Bearish Signals
            </button>

            <button
              disabled
              className="group relative flex items-center gap-2 rounded-xl px-6 py-4 text-base font-semibold transition-all duration-200 bg-slate-800/30 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60"
            >
              <TrendingUp className="h-5 w-5" />
              Bullish Signals
              <span className="ml-2 text-xs bg-slate-700/50 px-2 py-1 rounded-md">Coming Soon</span>
            </button>
          </div>

          {/* Info Tooltip */}
          {selectedSignal === 'bearish' && showTooltip && (
            <div className="mb-6 rounded-2xl border border-red-200/30 bg-gradient-to-br from-red-900/30 via-slate-900/50 to-red-950/30 p-5 shadow-lg backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-red-500/10 p-2">
                  <Info className="h-5 w-5 text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="mb-2 text-lg font-semibold text-red-100">
                    Bearish Directional Scanner
                  </h3>
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>
                      <span className="font-semibold text-red-300">Purpose:</span> Predict which stocks are likely to move down based on technical indicators
                    </p>
                    <p>
                      <span className="font-semibold text-red-300">Methods:</span> Analyzes put/call ratios, dark pool activity, gamma exposure, short interest, and volume patterns
                    </p>
                    <p>
                      <span className="font-semibold text-red-300">Output:</span> Stocks with bearish signals, confidence scores, recommended strike prices, and expected ROI
                    </p>
                    <p>
                      <span className="font-semibold text-red-300">Best For:</span> Finding high-probability bearish plays with 90%+ confidence indicators
                    </p>
                  </div>
                </div>
                <button
                  onClick={dismissTooltip}
                  className="rounded-lg p-1 text-red-300 hover:bg-red-500/10 hover:text-red-200 transition-colors"
                  aria-label="Dismiss tooltip"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* Scanner Component */}
          {selectedSignal === 'bearish' && <BearishSignalScanner limit={20} minScore={8} />}

          {selectedSignal === 'bullish' && (
            <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-12 text-center">
              <TrendingUp className="h-16 w-16 mx-auto mb-4 text-slate-600" />
              <h3 className="text-2xl font-semibold text-slate-400 mb-2">Bullish Signals Coming Soon</h3>
              <p className="text-slate-500">
                We're working on bringing you high-confidence bullish setups using the same advanced indicators.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
