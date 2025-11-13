'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, motion, useInView } from 'framer-motion'
import ContractFunnel from '@/components/contract-funnel'

const featureCards = [
  {
    title: 'Find the Best Options',
    description: 'Real-time market scans analyze thousands of options to surface high-probability trades based on unusual flow, gamma exposure, and technical setups.',
    gradient: 'from-emerald-100 via-emerald-200 to-emerald-300',
    accent: 'bg-emerald-500/70',
    rotate: -8,
    gifPath: '/scanner-feature.gif',
    gifPlaceholder: 'Scanner Demo',
  },
  {
    title: 'Exit Signals',
    description: 'Track every position with live P&L, exit signals, and AI-powered insights. Know exactly when to take profits or cut losses.',
    gradient: 'from-sky-100 via-sky-200 to-blue-200',
    accent: 'bg-sky-500/70',
    rotate: 0,
    gifPath: '/exit-signals-feature.gif',
    gifPlaceholder: 'Exit Signals Demo',
  },
  {
    title: 'Ask Monty',
    description: 'Chat with your personal options quant about any trade. Get detailed analysis, risk assessments, and strategic recommendations instantly.',
    gradient: 'from-emerald-100 via-emerald-200 to-emerald-300',
    accent: 'bg-emerald-500/70',
    rotate: 8,
    gifPath: '/chat-feature.gif',
    gifPlaceholder: 'Chat Demo',
  },
]


const rotatingValueProps = [
  'is your options trading assistant',
  'finds unusual options activity',
  'surfaces the best contracts',
  'tracks market sentiment',
  'runs backtests in seconds',
  'tracks profit & loss',
  'calculates exit signals',
  'answers your questions',
  'breaks down market moves',
  'makes sense of the greeks',
  'gives you the upper hand',
  'helps you win',
  'uses advanced mathematics',
]

