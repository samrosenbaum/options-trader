"use client"

import { useState, useEffect } from "react"
import { RefreshCw } from "lucide-react"

interface MacroSummaryProps {
  vix: number
  indices: Record<string, { change_pct: number; name: string }>
  treasuries: Record<string, { yield: number }>
  wsbTrending?: string[]
  recentTrades?: Array<{ ticker: string; transaction_type: string }>
  topNews?: Array<{ sentiment: { label: string } }>
}

export function MontyMacroSummary({
  vix,
  indices,
  treasuries,
  wsbTrending = [],
  recentTrades = [],
  topNews = [],
}: MacroSummaryProps) {
  const [summary, setSummary] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)

  const generateSummary = () => {
    setIsLoading(true)

    // Analyze VIX
    let vixTake = ""
    if (vix > 25) {
      vixTake = "the market is super volatile right now (VIX is high), so option premiums are expensive"
    } else if (vix > 20) {
      vixTake = "volatility is elevated, which means premiums are a bit pricey"
    } else if (vix < 15) {
      vixTake = "the market is pretty calm (low VIX), so options are cheaper than usual"
    } else {
      vixTake = "volatility is normal right now"
    }

    // Analyze market direction
    const spyChange = indices["SPY"]?.change_pct || 0
    const qqqChange = indices["QQQ"]?.change_pct || 0
    let marketDirection = ""

    if (spyChange > 1 && qqqChange > 1) {
      marketDirection = "Markets are ripping higher today"
    } else if (spyChange < -1 && qqqChange < -1) {
      marketDirection = "Markets are getting hammered today"
    } else if (spyChange > 0.5 || qqqChange > 0.5) {
      marketDirection = "Markets are grinding higher"
    } else if (spyChange < -0.5 || qqqChange < -0.5) {
      marketDirection = "Markets are drifting lower"
    } else {
      marketDirection = "Markets are pretty flat"
    }

    // Check yield curve
    const tenYear = treasuries["10-Year"]?.yield || 0
    const twoYear = treasuries["2-Year"]?.yield || 0
    let yieldCurveTake = ""

    if (tenYear && twoYear && twoYear > tenYear) {
      yieldCurveTake = " The yield curve is inverted (short-term rates higher than long-term), which historically signals recession fears."
    } else if (tenYear > 4.5) {
      yieldCurveTake = " Yields are elevated, which can pressure growth stocks."
    }

    // WSB analysis
    let wsbTake = ""
    if (wsbTrending.length > 0) {
      const topTickers = wsbTrending.slice(0, 3).join(", ")
      wsbTake = ` WSB is going crazy over ${topTickers} right now.`
    }

    // Political trades
    let politicianTake = ""
    const recentBuys = recentTrades.filter((t) => t.transaction_type === "purchase").slice(0, 2)
    if (recentBuys.length > 0) {
      const tickers = recentBuys.map((t) => t.ticker).join(" and ")
      politicianTake = ` Also, some politicians just bought ${tickers}.`
    }

    // News sentiment
    let newsTake = ""
    if (topNews.length > 0) {
      const bullishCount = topNews.filter((n) => n.sentiment.label === "bullish").length
      const bearishCount = topNews.filter((n) => n.sentiment.label === "bearish").length

      if (bullishCount > bearishCount * 1.5) {
        newsTake = " News flow is pretty bullish right now."
      } else if (bearishCount > bullishCount * 1.5) {
        newsTake = " News flow is pretty bearish right now."
      }
    }

    // Combine into friendly summary
    const fullSummary = `${marketDirection}. ${vixTake}.${yieldCurveTake}${wsbTake}${politicianTake}${newsTake}`

    setSummary(fullSummary)
    setIsLoading(false)
  }

  useEffect(() => {
    if (vix && indices) {
      generateSummary()
    }
  }, [vix, indices, treasuries, wsbTrending, recentTrades, topNews])

  if (!summary && !isLoading) {
    return null
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-50 p-6 shadow-lg dark:border-emerald-400/30 dark:from-emerald-950/30 dark:via-cyan-950/20 dark:to-blue-950/20">
      {/* Decorative background elements */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-cyan-400/10 blur-2xl" />

      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Monty's Market Summary
          </h3>
          <button
            onClick={generateSummary}
            disabled={isLoading}
            className="rounded-lg border border-emerald-300 bg-emerald-100 p-2 text-emerald-700 transition-all hover:bg-emerald-200 disabled:opacity-50 dark:border-emerald-400/30 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Analyzing market data...</span>
          </div>
        ) : (
          <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300">
            {summary}
          </p>
        )}
      </div>
    </div>
  )
}
