'use client'

import type { ComponentType } from 'react'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Bookmark,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Menu,
  Radar,
  Scan,
  Settings,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const FUN_GREETINGS = [
  'Looking sharp today!',
  'Ready to print money?',
  "Let's get those gains!",
  'Time to make it rain!',
  'Future millionaire spotted!',
  'Money moves only!',
  'Wealth builder in the house!',
  "You're crushing it!",
  'Born to trade!',
  'Opportunity seeker online!',
]

type NavLink = {
  href: string
  label: string
  description: string
  icon: ComponentType<{ className?: string }>
}

type NavSection = {
  title: string
  links: NavLink[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Your Desk',
    links: [
      {
        href: '/',
        label: 'Overview',
        description: 'Portfolio health, winners, and risk alerts',
        icon: LayoutDashboard,
      },
      {
        href: '/portfolio',
        label: 'Portfolio',
        description: 'Positions, sizing, and open risk',
        icon: Briefcase,
      },
      {
        href: '/rejection-learning',
        label: 'Anti-Portfolio',
        description: 'Review missed trades and sharpen instincts',
        icon: Brain,
      },
      {
        href: '/watchlist',
        label: 'Watchlist',
        description: 'Names you are tracking closely',
        icon: Bookmark,
      },
    ],
  },
  {
    title: 'Find Trades',
    links: [
      {
        href: '/scanner',
        label: 'Options Scanner',
        description: 'Deploy Monty to surface asymmetric trades',
        icon: Scan,
      },
      {
        href: '/scanner/signals',
        label: 'By Signal',
        description: 'Ideas grouped by Monty’s conviction',
        icon: Radar,
      },
      {
        href: '/scanner/fundamentals',
        label: 'Find Stocks',
        description: 'Equity screeners tuned for options traders',
        icon: BarChart3,
      },
    ],
  },
  {
    title: 'Market Lens',
    links: [
      {
        href: '/macro',
        label: 'Macro Dashboard',
        description: 'Leading indicators and volatility regimes',
        icon: BarChart3,
      },
      {
        href: '/sentiments',
        label: 'Sentiment',
        description: 'Positioning, flow, and risk appetite',
        icon: Radar,
      },
      {
        href: '/crypto',
        label: 'Crypto (Alpha)',
        description: 'Momentum scans for digital assets',
        icon: TrendingUp,
      },
    ],
  },
]

function NavigationList({ pathname, isCollapsed = false }: { pathname: string; isCollapsed?: boolean }) {
  if (isCollapsed) {
    return (
      <nav className="flex flex-col gap-4">
        {NAV_SECTIONS.map((section, sectionIndex) => (
          <div key={section.title} className="flex flex-col gap-2">
            {section.links.map((link) => {
              const isActive = pathname === link.href
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'group relative flex h-12 items-center justify-center rounded-2xl border text-slate-600 transition-all duration-200',
                    isActive
                      ? 'border-emerald-400/60 bg-emerald-50 text-emerald-700 shadow-sm'
                      : 'border-transparent bg-transparent hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-600'
                  )}
                  aria-label={link.label}
                >
                  <Icon className="h-5 w-5" />
                  <span className="pointer-events-none absolute left-full top-1/2 ml-3 w-48 -translate-y-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
                    <span className="block font-semibold">{link.label}</span>
                    <span className="mt-1 block text-xs text-slate-500">{link.description}</span>
                  </span>
                </Link>
              )
            })}
            {sectionIndex < NAV_SECTIONS.length - 1 && (
              <div className="mx-auto h-px w-8 bg-slate-200" aria-hidden />
            )}
          </div>
        ))}
      </nav>
    )
  }

  return (
    <nav className="space-y-8">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {section.title}
          </p>
          <div className="mt-4 space-y-2">
            {section.links.map((link) => {
              const isActive = pathname === link.href
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`group flex flex-col gap-1 rounded-2xl border px-4 py-3 transition-all duration-200 ${
                    isActive
                      ? 'border-emerald-400/60 bg-emerald-50 text-emerald-700 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/60 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-semibold ${
                        isActive
                          ? 'border-emerald-300 bg-white text-emerald-600'
                          : 'border-slate-200 bg-slate-50 text-slate-500 group-hover:border-emerald-200 group-hover:text-emerald-600'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-semibold tracking-tight">{link.label}</span>
                  </div>
                  <span className="pl-12 text-xs text-slate-500">
                    {link.description}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

function UserPanel({ userEmail, greeting }: { userEmail?: string; greeting: string }) {
  if (!userEmail) return null

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
        Logged in
      </p>
      <p className="mt-2 text-sm font-medium text-slate-600">{userEmail}</p>
      <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        {greeting}
      </p>
      <Link
        href="/settings"
        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
      >
        <Settings className="h-4 w-4" /> Manage account
      </Link>
    </div>
  )
}

export default function Navigation({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname()
  const [greeting, setGreeting] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const randomGreeting = FUN_GREETINGS[Math.floor(Math.random() * FUN_GREETINGS.length)]
    setGreeting(randomGreeting)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <>
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <Image src="/Monty_logo.png" alt="Monty" width={40} height={40} className="rounded-lg" />
          <span className="text-sm font-semibold tracking-tight text-slate-700">Monty Desk</span>
        </Link>
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Desk</div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            role="presentation"
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-white px-6 py-8 shadow-xl">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/Monty_logo.png" alt="Monty" width={48} height={48} className="rounded-xl" />
              <div>
                <p className="text-base font-semibold tracking-tight text-slate-800">Monty</p>
                <p className="text-xs text-slate-500">Options Intelligence Desk</p>
              </div>
            </Link>
            <div className="mt-8 space-y-8 overflow-y-auto">
              <NavigationList pathname={pathname} />
              <UserPanel userEmail={userEmail} greeting={greeting} />
            </div>
          </div>
        </div>
      )}

      {/* Desktop left rail */}
      <aside
        className={cn(
          'hidden shrink-0 border-r border-slate-200 bg-white/80 px-4 py-6 backdrop-blur transition-[width] duration-300 lg:flex lg:flex-col',
          isCollapsed ? 'w-24' : 'w-80 xl:w-96'
        )}
      >
        <div className={cn('flex items-center', isCollapsed ? 'justify-center' : 'justify-between')}>
          <div className={cn('flex items-center gap-3', isCollapsed && 'gap-0')}>
            <Image
              src="/Monty_logo.png"
              alt="Monty"
              width={isCollapsed ? 44 : 56}
              height={isCollapsed ? 44 : 56}
              className="rounded-2xl"
            />
            {!isCollapsed && (
              <div>
                <p className="text-lg font-semibold tracking-tight text-slate-900">Monty</p>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-500">Trading Desk</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-emerald-200 hover:text-emerald-600"
            aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className={cn('mt-8 flex-1 overflow-y-auto', isCollapsed ? 'px-0' : 'pr-2')}>
          <NavigationList pathname={pathname} isCollapsed={isCollapsed} />
        </div>

        <div className="mt-6">
          {isCollapsed ? (
            <Link
              href="/settings"
              className="group relative flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-all duration-200 hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-600"
              aria-label="Manage account"
            >
              <Settings className="h-5 w-5" />
              <span className="pointer-events-none absolute left-full top-1/2 ml-3 w-48 -translate-y-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
                <span className="block font-semibold">Manage account</span>
                <span className="mt-1 block text-xs text-slate-500">Account settings & preferences</span>
              </span>
            </Link>
          ) : (
            <UserPanel userEmail={userEmail} greeting={greeting} />
          )}
        </div>
      </aside>
    </>
  )
}