export default function LandingPage() {
  const cardsRef = useRef<HTMLDivElement | null>(null)
  const cardsInView = useInView(cardsRef, { once: true, amount: 0.3 })

  const [currentValueProp, setCurrentValueProp] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentValueProp((prev) => (prev + 1) % rotatingValueProps.length)
    }, 3000)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  const navLinks = useMemo(
    () => [
      { href: '#features', label: 'Features' },
      { href: '#how-it-works', label: 'How It Works' },
      { href: '#get-started', label: 'Get Started' },
    ],
    [],
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="relative min-h-screen bg-white">
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-16 pt-10 sm:px-6 lg:px-12">
          <header className="flex items-center justify-between">
            <Link href="/" className="group flex items-center gap-3">
              <Image
                src="/Monty_logo.png"
                alt="Monty Logo"
                width={70}
                height={70}
                className="transition group-hover:opacity-80"
              />
            </Link>
            <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="transition hover:text-slate-900"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <Link
              href="/auth/login"
              className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-slate-200/80 transition hover:border-emerald-400/60 hover:bg-emerald-400 hover:text-white"
            >
              Sign In
            </Link>
          </header>

          <main className="flex flex-1 flex-col items-center justify-between gap-12 py-14 sm:py-20 lg:flex-row">
            {/* Left: Hero Text */}
            <div className="flex w-full max-w-2xl flex-col items-start gap-10 lg:max-w-none lg:w-1/2">
              <div className="inline-flex items-center gap-3 rounded-full border border-emerald-200/60 bg-white/70 px-5 py-2 text-xs uppercase tracking-[0.3em] text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Your Options Assistant
              </div>
              <h1 className="max-w-3xl text-4xl font-display font-semibold leading-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Monty{' '}
                <AnimatePresence mode="wait">
                  <motion.span
                    key={currentValueProp}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className="inline-block text-emerald-600"
                  >
                    {rotatingValueProps[currentValueProp]}
                  </motion.span>
                </AnimatePresence>
              </h1>
              <p className="max-w-2xl text-lg text-slate-600">
                Institutional-grade analysis, explained like texting with a friend.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/auth/login"
                  className="rounded-full bg-emerald-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:bg-emerald-400"
                >
                  Get Access
                </Link>
                <a
                  href="#how-it-works"
                  className="flex items-center gap-2 text-sm font-semibold text-emerald-600 transition hover:text-emerald-700"
                >
                  See how it works
                  <span aria-hidden className="text-lg">→</span>
                </a>
              </div>
            </div>

            {/* Right: Hero Image */}
            <div className="relative w-full max-w-3xl sm:max-w-4xl lg:max-w-none lg:w-[55%] lg:-mr-16 xl:-mr-20">
              {/* Decorative background elements */}
              <div className="absolute -inset-8 bg-gradient-to-r from-emerald-400/20 via-blue-400/20 to-purple-400/20 blur-3xl opacity-70 rounded-full" />
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-400/30 rounded-full blur-[120px]" />
              <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-blue-400/30 rounded-full blur-[120px]" />

              {/* Image - no hard container */}
              <div className="relative">
                <Image
                  src="/public-hero-image.png"
                  alt="Monty product overview"
                  width={1400}
                  height={800}
                  className="w-full h-auto rounded-2xl shadow-[0_25px_80px_-20px_rgba(0,0,0,0.25)]"
                />
                {/* Subtle overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-blue-500/10 pointer-events-none rounded-2xl" />
              </div>
            </div>
          </main>

        </div>
      </div>

      <ContractFunnel />

      <section
        id="features"
        className="relative isolate overflow-hidden bg-white px-4 py-20 sm:px-6 sm:py-24 lg:py-28"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
          <span className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-500/80">Your friend, who happens to be an options genius.</span>
          <h2 className="mt-6 max-w-2xl text-3xl font-display font-semibold text-slate-900 sm:text-4xl">
            Monty gives you the upper hand
          </h2>
        </div>

        <div ref={cardsRef} className="relative mx-auto mt-16 w-full max-w-6xl">
          <div className="absolute inset-0 -z-10 overflow-hidden rounded-[2.5rem] border border-slate-200 bg-slate-100/80 shadow-[0_80px_120px_-60px_rgba(30,64,175,0.25)]">
            <Image
              src="/trade_desk.png"
              alt="Trading desk"
              fill
              priority
              className="object-cover opacity-50"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-white/90 via-white/60 to-transparent" />
          </div>

          <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 md:grid-cols-3 lg:p-12">
            {featureCards.map((card, index) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 40 }}
                animate={
                  cardsInView
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 40 }
                }
                transition={{ delay: 0.15 * index, type: 'spring', stiffness: 140, damping: 16 }}
                whileHover={{ scale: 1.15, y: -16 }}
                style={{ transition: 'box-shadow 0.2s ease-out, border-color 0.2s ease-out' }}
                className={`rounded-[2rem] border border-slate-200 bg-gradient-to-br ${card.gradient} overflow-hidden shadow-[0_35px_60px_-35px_rgba(30,64,175,0.35)] backdrop-blur hover:shadow-[0_60px_120px_-40px_rgba(30,64,175,0.7)] hover:border-slate-300 hover:z-10`}
              >
                {/* Product Image */}
                <div className="aspect-video w-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center border-b border-slate-200/50">
                  {card.gifPath === '/chat-feature.gif' || card.gifPath === '/scanner-feature.gif' ? (
                    <Image
                      src={card.gifPath}
                      alt={`${card.title} preview`}
                      width={400}
                      height={225}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="text-center px-4">
                      <p className="text-xs font-semibold text-slate-500">{card.gifPlaceholder}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{card.gifPath}</p>
                    </div>
                  )}
                </div>

                {/* Card Content */}
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-slate-900">{card.title}</h3>
                  <p className="mt-3 text-sm text-slate-600">{card.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="relative overflow-hidden bg-slate-100 px-4 py-20 sm:px-6 sm:py-24 lg:py-28"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),transparent_60%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div className="space-y-6">
            <span className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-500">Your trading workflow</span>
            <h2 className="text-3xl font-display font-semibold text-slate-900 sm:text-4xl">
              From market scan to profitable exit—all in one platform
            </h2>
            <p className="text-base text-slate-600">
              Monty combines real-time market data, quantitative analysis, and AI-powered insights to help you make smarter trades. Whether you&apos;re hunting for momentum plays or managing complex positions, Monty has you covered.
            </p>
            <div className="grid gap-5 text-sm text-slate-600">
              {[
                'Live scanner filters thousands of options by flow, gamma, and technical patterns.',
                'Market sentiment tracking aggregates social media, news, and trader positioning in real-time.',
                'AI chatbot explains complex Greeks and strategies in plain English—like talking to a genius friend.',
                'Exit signals tell you exactly when to take profits or cut losses.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 text-emerald-500">●</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-lg shadow-emerald-200/40 backdrop-blur-lg">
            <div className="grid gap-6">
              {[
                {
                  title: '01. Discover',
                  description:
                    'Run real-time scans to find high-probability setups based on unusual activity, gamma exposure, and momentum indicators.',
                },
                {
                  title: '02. Analyze',
                  description:
                    'Chat with Monty about any trade. Get instant insights on risk, profit potential, and optimal entry/exit strategies.',
                },
                {
                  title: '03. Execute & Track',
                  description:
                    'Monitor all your positions with live P&L tracking, exit signals, and performance analytics to maximize returns.',
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_25px_60px_-40px_rgba(15,23,42,0.25)]">
                  <p className="text-xs uppercase tracking-[0.4em] text-emerald-500/70">{item.title}</p>
                  <p className="mt-3 text-sm text-slate-600">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-2xl border border-emerald-400/40 bg-emerald-50 p-6 text-sm text-emerald-700">
              <p className="font-semibold text-emerald-600">Learning & improving</p>
              <p className="mt-2 text-slate-600">
                Track your wins and losses with the Anti-Portfolio. Learn from rejected trades and refine your strategy with data-driven insights.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Showcase GIF Sections */}
      <section className="bg-gradient-to-b from-slate-100 to-white px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-6xl space-y-20 sm:space-y-24">
          {/* Scanner Feature */}
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            <div className="space-y-6">
              <span className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-500">Live Scanner</span>
              <h3 className="text-3xl font-display font-semibold text-slate-900 sm:text-4xl">
                Find winning trades in seconds
              </h3>
              <p className="text-base text-slate-600">
                Our scanner analyzes thousands of options contracts in real-time, filtering by unusual flow, gamma exposure, and technical patterns. Only the best opportunities make it to your desk.
              </p>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-emerald-500">✓</span>
                  <span>Real-time unusual options activity detection</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-emerald-500">✓</span>
                  <span>Gamma exposure and momentum indicators</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-emerald-500">✓</span>
                  <span>Custom filters for your trading style</span>
                </li>
              </ul>
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-[0_40px_80px_-30px_rgba(15,23,42,0.3)]">
              <div className="aspect-[4/3] w-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-500">Scanner Demo GIF</p>
                  <p className="mt-2 text-xs text-slate-400">Replace: /public/scanner-demo.gif</p>
                  <p className="mt-1 text-xs text-slate-400">Showcase: Live scanning & filtering</p>
                </div>
              </div>
              {/* Uncomment when you add the GIF:
              <Image
                src="/scanner-demo.gif"
                alt="Live scanner demo"
                width={800}
                height={600}
                className="w-full h-auto"
                unoptimized
              />
              */}
            </div>
          </div>

          {/* Chat Feature */}
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-[0_40px_80px_-30px_rgba(15,23,42,0.3)] lg:order-first">
              <Image
                src="/chat-demo.gif"
                alt="Chat with Monty demo"
                width={800}
                height={600}
                className="w-full h-auto"
                unoptimized
              />
            </div>
            <div className="space-y-6 lg:order-last">
              <span className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-500">AI Assistant</span>
              <h3 className="text-3xl font-display font-semibold text-slate-900 sm:text-4xl">
                Chat with your personal analyst
              </h3>
              <p className="text-base text-slate-600">
                Ask Monty anything about your trades. Get instant insights on risk, Greeks, market sentiment, and optimal strategies—all in plain language.
              </p>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-emerald-500">✓</span>
                  <span>Trade analysis and risk assessment</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-emerald-500">✓</span>
                  <span>Greeks explained in simple terms</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-emerald-500">✓</span>
                  <span>Strategy recommendations based on market conditions</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Portfolio Tracking */}
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            <div className="space-y-6">
              <span className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-500">Portfolio Management</span>
              <h3 className="text-3xl font-display font-semibold text-slate-900 sm:text-4xl">
                Track every position with precision
              </h3>
              <p className="text-base text-slate-600">
                Monitor your entire portfolio with live P&L tracking, exit signals, and performance analytics. Know exactly when to hold and when to take profits.
              </p>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-emerald-500">✓</span>
                  <span>Real-time P&L and Greeks tracking</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-emerald-500">✓</span>
                  <span>AI-powered exit signals</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-emerald-500">✓</span>
                  <span>Performance analytics and insights</span>
                </li>
              </ul>
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-[0_40px_80px_-30px_rgba(15,23,42,0.3)]">
              <Image
                src="/portfolio-demo.gif"
                alt="Portfolio tracking demo"
                width={800}
                height={600}
                className="w-full h-auto"
                unoptimized
              />
            </div>
          </div>
        </div>
      </section>

      <section id="get-started" className="bg-white px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="mx-auto w-full max-w-5xl rounded-[2.5rem] border border-slate-200 bg-gradient-to-br from-white via-emerald-50/60 to-white p-8 text-center shadow-[0_80px_120px_-60px_rgba(30,64,175,0.25)] sm:p-10 lg:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-500/80">Start trading smarter</p>
          <h2 className="mt-4 text-3xl font-display font-semibold text-slate-900 sm:text-4xl">
            Ready to build your options empire?
          </h2>
          <p className="mt-6 text-base text-slate-600">
            Join traders who use Monty to find better setups, manage risk intelligently, and maximize their returns. Sign up now and get instant access to the full platform.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/auth/login"
              className="rounded-full bg-emerald-500 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:bg-emerald-400"
            >
              Try Monty
            </Link>
          </div>
        </div>
        <footer className="mx-auto mt-16 flex w-full max-w-5xl flex-col items-center justify-between gap-4 text-xs text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Monty Quantitative Labs. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="#features" className="transition hover:text-slate-900">
              Features
            </a>
            <a href="#how-it-works" className="transition hover:text-slate-900">
              How It Works
            </a>
            <Link href="/terms" className="transition hover:text-slate-900">
              Terms
            </Link>
            <Link href="/auth/login" className="transition hover:text-slate-900">
              Sign In
            </Link>
          </div>
        </footer>
      </section>
    </div>
  )
}
