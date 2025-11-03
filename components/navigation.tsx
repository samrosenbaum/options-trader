'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

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

type NavItem = {
  href?: string
  label: string
  dropdownItems?: Array<{ href: string; label: string }>
}

export default function Navigation({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname()
  const [greeting, setGreeting] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  useEffect(() => {
    // Pick a random greeting on mount
    const randomGreeting = FUN_GREETINGS[Math.floor(Math.random() * FUN_GREETINGS.length)]
    setGreeting(randomGreeting)
  }, [])

  useEffect(() => {
    // Close the mobile nav when the route changes
    setIsMenuOpen(false)
    setExpandedSection(null)
  }, [pathname])

  const navItems: NavItem[] = [
    { href: '/', label: 'Desk' },
    { href: '/scanner', label: 'Find Trades' },
    {
      label: 'Market Movers',
      dropdownItems: [
        { href: '/macro', label: 'Macro' },
        { href: '/sentiments', label: 'Sentiments' },
      ],
    },
    {
      label: 'Your Positions',
      dropdownItems: [
        { href: '/portfolio', label: 'Portfolio' },
        { href: '/watchlist', label: 'Watchlist' },
        { href: '/rejection-learning', label: 'Anti-Portfolio' },
      ],
    },
  ]

  return (
    <nav className="sticky top-0 z-50 mx-4 mt-4 mb-6">
      <div className="relative rounded-[2rem] border border-white/20 bg-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/25 dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] max-w-7xl mx-auto px-6 sm:px-8 lg:px-10">
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
            className={`group relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10 text-slate-700 shadow-[0_10px_40px_rgba(16,185,129,0.15)] transition-all duration-300 ease-out hover:border-emerald-300/60 hover:shadow-[0_12px_45px_rgba(16,185,129,0.35)] focus-visible:outline-none focus-visible:ring-0 after:pointer-events-none after:absolute after:inset-[-8px] after:rounded-full after:border after:border-emerald-400/40 after:opacity-0 after:transition-all after:duration-300 after:ease-out after:content-[''] focus-visible:after:opacity-100 focus-visible:after:animate-pulse dark:border-white/10 dark:bg-slate-900/30 dark:text-slate-200 dark:hover:border-emerald-400/70 ${
              isMenuOpen ? 'scale-95 bg-emerald-200/20 dark:bg-emerald-500/10' : ''
            } md:hidden`}
            aria-label="Toggle navigation menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-400/10 via-blue-400/5 to-transparent opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100" />
            <span
              className={`relative block h-0.5 w-6 -translate-y-2 rounded-full bg-current transition-all duration-300 ease-out ${
                isMenuOpen ? 'translate-y-0 rotate-45' : ''
              }`}
            />
            <span
              className={`relative block h-0.5 w-6 rounded-full bg-current transition-all duration-300 ease-out ${
                isMenuOpen ? 'scale-x-0 opacity-0' : 'opacity-100'
              }`}
            />
            <span
              className={`relative block h-0.5 w-6 translate-y-2 rounded-full bg-current transition-all duration-300 ease-out ${
                isMenuOpen ? 'translate-y-0 -rotate-45' : ''
              }`}
            />
          </button>

          {/* Navigation Links */}
          <div className="hidden md:flex md:flex-1 md:items-center md:justify-center md:gap-1">
            {navItems.map((item, index) => {
              if (item.dropdownItems) {
                // Dropdown menu item
                const isActive = item.dropdownItems.some((dropItem) => pathname === dropItem.href)
                return (
                  <div key={index} className="group relative">
                    <button
                      className={`flex items-center gap-1 px-4 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      {item.label}
                      <ChevronDown className="h-4 w-4 transition-transform group-hover:rotate-180" />
                    </button>
                    {/* Dropdown menu - with padding bridge to prevent gap */}
                    <div className="absolute left-0 top-full pt-2 hidden group-hover:block">
                      <div className="w-48 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        <div className="py-2">
                          {item.dropdownItems.map((dropItem) => {
                            const isDropActive = pathname === dropItem.href
                            return (
                              <Link
                                key={dropItem.href}
                                href={dropItem.href}
                                className={`block px-4 py-2 text-sm transition-colors ${
                                  isDropActive
                                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                                }`}
                              >
                                {dropItem.label}
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              } else {
                // Regular link item
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href!}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              }
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
      <div
        className={`md:hidden overflow-hidden border-t border-emerald-500/10 bg-white shadow-[0_25px_70px_-20px_rgba(16,185,129,0.45)] transition-all duration-300 ease-out dark:border-emerald-400/10 dark:bg-slate-950 ${
          isMenuOpen
            ? 'pointer-events-auto max-h-[28rem] opacity-100 translate-y-0'
            : 'pointer-events-none max-h-0 -translate-y-3 opacity-0'
        }`}
      >
        <div className="relative px-4 pt-3 pb-5 space-y-4">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 via-blue-400 to-blue-500 opacity-80" />
          <div className="flex flex-col space-y-2">
            {navItems.map((item, index) => {
              if (item.dropdownItems) {
                // Dropdown section for mobile - collapsible
                const isActive = item.dropdownItems.some((dropItem) => pathname === dropItem.href)
                const isExpanded = expandedSection === item.label
                return (
                  <div key={index} className="space-y-1">
                    <button
                      onClick={() => setExpandedSection(isExpanded ? null : item.label)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
                      }`}
                    >
                      {item.label}
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-300 ${
                        isExpanded ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      {item.dropdownItems.map((dropItem) => {
                        const isDropActive = pathname === dropItem.href
                        return (
                          <Link
                            key={dropItem.href}
                            href={dropItem.href}
                            className={`block rounded-lg px-3 py-2 pl-6 text-sm font-medium transition-colors ${
                              isDropActive
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
                            }`}
                          >
                            {dropItem.label}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              } else {
                // Regular link for mobile
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href!}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              }
            })}
          </div>

          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/40 via-emerald-50/20 to-transparent p-4 shadow-inner backdrop-blur-lg dark:border-white/5 dark:from-slate-900/50 dark:via-emerald-500/5 dark:to-transparent">
            <span className="pointer-events-none absolute -left-12 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-emerald-400/20 blur-3xl" />
            <span className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-blue-400/20 blur-3xl" />
            {userEmail && greeting && (
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-300">{greeting}</p>
            )}
            <Link
              href="/settings"
              className={`group relative mt-3 inline-flex w-full items-center justify-center overflow-hidden rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-300 ${
                pathname === '/settings'
                  ? 'bg-gradient-to-r from-emerald-500 via-emerald-600 to-blue-500 text-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.7)]'
                  : 'bg-white/80 text-slate-700 hover:bg-emerald-50/80 hover:text-emerald-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-400/10 via-blue-400/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              Account
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
