'use client'

import { type CSSProperties, useEffect, useMemo } from 'react'

type CashRainProps = {
  duration?: number
  billCount?: number
  onComplete?: () => void
}

type CashBill = {
  left: number
  delay: number
  duration: number
  size: number
  rotation: number
  drift: number
  emoji: string
}

const EMOJIS = ['💵', '💸', '💰']

export default function CashRain({
  duration = 5000,
  billCount = 24,
  onComplete,
}: CashRainProps) {
  const bills = useMemo<CashBill[]>(() => {
    return Array.from({ length: billCount }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 4 + Math.random() * 2,
      size: 1.6 + Math.random() * 0.9,
      rotation: Math.random() * 40 - 20,
      drift: Math.random() * 80 - 40,
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    }))
  }, [billCount])

  useEffect(() => {
    if (!onComplete) return

    const timer = setTimeout(() => {
      onComplete()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onComplete])

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/5 to-emerald-500/10" />
      {bills.map((bill, index) => {
        const style: CSSProperties & {
          ['--rotation']?: string
          ['--drift']?: string
        } = {
          left: `${bill.left}%`,
          animationDelay: `${bill.delay}s`,
          animationDuration: `${bill.duration}s`,
          fontSize: `${bill.size}rem`,
        }

        style['--rotation'] = `${bill.rotation}deg`
        style['--drift'] = `${bill.drift}px`

        return (
          <span key={index} className="cash-bill" style={style}>
            {bill.emoji}
          </span>
        )
      })}

      <style jsx>{`
        .cash-bill {
          position: absolute;
          top: -10%;
          animation-name: cash-fall;
          animation-timing-function: linear;
          animation-fill-mode: forwards;
        }

        @keyframes cash-fall {
          0% {
            transform: translate3d(0, -120%, 0) rotate(var(--rotation));
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          100% {
            transform: translate3d(var(--drift), 110vh, 0) rotate(var(--rotation));
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
