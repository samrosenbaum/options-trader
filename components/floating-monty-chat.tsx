'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import Image from 'next/image'

interface FloatingMontyChatProps {
  message: string
}

export function FloatingMontyChat({ message }: FloatingMontyChatProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  if (isDismissed) return null

  return (
    <>
      {/* Floating button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: 'spring', stiffness: 260, damping: 20 }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-white shadow-[0_18px_40px_-18px_rgba(16,185,129,0.9)] backdrop-blur-xl transition-all hover:scale-110 hover:shadow-[0_22px_48px_-18px_rgba(16,185,129,1)] overflow-hidden"
      >
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="w-full h-full flex items-center justify-center"
        >
          {isOpen ? (
            <X className="h-5 w-5 text-emerald-600" />
          ) : (
            <Image
              src="/monty-avatar.png"
              alt="Monty"
              width={56}
              height={56}
              className="w-full h-full object-cover"
            />
          )}
        </motion.div>

        {/* Pulse animation */}
        {!isOpen && (
          <motion.div
            animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2.4, repeat: Infinity }}
            className="absolute inset-0 rounded-full bg-emerald-300/60 blur-sm"
          />
        )}
      </motion.button>

      {/* Chat bubble */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-24 right-6 z-50 w-80 max-w-[calc(100vw-3rem)]"
          >
            <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/10 p-4 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.8)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/5">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,255,226,0.6),_transparent_60%)] opacity-70" />
              <div className="pointer-events-none absolute -left-16 top-12 h-32 w-32 rounded-full bg-emerald-400/20 blur-3xl" />
              <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/40 blur-3xl" />

              {/* Close button */}
              <button
                onClick={() => setIsDismissed(true)}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-white/80 text-slate-700 shadow-lg transition-colors hover:bg-white dark:border-white/30 dark:bg-slate-900/70 dark:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>

              {/* Contact header */}
              <div className="relative mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white shadow-[0_10px_30px_-12px_rgba(16,185,129,0.8)] backdrop-blur overflow-hidden">
                  <Image
                    src="/monty-avatar.png"
                    alt="Monty"
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800 drop-shadow-sm dark:text-white">
                    Monty
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-300/80">
                    Portfolio Assistant
                  </div>
                </div>
              </div>

              {/* Message bubble */}
              <div className="relative rounded-2xl border border-white/30 bg-white/30 px-4 py-3 shadow-[0_20px_60px_-28px_rgba(30,64,175,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10">
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(140deg,rgba(255,255,255,0.65)_0%,rgba(255,255,255,0.05)_70%)] opacity-80" />
                <p className="relative text-[15px] leading-[1.45] text-slate-800 dark:text-slate-100">
                  {message}
                </p>
              </div>
              <div className="relative mt-2">
                <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500/80 dark:text-slate-300/70">
                  Just now
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
