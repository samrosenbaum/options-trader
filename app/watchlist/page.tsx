import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navigation from '@/components/navigation'
import Link from 'next/link'
import WatchlistView from '@/components/watchlist-view'

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
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                Options Watchlist
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Keep tabs on contracts you&apos;re considering. Add ideas from the scanner, review the thesis later, and prune the list as setups evolve.
              </p>
            </div>
            <Link
              href="/scanner-page"
              className="inline-flex items-center justify-center rounded-xl border border-emerald-500 px-5 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
            >
              ← Back to Scanner
            </Link>
          </div>

          <WatchlistView />
        </div>
      </div>
    </>
  )
}
