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
  userName?: string
}

export function MontyMacroSummary({
  vix,
  indices,
  treasuries,
  wsbTrending = [],
  recentTrades = [],
  topNews = [],
  userName,
}: MacroSummaryProps) {
  const [summary, setSummary] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)

  const generateSummary = () => {
    setIsLoading(true)

    // Get user's first name or default greeting
    const greeting = userName ? `@${userName}` : "Hey there"

    // Analyze market direction
    const spyChange = indices["SPY"]?.change_pct || 0
    const qqqChange = indices["QQQ"]?.change_pct || 0
    const diaChange = indices["DIA"]?.change_pct || 0

    let marketMood = ""
    let marketExplanation = ""

    if (spyChange > 1.5) {
      marketMood = "the market is having a strong rally"
      marketExplanation = "stocks are climbing fast, which usually means investors are feeling optimistic"
    } else if (spyChange > 0.5) {
      marketMood = "stocks are moving up steadily"
      marketExplanation = "it's a positive day with buyers in control"
    } else if (spyChange < -1.5) {
      marketMood = "we're seeing a pretty rough selloff"
      marketExplanation = "lots of people are selling stocks, which could mean fear or profit-taking"
    } else if (spyChange < -0.5) {
      marketMood = "the market is drifting lower"
      marketExplanation = "sellers are in control but it's not a panic situation"
    } else {
      marketMood = "the market is pretty quiet"
      marketExplanation = "not much happening—buyers and sellers are balanced"
    }

    // Tech vs broad market analysis
    let sectorNote = ""
    if (qqqChange > spyChange + 0.5) {
      sectorNote = " Tech stocks (like Apple, Microsoft, Tesla) are leading the way higher."
    } else if (spyChange > qqqChange + 0.5) {
      sectorNote = " Traditional companies (banks, healthcare, etc.) are doing better than tech today."
    }

    // VIX in simple terms
    let fearNote = ""
    if (vix > 25) {
      fearNote = " The 'fear gauge' (VIX) is high, meaning people expect big price swings soon. Options are expensive right now because of this uncertainty."
    } else if (vix > 20) {
      fearNote = " There's some nervousness in the market (VIX is elevated), so options cost a bit more than usual."
    } else if (vix < 15) {
      fearNote = " Things are calm (low VIX), so options are relatively cheap—good for buyers, not great for sellers."
    }

    // Interest rates in simple terms
    const tenYear = treasuries["10-Year"]?.yield || 0
    const twoYear = treasuries["2-Year"]?.yield || 0
    let ratesNote = ""

    if (tenYear && twoYear && twoYear > tenYear) {
      ratesNote = " Interest rates are wonky right now—short-term rates are higher than long-term ones, which historically means the economy might slow down."
    } else if (tenYear > 4.5) {
      ratesNote = " Interest rates are pretty high, which can make stocks less attractive compared to bonds."
    }

    // WSB hype
    let hypeNote = ""
    if (wsbTrending.length > 0) {
      const topTickers = wsbTrending.slice(0, 2).join(" and ")
      hypeNote = ` Retail traders on WallStreetBets are pumping ${topTickers} today.`
    }

    // Insider activity
    let insiderNote = ""
    const recentBuys = recentTrades.filter((t) => t.transaction_type === "purchase").slice(0, 2)
    if (recentBuys.length > 0) {
      const tickers = recentBuys.map((t) => t.ticker).join(" and ")
      insiderNote = ` Some members of Congress just bought ${tickers}—worth keeping an eye on.`
    }

    // Build the personalized summary
    const fullSummary = `${greeting}, I've gone through the latest market info for you. Here's your TL;DR: ${marketMood}—${marketExplanation}.${sectorNote}${fearNote}${ratesNote}${hypeNote}${insiderNote}`

    setSummary(fullSummary)
    setIsLoading(false)
  }

  useEffect(() => {
    if (vix && indices) {
      generateSummary()
    }
  }, [vix, indices, treasuries, wsbTrending, recentTrades, topNews, userName])

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
