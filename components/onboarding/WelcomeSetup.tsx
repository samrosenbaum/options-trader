'use client'

import { useState } from 'react'

export interface WelcomeSetupProps {
  open: boolean
  onComplete: (data: {
    userName: string
    portfolioSize: number
    dailyBudget: number
  }) => void
}

export default function WelcomeSetup({ open, onComplete }: WelcomeSetupProps) {
  const [userName, setUserName] = useState('')
  const [portfolioSize, setPortfolioSize] = useState('')
  const [dailyBudget, setDailyBudget] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parseCurrencyValue = (value: string) => {
    const normalized = value.replace(/[$,\s]/g, '')
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isSubmitting) {
      return
    }

    if (!userName.trim() || !portfolioSize.trim() || !dailyBudget.trim()) {
      setError('Please complete all fields before continuing.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    const parsedPortfolio = parseCurrencyValue(portfolioSize)
    const parsedBudget = parseCurrencyValue(dailyBudget)

    if (Number.isNaN(parsedPortfolio) || Number.isNaN(parsedBudget)) {
      setIsSubmitting(false)
      setError('Enter valid numbers for your portfolio size and daily budget.')
      return
    }

    try {
      await onComplete({
        userName: userName.trim(),
        portfolioSize: parsedPortfolio,
        dailyBudget: parsedBudget,
      })
    } catch (submissionError) {
      console.error('Failed to complete welcome setup', submissionError)
      setError('Something went wrong while saving your info. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-setup-heading"
    >
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-emerald-400/20 bg-slate-950/95 p-8 text-slate-100 shadow-[0_40px_120px_rgba(16,185,129,0.4)] first-scan-aurora animate-in zoom-in-95 duration-300 pointer-events-auto cursor-auto">
        <div className="relative">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
            Welcome to Monty
          </div>

          <h2
            id="welcome-setup-heading"
            className="text-3xl font-display font-bold text-white"
          >
            Set up your trading desk
          </h2>

          <p className="mt-3 text-sm text-emerald-100/70">
            Tell us a bit about yourself so Monty can personalize your experience and size positions for your account.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5 pointer-events-auto">
            <div>
              <label htmlFor="userName" className="block text-sm font-medium text-emerald-100/90 mb-2">
                What should we call you?
              </label>
              <input
                id="userName"
                type="text"
                value={userName}
                onChange={(e) => {
                  setUserName(e.target.value)
                  setError(null)
                }}
                placeholder="Your name"
                required
                autoFocus
                className="w-full rounded-xl border-2 border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-400 transition focus:border-emerald-400/50 focus:bg-white/10 focus:outline-none relative z-50 pointer-events-auto"
              />
            </div>

            <div>
              <label htmlFor="portfolioSize" className="block text-sm font-medium text-emerald-100/90 mb-2">
                Total portfolio size
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  id="portfolioSize"
                  type="number"
                  value={portfolioSize}
                  onChange={(e) => {
                    setPortfolioSize(e.target.value)
                    setError(null)
                  }}
                  placeholder="10000"
                  required
                  min="0"
                  step="100"
                  className="w-full rounded-xl border-2 border-white/10 bg-white/5 px-4 py-3 pl-8 text-white placeholder-slate-400 transition focus:border-emerald-400/50 focus:bg-white/10 focus:outline-none relative z-50 pointer-events-auto"
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Your total account size for position sizing
              </p>
            </div>

            <div>
              <label htmlFor="dailyBudget" className="block text-sm font-medium text-emerald-100/90 mb-2">
                Daily contract budget
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  id="dailyBudget"
                  type="number"
                  value={dailyBudget}
                  onChange={(e) => {
                    setDailyBudget(e.target.value)
                    setError(null)
                  }}
                  placeholder="500"
                  required
                  min="0"
                  step="10"
                  className="w-full rounded-xl border-2 border-white/10 bg-white/5 px-4 py-3 pl-8 text-white placeholder-slate-400 transition focus:border-emerald-400/50 focus:bg-white/10 focus:outline-none relative z-50 pointer-events-auto"
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Maximum to spend per day on contracts
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={
                isSubmitting ||
                !userName.trim() ||
                !portfolioSize.trim() ||
                !dailyBudget.trim()
              }
              className="mt-8 w-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-500 px-6 py-3.5 text-base font-semibold text-emerald-950 shadow-[0_10px_40px_rgba(16,185,129,0.45)] transition hover:shadow-[0_12px_45px_rgba(16,185,129,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed relative z-50 pointer-events-auto"
            >
              {isSubmitting ? 'Setting up...' : 'Enter your trading desk'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            You can change these settings anytime
          </p>
        </div>
      </div>
    </div>
  )
}
