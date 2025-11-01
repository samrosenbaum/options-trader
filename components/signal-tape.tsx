"use client"

import { useState, useEffect } from "react"
import { Layers, RefreshCw } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface SentimentSignal {
  id: string
  label: string
  detail: string
  time: string
  direction: "bullish" | "bearish"
}

export function SignalTape() {
  const [signals, setSignals] = useState<SentimentSignal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchSignals = async () => {
    try {
      setIsLoading(true)
      setError(false)
      const response = await fetch("/api/sentiment-signals")
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setSignals(data.signals || [])
    } catch (err) {
      console.error("[Signal Tape] Error fetching signals:", err)
      setError(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSignals()
    const interval = setInterval(fetchSignals, 5 * 60 * 1000) // Refresh every 5 minutes
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-white/5 dark:shadow-[0_30px_120px_-60px_rgba(16,185,129,0.45)] dark:backdrop-blur-xl">
      <div className="p-6 pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Signal Tape</h3>
              <p className="text-sm text-slate-600 dark:text-emerald-100/70">Live market sentiment signals</p>
            </div>
          </div>
          <button
            onClick={fetchSignals}
            disabled={isLoading}
            className="rounded-lg border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 disabled:opacity-50 transition-all p-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <div className="p-6">
        {isLoading && signals.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-600 dark:text-emerald-400" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-center dark:border-red-400/40 dark:bg-red-500/10 dark:backdrop-blur-sm">
            <p className="text-sm text-red-700 dark:text-red-200">Failed to load sentiment signals</p>
          </div>
        ) : signals.length > 0 ? (
          <div className="space-y-4">
            {signals.map((signal) => (
              <div
                key={signal.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-emerald-400 hover:bg-slate-100 dark:border-white/10 dark:bg-white/10 dark:backdrop-blur-sm dark:hover:border-emerald-400/50 dark:hover:bg-white/15"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{signal.label}</div>
                  <div
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                      signal.direction === "bullish"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300"
                    }`}
                  >
                    {signal.direction}
                  </div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">{signal.detail}</p>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
                  {formatDistanceToNow(new Date(signal.time), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center dark:border-white/10 dark:bg-white/10 dark:backdrop-blur-sm">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No major sentiment signals have fired yet today. Once the news tape moves, they'll land here automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
