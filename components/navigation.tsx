'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
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
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    // Pick a random greeting on mount
    const randomGreeting = FUN_GREETINGS[Math.floor(Math.random() * FUN_GREETINGS.length)]
    setGreeting(randomGreeting)
  }, [])

  const navItems = [
    { href: '/scanner', label: 'Scanner' },
    { href: '/macro', label: 'Macro' },
    { href: '/market-info', label: 'Market Info' },
    { href: '/rejection-learning', label: 'Anti-Portfolio' },
    { href: '/watchlist', label: 'Watchlist' },
    { href: '/portfolio', label: 'Portfolio' },
  ]

  return (
    <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand - Clickable, links to dashboard */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image
              src="/Monty_logo.png"
              alt="Money Printer - Your personal trading desk"
              width={70}
              height={70}
              className="rounded-lg"
            />
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
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
            <Link
              href="/settings"
              className={`text-sm px-3 py-2 rounded-lg transition-colors ${
                pathname === '/settings'
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Account
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
