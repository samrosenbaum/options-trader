'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { BarChart3, Eye, Briefcase, Newspaper } from 'lucide-react'
import { useState, useEffect } from 'react'

const FUN_GREETINGS = [
  "Looking sharp today!",
  "Ready to print money?",
  "Let's get those gains!",
  "Time to make it rain!",
  "Future millionaire spotted!",
  "Money moves only!",
  "Wealth builder in the house!",
  "You're crushing it!",
  "Born to trade!",
  "Opportunity seeker online!",
]

export default function Navigation({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    // Pick a random greeting on mount
    const randomGreeting = FUN_GREETINGS[Math.floor(Math.random() * FUN_GREETINGS.length)]
    setGreeting(randomGreeting)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const navItems = [
    { href: '/', label: 'Scanner', icon: BarChart3 },
    { href: '/market-info', label: 'Market Info', icon: Newspaper },
    { href: '/watchlist', label: 'Watchlist', icon: Eye },
    { href: '/portfolio', label: 'Portfolio', icon: Briefcase },
  ]

  return (
    <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <div className="flex items-center gap-3">
            <Image
              src="/money-printer.png"
              alt="Money Printer"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                Money Printer
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Find explosive trading opportunities
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              const IconComponent = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    isActive
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <IconComponent className="w-4 h-4" />
                  {item.label}
                </Link>
              )
            })}
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            {userEmail && greeting && (
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hidden sm:block">
                {greeting}
              </span>
            )}
            <button
              onClick={handleSignOut}
              className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
