'use client'

import { useEffect } from 'react'

export interface FirstScanIntroProps {
  open: boolean
  onComplete: () => void
  onSkip?: () => void
  opportunityCount?: number
}

const getSteps = (count: number) => [
  {
    title: 'Monty just scanned the market',
    description: `Found ${count} opportunities matched to your portfolio size. Each one shows the potential profit, risk level, and what needs to happen for it to pay off.`,
  },
  {
    title: 'Check the details',
    description:
      'Tap any card to see the full breakdown — greeks, probability analysis, and position sizing tailored to your account.',
  },
  {
    title: 'Ask Monty anything',
    description:
      'See the "Ask Monty" button? That opens a chat where you can ask questions about any trade. "Why is this risky?" or "What if the stock drops?" — Monty explains it all.',
  },
]

export default function FirstScanIntro({
  open,
  onComplete,
  onSkip,
  opportunityCount = 0,
}: FirstScanIntroProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const timer = window.setTimeout(() => {
      document.documentElement.classList.add('first-scan-glow-active')
    }, 200)

    return () => {
      window.clearTimeout(timer)
      document.documentElement.classList.remove('first-scan-glow-active')
    }
  }, [open])

  if (!open) {
    return null
  }

  const steps = getSteps(opportunityCount)

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-scan-intro-heading"
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-emerald-400/20 bg-slate-950/95 p-6 sm:p-8 text-slate-100 shadow-[0_40px_120px_rgba(16,185,129,0.35)] first-scan-aurora pointer-events-auto"
      >
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
              First scan complete
            </span>
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="text-slate-400 hover:text-slate-300 text-sm relative z-50 pointer-events-auto"
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </div>

          <h2
            id="first-scan-intro-heading"
            className="mt-4 text-2xl sm:text-3xl font-display font-bold text-white"
          >
            Here's how to use what you just found
          </h2>

          <p className="mt-2 text-sm sm:text-base text-emerald-100/80">
            Your scanner just did the heavy lifting. Here's what to do next:
          </p>

          <div className="mt-6 space-y-3">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-400/20 text-xs font-bold text-emerald-100">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                    <p className="mt-1 text-xs sm:text-sm text-emerald-100/70 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={onComplete}
              className="w-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-500 px-6 py-3 text-sm sm:text-base font-semibold text-emerald-950 shadow-[0_10px_40px_rgba(16,185,129,0.45)] transition hover:shadow-[0_12px_45px_rgba(16,185,129,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 relative z-50 pointer-events-auto"
            >
              Got it, let's explore
            </button>
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="w-full text-xs sm:text-sm font-medium text-emerald-200/70 hover:text-emerald-100 py-2 relative z-50 pointer-events-auto"
              >
                I'll figure it out myself
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
