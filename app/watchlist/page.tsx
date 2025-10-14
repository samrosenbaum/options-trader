import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navigation from '@/components/navigation'

export default async function WatchlistPage() {
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-20">
            <div className="text-6xl mb-4">👀</div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Options Watchlist
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
              Coming soon! Track your favorite contracts and get real-time alerts.
            </p>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-2xl mx-auto border border-slate-200 dark:border-slate-800">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
                Planned Features:
              </h3>
              <ul className="text-left space-y-3 text-slate-600 dark:text-slate-400">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <span>Add contracts to your watchlist from the scanner</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <span>Monitor real-time Greeks and price changes</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <span>Set alerts for price targets and probability thresholds</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <span>Quick-add watched contracts to your portfolio</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
