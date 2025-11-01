"use client"

import { useState, useEffect } from "react"
import { ExternalLink, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react"

// Macro event badge styling
const MACRO_EVENT_DISPLAY: Record<string, { label: string; className: string; emoji: string }> = {
  trade_war: { label: "Trade War", className: "border-red-400/40 bg-red-500/20 text-red-300", emoji: "⚔️" },
  geopolitical: { label: "Geopolitical", className: "border-red-400/40 bg-red-500/20 text-red-300", emoji: "🌍" },
  monetary_policy: { label: "Fed Policy", className: "border-sky-400/40 bg-sky-500/20 text-sky-300", emoji: "🏦" },
  economic_data: { label: "Economic Data", className: "border-emerald-400/40 bg-emerald-500/20 text-emerald-300", emoji: "📊" },
  sector_events: { label: "Sector Event", className: "border-purple-400/40 bg-purple-500/20 text-purple-300", emoji: "🏭" },
  market_structure: { label: "Market Event", className: "border-amber-400/40 bg-amber-500/20 text-amber-300", emoji: "⚠️" },
}

interface NewsItem {
  id: string
  headline: string
  summary: string
  source: string
  url: string
  datetime: number
  related: string[]
  sentiment: {
    label: "bullish" | "bearish" | "neutral"
    score: number
  }
  macro_events?: string[]
}

export function LiveNewsFeed() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchNews = async () => {
    try {
      setIsLoading(true)
      setError(false)
      const response = await fetch("/api/news-python")
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setNews(data.news || [])
    } catch (err) {
      console.error("[v0] Error fetching news:", err)
      setError(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchNews()
    const interval = setInterval(fetchNews, 120000) // 2 minutes
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-white/5 dark:shadow-[0_30px_120px_-60px_rgba(16,185,129,0.45)] dark:backdrop-blur-xl">
      <div className="p-6 pb-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Live Market News</h3>
            <p className="text-sm text-slate-600 dark:text-emerald-100/70">Real-time headlines with sentiment analysis</p>
          </div>
          <button
            onClick={fetchNews}
            disabled={isLoading}
            className="rounded-lg border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 disabled:opacity-50 transition-all p-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <div className="p-6">
        {isLoading && news.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-600 dark:text-emerald-400" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-center dark:border-red-400/40 dark:bg-red-500/10 dark:backdrop-blur-sm">
            <p className="text-sm text-red-700 dark:text-red-200">Failed to load news</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <div className="flex space-x-4 min-w-max pb-2">
              {news.map((item) => (
                <div
                  key={item.id}
                  className="flex-shrink-0 w-96 rounded-xl border border-slate-200 bg-slate-50 p-3 transition-all hover:border-emerald-400 hover:bg-slate-100 dark:border-white/10 dark:bg-white/10 dark:backdrop-blur-sm dark:hover:border-emerald-400/50 dark:hover:bg-white/15"
                >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 pt-1">
                    {item.sentiment.label === "bullish" ? (
                      <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-green-400" />
                    ) : item.sentiment.label === "bearish" ? (
                      <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                    ) : (
                      <Minus className="h-5 w-5 text-slate-400 dark:text-emerald-100/60" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold leading-tight text-slate-900 dark:text-white">{item.headline}</h4>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-slate-500 hover:text-emerald-600 dark:text-emerald-100/70 dark:hover:text-emerald-400 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-emerald-100/70 line-clamp-2">{item.summary}</p>

                    {/* Macro Event Alerts - Informational Only */}
                    {item.macro_events && item.macro_events.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.macro_events.map((event) => {
                          const display = MACRO_EVENT_DISPLAY[event]
                          if (!display) return null
                          return (
                            <span
                              key={event}
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${display.className}`}
                            >
                              <span className="mr-1">{display.emoji}</span>
                              {display.label}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 text-slate-600 dark:border-white/20 dark:bg-white/10 dark:text-emerald-100/70 px-2 py-0.5 text-xs">
                        {item.source}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-emerald-100/60">
                        {new Date(item.datetime * 1000).toLocaleTimeString()}
                      </span>
                      {item.related.length > 0 && (
                        <div className="flex gap-1">
                          {item.related.slice(0, 3).map((symbol) => (
                            <span key={symbol} className="inline-flex items-center rounded-lg border border-emerald-500/40 bg-emerald-500/20 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-300 px-2 py-0.5 font-mono text-xs font-medium">
                              {symbol}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
