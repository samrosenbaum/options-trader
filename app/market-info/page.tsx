'use client'

import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/navigation'
import LiveTicker from '@/components/live-ticker'
import { PoliticianTradesFeed } from '@/components/politician-trades-feed'
import { LiveNewsFeed } from '@/components/live-news-feed'

export default function MarketInfoPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      setUser(user)
      setLoading(false)
    }

    checkUser()
  }, [router, supabase.auth])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D0D0D]">
      <Navigation userEmail={user.email} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Market Information
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Real-time market data, political trades, and financial news
          </p>
        </div>

        {/* Live Ticker */}
        <div className="mb-8">
          <LiveTicker />
        </div>

        {/* Market Intelligence Feeds */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PoliticianTradesFeed />
          <LiveNewsFeed />
        </div>
      </div>
    </div>
  )
}
