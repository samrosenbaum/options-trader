'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from 'framer-motion'

interface GuideStep {
  start: number
  end: number
  message: string
}

const guideSteps: GuideStep[] = [
  {
    start: 0,
    end: 0.18,
    message: "Welcome in—I'm Monty. Let's float through the desk together.",
  },
  {
    start: 0.18,
    end: 0.42,
    message: 'Watch how the scanner locks onto high-conviction flow for you.',
  },
  {
    start: 0.42,
    end: 0.68,
    message: 'These trading principles are our manifesto—your new playbook.',
  },
  {
    start: 0.68,
    end: 0.88,
    message: 'See the workflow? I analyze, you decide. We trade like a desk.',
  },
  {
    start: 0.88,
    end: 1.01,
    message: "Ready to take your seat? I'll be right beside you inside the platform.",
  },
]

export function MontyGuide() {
  const { scrollYProgress } = useScroll()
  const [activeStep, setActiveStep] = useState(guideSteps[0])

  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    setActiveStep((previous) => {
      const step = guideSteps.find((item) => latest >= item.start && latest < item.end)
      if (!step || step === previous) {
        return previous
      }
      return step
    })
  })

  const motionKeyframes = useMemo(
    () => [0, 0.2, 0.45, 0.7, 1],
    [],
  )

  const x = useTransform(scrollYProgress, motionKeyframes, [-80, 140, -120, 120, -40])
  const y = useTransform(scrollYProgress, motionKeyframes, [120, 420, 860, 1220, 1580])
  const rotate = useTransform(scrollYProgress, motionKeyframes, [-8, 6, -4, 5, -3])
  const sparkleOpacity = useTransform(scrollYProgress, motionKeyframes, [0.4, 0.7, 0.5, 0.8, 0.6])

  return (
    <motion.div
      className="pointer-events-none fixed left-0 top-0 z-[5] hidden h-0 w-0 md:block"
      style={{ x, y, rotate }}
    >
      <motion.div
        animate={{ y: [-16, 12, -16], rotate: [-2, 2, -2] }}
        transition={{ repeat: Infinity, duration: 7, ease: 'easeInOut' }}
        className="relative"
      >
        <div className="relative h-28 w-28 rounded-full bg-gradient-to-br from-slate-50 via-white to-slate-200 shadow-[0_35px_90px_-45px_rgba(15,23,42,0.6)]">
          <div className="absolute inset-0 rounded-full border border-slate-200/70 shadow-inner" />
          <div className="absolute inset-1 rounded-full bg-gradient-to-br from-white via-slate-50 to-slate-200" />
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/0 via-white/30 to-white/60" />

          <div className="absolute left-[16%] top-[40%] flex w-[68%] items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-700 bg-white shadow-[0_6px_10px_-6px_rgba(15,23,42,0.6)]">
              <div className="h-3 w-3 rounded-full bg-slate-800" />
            </div>
            <div className="h-1 w-6 rounded-full bg-slate-700" />
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-700 bg-white shadow-[0_6px_10px_-6px_rgba(15,23,42,0.6)]">
              <div className="h-3 w-3 rounded-full bg-slate-800" />
            </div>
          </div>

          <div className="absolute left-[32%] top-[58%] h-1.5 w-[36%] rounded-full bg-slate-700/80" />
        </div>

        <motion.div
          className="absolute -bottom-10 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep.message}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="pointer-events-auto w-64 max-w-xs rounded-2xl border border-emerald-200/70 bg-white/90 p-4 text-sm text-slate-700 shadow-[0_25px_70px_-35px_rgba(16,185,129,0.45)] backdrop-blur"
            >
              <p className="font-semibold text-emerald-600">Monty</p>
              <p className="mt-1 text-[13px] leading-relaxed">{activeStep.message}</p>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <motion.div
          className="absolute -z-10 -left-16 top-1/3 h-40 w-40 rounded-full bg-emerald-200/30 blur-3xl"
          style={{ opacity: sparkleOpacity }}
        />
        <motion.div
          className="absolute -z-10 -right-12 top-0 h-28 w-28 rounded-full bg-sky-200/30 blur-3xl"
          style={{ opacity: sparkleOpacity }}
        />
        {[[-30, -20], [10, -40], [30, 12]].map(([xOffset, yOffset], index) => (
          <motion.span
            key={index}
            className="absolute -z-20 h-3 w-3 rounded-full bg-white/80 shadow-[0_0_12px_rgba(148,255,226,0.8)]"
            style={{ left: `calc(50% + ${xOffset}px)`, top: `calc(25% + ${yOffset}px)` }}
            animate={{
              opacity: [0.4, 1, 0.4],
              scale: [0.6, 1.2, 0.6],
              y: [0, -6, 0],
            }}
            transition={{ duration: 3.2 + index * 0.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </motion.div>
    </motion.div>
  )
}
