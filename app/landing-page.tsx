'use client'

import { useMemo, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, useInView } from 'framer-motion'
import ContractFunnel from '@/components/contract-funnel'

const featureCards = [
  {
    title: 'Ask Monty Anything',
    description: 'Real-time market scans analyze thousands of options to surface high-probability trades based on unusual flow, gamma exposure, and technical setups.',
    gradient: 'from-emerald-100 via-emerald-200 to-emerald-300',
    accent: 'bg-emerald-500/70',
    rotate: -8,
  },
  {
    title: 'Exit Signals',
    description: 'Track every position with live P&L, exit signals, and AI-powered insights. Know exactly when to take profits or cut losses.',
    gradient: 'from-sky-100 via-sky-200 to-blue-200',
    accent: 'bg-sky-500/70',
    rotate: 0,
  },
  {
    title: 'Ask Monty',
    description: 'Chat with your personal options quant about any trade. Get detailed analysis, risk assessments, and strategic recommendations instantly.',
    gradient: 'from-emerald-100 via-emerald-200 to-emerald-300',
    accent: 'bg-emerald-500/70',
    rotate: 8,
  },
]

const proofPoints = [
  {
    label: 'Options scanned daily',
    value: '10K+',
    backTitle: 'Smart Scanner',
    backDescription: 'Our AI analyzes thousands of options contracts every day, filtering by unusual flow, gamma exposure, volume spikes, and technical patterns. Find the highest-probability setups before the crowd.',
  },
  {
    label: 'Average win rate',
    value: '68%',
    backTitle: 'Proven Results',
    backDescription: 'Data-driven exit signals and risk management tools help you lock in profits at the right time. Our AI learns from historical patterns to maximize your win rate and minimize losses.',
  },
  {
    label: 'Time saved per trade',
    value: '2 hrs',
    backTitle: 'Instant Analysis',
    backDescription: 'Skip the manual research. Monty instantly surfaces the best opportunities with full technical analysis, risk metrics, and profit projections. Spend less time researching, more time trading.',
  },
]

const manifestoPoints = [
  {
    title: 'Scan thousands of options contracts',
    description:
      'Monty sifts through the noise of every chain, surfacing only the contracts that meet strict flow, volatility, and momentum criteria—so only the best ideas reach your desk.',
  },
  {
    title: 'Chat with your personal trade analyst',
    description:
      "Think of a quant as a data-obsessed strategist. Monty translates their models into plain language, so you can pressure-test any setup without needing Wall Street jargon.",
  },
  {
    title: 'Sell or hold signals for confident exits',
    description:
      'Our signals monitor gamma shifts, liquidity, and sentiment to tell you exactly when it is time to secure profits or let the position ride.',
  },
  {
    title: 'Track your misses, learn from your losses',
    description:
      'The Anti-Portfolio records every rejection and outcome, helping you iterate like a pro desk and sharpen your edge over time.',
  },
]

const uprisingTimeline = [
  {
    era: 'Bucket shop rebels',
    story:
      'Retail traders hustled their way out of smoky backrooms by mastering tape reading and discipline, proving the house could be beaten with focus and data.',
  },
  {
    era: 'Garage quants of the 80s',
    story:
      'Outside the big banks, small teams built models on personal computers and forced Wall Street to recognize the power of independent analytics.',
  },
  {
    era: 'The online trading uprising',
    story:
      'Forums and chat rooms gave everyday traders a seat at the table. Today, AI puts institutional-grade insights directly into your workflow.',
  },
]

