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
    // Extract first name if full name is provided
    const firstName = userName ? userName.split(' ')[0] : null
    const greeting = firstName || "Hey there"

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
    <div className="flex flex-col gap-3">
      {/* Contact Header */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold text-lg shadow-lg">
          M
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Monty
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">Market Assistant</span>
          </div>
        </div>
        <button
          onClick={generateSummary}
          disabled={isLoading}
          className="rounded-full p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* iMessage Bubble */}
      <div className="flex items-start gap-2">
        <div className="max-w-[85%]">
          {isLoading ? (
            <div className="rounded-[18px] bg-slate-200 dark:bg-slate-700 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Analyzing market data...</span>
              </div>
            </div>
          ) : (
            <div className="rounded-[18px] bg-emerald-500 dark:bg-emerald-600 px-4 py-3 shadow-md">
              <p className="text-[15px] leading-[1.4] text-white">
                {summary}
              </p>
            </div>
          )}
          {!isLoading && (
            <div className="mt-1 px-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Just now
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
