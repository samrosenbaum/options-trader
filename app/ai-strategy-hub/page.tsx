'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

import Navigation from '@/components/navigation'
import AIStrategyHub from '@/components/ai-strategy-hub'
import { createClient } from '@/lib/supabase/client'

export default function AIStrategyHubPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let isActive = true

    const fetchUser = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()

        if (!isActive) return

        if (error || !user) {
          router.replace('/auth/login')
          return
        }

        setUser(user)
      } catch (error) {
        if (isActive) {
          console.error('Failed to fetch user for AI Strategy Hub', error)
          router.replace('/auth/login')
        }
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    fetchUser()

    return () => {
      isActive = false
    }
  }, [router, supabase])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-600 text-sm">Warming up the AI playbook…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Navigation userEmail={user.email ?? undefined} />
      <main className="py-8">
        <AIStrategyHub />
      </main>
    </div>
  )
}
