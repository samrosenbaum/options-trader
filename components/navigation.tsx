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
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    // Pick a random greeting on mount
    const randomGreeting = FUN_GREETINGS[Math.floor(Math.random() * FUN_GREETINGS.length)]
    setGreeting(randomGreeting)
  }, [])

  useEffect(() => {
    // Close the mobile nav when the route changes
    setIsMenuOpen(false)
  }, [pathname])

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
        <div className="flex items-center justify-between h-16 gap-4">
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

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-white dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900 md:hidden"
            aria-label="Toggle navigation menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Navigation Links */}
          <div className="hidden md:flex md:flex-1 md:items-center md:justify-center md:gap-1">
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
          <div className="hidden md:flex md:items-center md:gap-4">
            {userEmail && greeting && (
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
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

      {/* Mobile navigation */}
      <div className={`md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-[max-height,opacity] duration-200 ease-out ${isMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="px-4 pt-2 pb-4 space-y-3">
          <div className="flex flex-col">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>

          <div className="rounded-lg bg-slate-100/60 p-3 dark:bg-slate-800/60">
            {userEmail && greeting && (
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-300">{greeting}</p>
            )}
            <Link
              href="/settings"
              className={`mt-2 inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                pathname === '/settings'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600'
                  : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
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
