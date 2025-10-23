'use client'

import { useMemo, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, useInView } from 'framer-motion'

const featureCards = [
  {
    title: 'Building Websites',
    description: 'Launch polished marketing sites with cinematic hero sections and conversion-ready messaging in days.',
    gradient: 'from-emerald-400/90 via-emerald-500/80 to-emerald-600/60',
    accent: 'bg-emerald-400/60',
    offsetX: -160,
    rotate: -12,
  },
  {
    title: 'Creating Prototypes',
    description: 'Translate product ideas into clickable prototypes that investors and users can experience instantly.',
    gradient: 'from-amber-400/90 via-orange-400/80 to-rose-500/70',
    accent: 'bg-amber-400/60',
    offsetX: 0,
    rotate: 0,
  },
  {
    title: 'Shipping Apps Fast',
    description: 'Move from proof-of-concept to live app with tight feedback loops, automation, and handoff-ready assets.',
    gradient: 'from-cyan-400/90 via-blue-500/80 to-indigo-600/70',
    accent: 'bg-cyan-400/60',
    offsetX: 160,
    rotate: 12,
  },
]

const proofPoints = [
  {
    label: 'Founders backed',
    value: '120+',
  },
  {
    label: 'Average time to prototype',
    value: '9 days',
  },
  {
    label: 'Launch-ready conversions lifted',
    value: '3.4×',
  },
]