export default function LandingPage() {
  const cardsRef = useRef<HTMLDivElement | null>(null)
  const cardsInView = useInView(cardsRef, { once: true, amount: 0.2 })

  const navLinks = useMemo(
    () => [
      { href: '#features', label: 'Features' },
      { href: '#how-it-works', label: 'How It Works' },
      { href: '/manifesto', label: 'Manifesto' },
      { href: '#get-started', label: 'Get Started' },
    ],
    [],
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="relative min-h-screen overflow-hidden">
        <video
          className="absolute inset-0 h-full w-full object-cover z-0"
          autoPlay
          muted
          loop
          playsInline
          poster="/trade_desk.png"
        >
          <source src="/garage.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-white/85 via-white/80 to-white/95 z-[1]" />
        <div className="relative z-[2] mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-16 pt-10">
          <header className="flex items-center justify-between">
            <Link href="/" className="group flex items-center gap-3">
              <Image
                src="/Monty_logo.png"
                alt="Monty Logo"
                width={50}
                height={50}
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

          <main className="flex flex-1 flex-col items-start justify-center gap-10 py-20">
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-200/60 bg-white/70 px-5 py-2 text-xs uppercase tracking-[0.3em] text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Scanning the markets...
            </div>
            <h1 className="max-w-3xl text-4xl font-display font-semibold leading-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Trade with Superpowers
            </h1>
            <p className="max-w-2xl text-lg text-slate-600">
              Monty uses techniques the institutions use, but puts the power in your hands.
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
            <div className="mt-6 grid gap-6 sm:grid-cols-3 relative z-[3]">
              {proofPoints.map((item) => (
                <motion.div
                  key={item.label}
                  className="group relative flex flex-col justify-center rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.2)] backdrop-blur transition-all duration-300 hover:border-emerald-400/50 hover:shadow-[0_25px_70px_-20px_rgba(16,185,129,0.35)]"
                  whileHover={{
                    scale: 1.05,
                    y: -5,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400/0 via-emerald-400/0 to-emerald-400/0 opacity-0 transition-opacity duration-300 group-hover:from-emerald-400/5 group-hover:via-cyan-400/5 group-hover:to-transparent group-hover:opacity-100" />
                  <div className="relative">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500 transition-colors group-hover:text-emerald-600/80">{item.label}</p>
                    <p className="mt-3 text-3xl font-semibold text-slate-900 transition-colors group-hover:text-emerald-600">{item.value}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </main>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent" />
      </div>

      <ContractFunnel />

      <section
        id="features"
        className="relative isolate overflow-hidden bg-white px-6 py-28"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
          <span className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-500/80">Your Options Toolkit</span>
          <h2 className="mt-6 max-w-2xl text-3xl font-display font-semibold text-slate-900 sm:text-4xl">
            Monty gives you the upper hand
          </h2>
        </div>

        <div ref={cardsRef} className="relative mx-auto mt-16 grid h-[620px] w-full max-w-5xl place-items-center">
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

          {featureCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 120, rotate: 0, x: 0, scale: 0.95 }}
              animate={
                cardsInView
                  ? { opacity: 1, y: 0, rotate: card.rotate, x: card.rotate * 20, scale: 1 }
                  : { opacity: 0, y: 120, rotate: 0, x: 0, scale: 0.95 }
              }
              transition={{ delay: 0.2 * index, type: 'spring', stiffness: 140, damping: 16 }}
              className={`relative w-64 max-w-[15rem] rounded-[2rem] border border-slate-200 bg-gradient-to-br ${card.gradient} p-6 text-left text-slate-900 shadow-[0_35px_60px_-35px_rgba(30,64,175,0.35)] backdrop-blur`}
            >
              <div className={`mb-6 h-10 w-10 rounded-full ${card.accent}`} />
              <h3 className="text-xl font-semibold text-slate-900">{card.title}</h3>
              <p className="mt-3 text-sm text-slate-600">{card.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section
        id="manifesto"
        className="relative overflow-hidden bg-gradient-to-b from-white via-slate-100 to-slate-200 px-6 py-28"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),transparent_60%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <span className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-500">The Monty Manifesto</span>
            <h2 className="text-3xl font-display font-semibold text-slate-900 sm:text-4xl">
              Wall Street wrote the rules. Retail traders are rewriting them.
            </h2>
            <p className="text-base text-slate-600">
              Derivatives were built to keep retail on the outside looking in. When the house writes the rules and hides the
              math, the house always wins. Monty flips the script by putting a battle-tested analyst&mdash;a data-driven
              strategist focused on your edge&mdash;right on your desk, no finance degree required.
            </p>
            <div className="grid gap-5">
              {manifestoPoints.map((point) => (
                <div
                  key={point.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_25px_60px_-40px_rgba(15,23,42,0.25)]"
                >
                  <p className="text-sm font-semibold text-slate-900">{point.title}</p>
                  <p className="mt-2 text-sm text-slate-600">{point.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-6 rounded-[2rem] border border-emerald-200/70 bg-white/80 p-8 backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-500/70">From the bottom up</p>
            <p className="text-lg font-semibold text-slate-900">
              Every generation of traders had to claw their way into the room. We are that next wave.
            </p>
            <div className="space-y-5">
              {uprisingTimeline.map((chapter) => (
                <div key={chapter.era} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-500">{chapter.era}</p>
                  <p className="mt-2 text-sm text-slate-600">{chapter.story}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-600">
              We study their grit, automate their edge, and package it in tools the street can&apos;t ignore. Your seat at the desk
              is no longer optional&mdash;it&apos;s inevitable.
            </p>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="relative overflow-hidden bg-slate-100 px-6 py-28"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),transparent_60%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-16 lg:grid-cols-[1.1fr_1fr]">
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
                'AI chatbot analyzes your positions and answers questions about risk and strategy.',
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

      <section id="get-started" className="bg-white px-6 pb-24">
        <div className="mx-auto w-full max-w-5xl rounded-[2.5rem] border border-slate-200 bg-gradient-to-br from-white via-emerald-50/60 to-white p-12 text-center shadow-[0_80px_120px_-60px_rgba(30,64,175,0.25)]">
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
              Get started free
            </Link>
            <a
              href="mailto:sam@monty.trade"
              className="text-sm font-semibold text-emerald-600 transition hover:text-emerald-700"
            >
              Questions? sam@monty.trade
            </a>
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
