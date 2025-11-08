import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navigation from '@/components/navigation'
import { BearishSignalScanner } from '@/components/bearish-signal-scanner'
import { Info } from 'lucide-react'

export default async function BearishSignalsRoute() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <>
      <Navigation userEmail={user.email} />
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Info Tooltip */}
        <div className="mb-6 rounded-2xl border border-blue-200/50 bg-gradient-to-br from-blue-50/80 via-indigo-50/60 to-blue-50/40 p-5 shadow-lg backdrop-blur-sm dark:border-blue-500/20 dark:from-slate-900/80 dark:via-blue-950/40 dark:to-slate-900/60">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-blue-500/10 p-2 dark:bg-blue-400/10">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="mb-2 text-lg font-semibold text-blue-900 dark:text-blue-100">
                Bearish Directional Scanner
              </h3>
              <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                <p>
                  <span className="font-semibold">Purpose:</span> Predict which stocks are likely to move down based on technical indicators
                </p>
                <p>
                  <span className="font-semibold">Methods:</span> Analyzes put/call ratios, dark pool activity, gamma exposure, short interest, and volume patterns
                </p>
                <p>
                  <span className="font-semibold">Output:</span> Stocks with bearish signals, confidence scores, recommended strike prices, and expected ROI
                </p>
                <p>
                  <span className="font-semibold">Best For:</span> Finding high-probability bearish plays with 90%+ confidence indicators
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Scanner Component */}
        <BearishSignalScanner limit={20} minScore={8} />
      </main>
    </>
  )
}