export default function LandingPage() {
  const cardsRef = useRef<HTMLDivElement | null>(null)
  const cardsInView = useInView(cardsRef, { once: true, amount: 0.4 })

  const navLinks = useMemo(
    () => [
      { href: '#services', label: 'Services' },
      { href: '#process', label: 'Process' },
      { href: '#proof', label: 'Results' },
    ],
    [],
  )

  return (
    <div className="min-h-screen bg-[#05070E] text-white">
      <div className="relative min-h-screen overflow-hidden">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster="/trade_desk.png"
        >
          <source src="/garage.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-[#05070E]/95" />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-16 pt-10">
          <header className="flex items-center justify-between">
            <Link href="/" className="group flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 font-display text-lg font-semibold uppercase tracking-wide text-white transition group-hover:bg-white/20">
                mt
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-white">Monty</p>
                <p className="text-xs uppercase tracking-[0.3em] text-white/60">trading studio</p>
              </div>
            </Link>
            <nav className="hidden items-center gap-8 text-sm text-white/80 md:flex">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="transition hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <Link
              href="/auth/login"
              className="rounded-full border border-white/30 bg-white/10 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-black/40 transition hover:border-white/40 hover:bg-white/20"
            >
              Get in touch
            </Link>
          </header>

          <main className="flex flex-1 flex-col items-start justify-center gap-10 py-20">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-xs uppercase tracking-[0.3em] text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Custom builds for ambitious teams
            </div>
            <h1 className="max-w-3xl text-4xl font-display font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              You have an idea.{' '}
              <span className="text-white/80">We make it reality.</span>
            </h1>
            <p className="max-w-2xl text-lg text-white/70">
              From cinematic landing pages to real-time trading dashboards, Monty gives you an elite product team without the overhead. We handle UX, front-end, and automation while you stay focused on strategy.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/auth/login"
                className="rounded-full bg-emerald-400 px-8 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300"
              >
                Launch your project
              </Link>
              <a
                href="#process"
                className="flex items-center gap-2 text-sm font-semibold text-white/80 transition hover:text-white"
              >
                See how we build
                <span aria-hidden className="text-lg">→</span>
              </a>
            </div>
            <dl className="mt-6 grid gap-6 sm:grid-cols-3">
              {proofPoints.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur">
                  <dt className="text-xs uppercase tracking-[0.3em] text-white/50">{item.label}</dt>
                  <dd className="mt-3 text-2xl font-semibold text-white">{item.value}</dd>
                </div>
              ))}
            </dl>
          </main>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#05070E] to-transparent" />
      </div>

      <section
        id="services"
        className="relative isolate overflow-hidden bg-[#05070E] px-6 py-28"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
          <span className="text-sm font-semibold uppercase tracking-[0.4em] text-white/40">What do you need built?</span>
          <h2 className="mt-6 max-w-2xl text-3xl font-display font-semibold text-white sm:text-4xl">
            Your trading desk, product launch, and automation stack—crafted in one sprint.
          </h2>
        </div>

        <div ref={cardsRef} className="relative mx-auto mt-16 grid h-[620px] w-full max-w-5xl place-items-center">
          <div className="absolute inset-0 -z-10 overflow-hidden rounded-[2.5rem] border border-white/10 bg-black/60 shadow-[0_80px_120px_-40px_rgba(0,0,0,0.7)]">
            <Image
              src="/trade_desk.png"
              alt="Trading desk"
              fill
              priority
              className="object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-black/50 to-transparent" />
          </div>

          {featureCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 120, rotate: 0, x: 0, scale: 0.95 }}
              animate={
                cardsInView
                  ? { opacity: 1, y: 0, rotate: card.rotate, x: card.offsetX, scale: 1 }
                  : { opacity: 0, y: 120, rotate: 0, x: 0, scale: 0.95 }
              }
              transition={{ delay: 0.2 * index, type: 'spring', stiffness: 140, damping: 16 }}
              className={`relative w-64 max-w-[15rem] rounded-[2rem] border border-white/20 bg-gradient-to-br ${card.gradient} p-6 text-left text-white shadow-[0_35px_60px_-25px_rgba(15,15,15,0.8)] backdrop-blur`}
            >
              <div className={`mb-6 h-10 w-10 rounded-full ${card.accent}`} />
              <h3 className="text-xl font-semibold text-white">{card.title}</h3>
              <p className="mt-3 text-sm text-white/70">{card.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section
        id="process"
        className="relative overflow-hidden bg-black/40 px-6 py-28"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(32,196,152,0.18),transparent_60%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-16 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-6">
            <span className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-300/80">Our sprint playbook</span>
            <h2 className="text-3xl font-display font-semibold text-white sm:text-4xl">
              Strategy, prototypes, and production-ready builds inside a single engagement.
            </h2>
            <p className="text-base text-white/70">
              We start with a high-impact workshop to identify the conversion moments that matter. From there our designers and engineers build a living system—hero animations, data visualizations, and automation included.
            </p>
            <div className="grid gap-5 text-sm text-white/70">
              {[
                'Story-driven positioning and copy that resonates with traders and stakeholders.',
                'Cinematic hero experiences that blend motion, depth, and real market footage.',
                'No-code automations and dashboards wired to your live data sources.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 text-emerald-300">●</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative rounded-[2rem] border border-white/10 bg-white/5 p-8 backdrop-blur-lg">
            <div className="grid gap-6">
              {[
                {
                  title: '01. Alignment',
                  description:
                    'A half-day deep dive uncovers your audience, offer, and success metrics. We exit with a storyboard, wireframes, and a plan of attack.',
                },
                {
                  title: '02. Sprint build',
                  description:
                    'Design, front-end, and motion come together in a live Figma + Next.js environment. You review daily while we keep shipping.',
                },
                {
                  title: '03. Launch & iterate',
                  description:
                    'Analytics and A/B testing are baked in, so every release learns and lifts conversions from day one.',
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-[0_25px_60px_-30px_rgba(0,0,0,0.7)]">
                  <p className="text-xs uppercase tracking-[0.4em] text-white/40">{item.title}</p>
                  <p className="mt-3 text-sm text-white/70">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-6 text-sm text-emerald-100">
              <p className="font-semibold text-emerald-200">White-glove onboarding</p>
              <p className="mt-2 text-white/70">
                Already running a stack? We handle integrations with TradeStation, Thinkorswim, or custom brokers and deliver developer-ready documentation.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="proof" className="bg-[#05070E] px-6 pb-24">
        <div className="mx-auto w-full max-w-5xl rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-white/5 via-white/2 to-transparent p-12 text-center shadow-[0_80px_120px_-50px_rgba(0,0,0,0.8)]">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-white/40">Let&apos;s build</p>
          <h2 className="mt-4 text-3xl font-display font-semibold text-white sm:text-4xl">
            Ready for a trading experience that feels built for tomorrow?
          </h2>
          <p className="mt-6 text-base text-white/70">
            Tell us about your roadmap and we&apos;ll show you a cinematic prototype within a week—complete with motion tests, interaction patterns, and the copy that sells it.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/auth/login"
              className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:bg-white/80"
            >
              Book a discovery session
            </Link>
            <a
              href="mailto:hello@monty.design"
              className="text-sm font-semibold text-white/70 transition hover:text-white"
            >
              Prefer email? hello@monty.design
            </a>
          </div>
        </div>
        <footer className="mx-auto mt-16 flex w-full max-w-5xl flex-col items-center justify-between gap-4 text-xs text-white/50 sm:flex-row">
          <p>© {new Date().getFullYear()} Monty Quantitative Labs. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="#services" className="transition hover:text-white">
              Services
            </a>
            <a href="#process" className="transition hover:text-white">
              Process
            </a>
            <Link href="/auth/login" className="transition hover:text-white">
              Client login
            </Link>
          </div>
        </footer>
      </section>
    </div>
  )
}
