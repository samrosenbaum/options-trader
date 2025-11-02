'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

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
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-2xl transition-all hover:scale-110 hover:shadow-emerald-500/50"
      >
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="text-xl font-bold"
        >
          {isOpen ? '✕' : 'M'}
        </motion.div>

        {/* Pulse animation */}
        {!isOpen && (
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full bg-emerald-400"
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
            <div className="relative">
              {/* Close button */}
              <button
                onClick={() => setIsDismissed(true)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-600 shadow-lg transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>

              {/* Contact header */}
              <div className="mb-2 flex items-center gap-2 px-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold text-sm shadow-lg">
                  M
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    Monty
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Portfolio Assistant
                  </div>
                </div>
              </div>

              {/* Message bubble */}
              <div className="rounded-[18px] bg-emerald-500 dark:bg-emerald-600 px-4 py-3 shadow-xl">
                <p className="text-[15px] leading-[1.4] text-white">
                  {message}
                </p>
              </div>
              <div className="mt-1 px-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
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
