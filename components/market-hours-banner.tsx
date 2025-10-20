'use client'

import { useState, useEffect, useRef } from 'react'
import { isMarketOpen } from '@/lib/utils/market-hours'
import { motion, AnimatePresence } from 'framer-motion'

interface CountdownTime {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function calculateCountdown(nextOpen: Date): CountdownTime {
  const now = new Date()
  const diff = nextOpen.getTime() - now.getTime()

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  return { days, hours, minutes, seconds }
}

export function MarketHoursBanner() {
  const [marketInfo, setMarketInfo] = useState<ReturnType<typeof isMarketOpen> | null>(null)
  const [countdown, setCountdown] = useState<CountdownTime>({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [showOpeningBell, setShowOpeningBell] = useState(false)
  const previouslyClosedRef = useRef(false)

  useEffect(() => {
    // Check market hours on mount
    const info = isMarketOpen()
    setMarketInfo(info)
    previouslyClosedRef.current = !info.isOpen

    if (info && !info.isOpen && info.nextOpen) {
      setCountdown(calculateCountdown(info.nextOpen))
    }
  }, [])

  useEffect(() => {
    if (!marketInfo || marketInfo.isOpen || !marketInfo.nextOpen) {
      return
    }

    // Update countdown every second
    const interval = setInterval(() => {
      const newCountdown = calculateCountdown(marketInfo.nextOpen!)
      setCountdown(newCountdown)

      // Check if market just opened (countdown hit zero)
      const wasCountingDown = previouslyClosedRef.current
      const nowOpen = newCountdown.days === 0 && newCountdown.hours === 0 &&
                      newCountdown.minutes === 0 && newCountdown.seconds === 0

      if (wasCountingDown && nowOpen) {
        // Market just opened! Ring the bell!
        setShowOpeningBell(true)

        // Play bell sound (optional)
        try {
          const audio = new Audio('/sounds/bell.mp3')
          audio.volume = 0.3
          audio.play().catch(() => {}) // Fail silently if no audio file
        } catch {
          // Ignore audio errors
        }

        // Hide banner and bell after celebration
        setTimeout(() => {
          setShowOpeningBell(false)
          // Trigger page reload to fetch fresh opportunities
          window.location.reload()
        }, 3000)
      }

      // Refresh market info every minute
      const now = new Date()
      if (now.getSeconds() === 0) {
        const info = isMarketOpen()
        setMarketInfo(info)
        previouslyClosedRef.current = !info.isOpen
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [marketInfo])

  if (!marketInfo || marketInfo.isOpen) {
    // Don't show banner when market is open (unless showing opening bell)
    if (!showOpeningBell) return null
  }

  const isWeekend = countdown.days > 0

  return (
    <div>
      {/* Opening Bell Celebration */}
      <AnimatePresence>
        {showOpeningBell && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", duration: 0.8 }}
              className="text-center"
            >
              {/* Bell Icon */}
              <motion.div
                animate={{
                  rotate: [0, -20, 20, -20, 20, 0],
                }}
                transition={{
                  duration: 0.8,
                  repeat: 3,
                  ease: "easeInOut"
                }}
                className="mb-6 text-9xl"
              >
                🔔
              </motion.div>

              {/* Message */}
              <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-4xl font-bold text-white mb-2"
              >
                Markets Are Open!
              </motion.h2>
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-xl text-emerald-400"
              >
                Let&apos;s find some opportunities 🚀
              </motion.p>

              {/* Confetti Effect */}
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: 50 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{
                      x: '50vw',
                      y: '50vh',
                      opacity: 1,
                      scale: 1
                    }}
                    animate={{
                      x: `${Math.random() * 100}vw`,
                      y: `${Math.random() * 100}vh`,
                      opacity: 0,
                      scale: 0
                    }}
                    transition={{
                      duration: 2,
                      delay: Math.random() * 0.5,
                      ease: "easeOut"
                    }}
                    className="absolute h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'][i % 5]
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Countdown Banner */}
      {!showOpeningBell && (
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
          {/* Animated Background Gradient */}
          <div className="absolute inset-0 opacity-30">
            <div
              className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 animate-gradient"
              style={{ backgroundSize: '200% 200%' }}
            />
          </div>

          <div className="relative p-6">
            <div className="flex items-start gap-4">
              {/* Icon */}
              <motion.div
                className="flex-shrink-0"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30">
                  <span className="text-2xl">🌙</span>
                </div>
              </motion.div>

              {/* Content */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-white">
                    Market Closed
                  </h3>
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                </div>

                <p className="mt-1 text-sm text-zinc-400">
                  {isWeekend ? 'Markets are closed for the weekend' : 'Trading hours: Mon-Fri 9:30 AM - 4:00 PM ET'}
                </p>

                {/* Countdown Timer */}
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    Reopens in
                  </span>
                  <div className="flex items-center gap-2">
                    {countdown.days > 0 && (
                      <>
                        <CountdownUnit value={countdown.days} label="d" />
                        <span className="text-zinc-600">:</span>
                      </>
                    )}
                    <CountdownUnit value={countdown.hours} label="h" />
                    <span className="text-zinc-600">:</span>
                    <CountdownUnit value={countdown.minutes} label="m" />
                    <span className="text-zinc-600">:</span>
                    <CountdownUnit value={countdown.seconds} label="s" />
                  </div>
                </div>

                {/* Info Notice */}
                <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                  <p className="text-xs text-zinc-400">
                    <span className="font-semibold text-zinc-300">Note:</span> You can still run scans, but options data may be stale or incomplete outside market hours.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <motion.div
        key={value}
        initial={{ scale: 1.05, opacity: 0.8 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="flex h-10 min-w-[2.5rem] items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 px-2"
      >
        <span className="font-mono text-xl font-bold text-white">
          {value.toString().padStart(2, '0')}
        </span>
      </motion.div>
      <span className="text-xs font-semibold text-zinc-500">
        {label}
      </span>
    </div>
  )
}
