'use client'

import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/app-shell'
import LiveTicker from '@/components/live-ticker'
import { PoliticianTradesFeed } from '@/components/politician-trades-feed'
import { LiveNewsFeed } from '@/components/live-news-feed'
import { WSBTrending } from '@/components/wsb-trending'

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
      <div className="min-h-screen flex items-center justify-center bg-[#05070E]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-emerald-100/70">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <AppShell
      userEmail={user.email}
      mainClassName="relative min-h-screen overflow-hidden bg-[#05070E] text-slate-100"
    >
      {/* Immersive Background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute bottom-[-18rem] left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[26rem] w-[26rem] rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.75),transparent_60%)]" />
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Market Information
          </h1>
          <p className="text-emerald-100/70">
            Real-time market data, political trades, and financial news
          </p>
        </div>

        {/* Live Ticker */}
        <div className="mb-8">
          <LiveTicker />
        </div>

        {/* WSB Trending */}
        <div className="mb-8">
          <WSBTrending />
        </div>

        {/* Market Intelligence Feeds */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PoliticianTradesFeed />
          <LiveNewsFeed />
        </div>
      </div>
    </AppShell>
  )
}
