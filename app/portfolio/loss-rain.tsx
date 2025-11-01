'use client'

import { type CSSProperties, useEffect, useMemo } from 'react'

type LossRainProps = {
  duration?: number
  emojiCount?: number
  onComplete?: () => void
}

type FallingEmoji = {
  left: number
  delay: number
  duration: number
  size: number
  rotation: number
  drift: number
  emoji: string
}

const EMOJIS = ['🪦', '💀', '😭']

export default function LossRain({
  duration = 5000,
  emojiCount = 24,
  onComplete,
}: LossRainProps) {
  const emojis = useMemo<FallingEmoji[]>(() => {
    return Array.from({ length: emojiCount }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 4 + Math.random() * 2,
      size: 1.5 + Math.random() * 1,
      rotation: Math.random() * 40 - 20,
      drift: Math.random() * 80 - 40,
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    }))
  }, [emojiCount])

  useEffect(() => {
    if (!onComplete) return

    const timer = setTimeout(() => {
      onComplete()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onComplete])

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/20 to-slate-900/40" />
      {emojis.map((emoji, index) => {
        const style: CSSProperties & {
          ['--rotation']?: string
          ['--drift']?: string
        } = {
          left: `${emoji.left}%`,
          animationDelay: `${emoji.delay}s`,
          animationDuration: `${emoji.duration}s`,
          fontSize: `${emoji.size}rem`,
        }

        style['--rotation'] = `${emoji.rotation}deg`
        style['--drift'] = `${emoji.drift}px`

        return (
          <span key={index} className="loss-emoji" style={style}>
            {emoji.emoji}
          </span>
        )
      })}

      <style jsx>{`
        .loss-emoji {
          position: absolute;
          top: -10%;
          animation-name: loss-fall;
          animation-timing-function: linear;
          animation-fill-mode: forwards;
        }

        @keyframes loss-fall {
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
