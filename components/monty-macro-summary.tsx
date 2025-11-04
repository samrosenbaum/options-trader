"use client"

import Image from "next/image"
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

    const spyLabel = indices["SPY"]?.name || "S&P 500"
    const qqqLabel = indices["QQQ"]?.name || "Nasdaq 100"
    const diaLabel = indices["DIA"]?.name || "Dow Jones"

    const indexDetails = [
      { ticker: "SPY", change: spyChange, label: spyLabel },
      { ticker: "QQQ", change: qqqChange, label: qqqLabel },
      { ticker: "DIA", change: diaChange, label: diaLabel },
    ]

    const formatPercent = (value: number) => {
      const sign = value > 0 ? "+" : ""
      return `${sign}${value.toFixed(2)}%`
    }

    let marketMood = ""
    const explanationParts: string[] = []

    if (spyChange >= 2) {
      marketMood = `${spyLabel} is ripping higher, up ${formatPercent(spyChange)}.`
      explanationParts.push("Momentum buyers are firmly in control right now.")
    } else if (spyChange >= 1) {
      marketMood = `${spyLabel} is staging a healthy rally at ${formatPercent(spyChange)}.`
      explanationParts.push("Dip buyers are stepping back in and broad participation is improving.")
    } else if (spyChange >= 0.3) {
      marketMood = `${spyLabel} is grinding upward (${formatPercent(spyChange)}).`
      explanationParts.push("It's a constructive tape with a modest risk-on bias.")
    } else if (spyChange > -0.3) {
      marketMood = `${spyLabel} is basically flat (${formatPercent(spyChange)}).`
      explanationParts.push("Flows are choppy, so rotation and headlines matter more than index direction.")
    } else if (spyChange > -1) {
      marketMood = `${spyLabel} is fading, down ${formatPercent(spyChange)}.`
      explanationParts.push("Sellers have the edge, but buyers are still probing for entries.")
    } else if (spyChange > -1.8) {
      marketMood = `${spyLabel} is under heavy pressure, off ${formatPercent(spyChange)}.`
      explanationParts.push("Risk appetite is cooling quickly as bids get pulled.")
    } else {
      marketMood = `${spyLabel} is in full risk-off mode, plunging ${formatPercent(spyChange)}.`
      explanationParts.push("Capitulation flows are dominating and dip buyers are scarce.")
    }

    const topMover = indexDetails.reduce(
      (prev, curr) => (Math.abs(curr.change) > Math.abs(prev.change) ? curr : prev),
      indexDetails[0],
    )

    if (topMover && Math.abs(topMover.change) >= 0.8) {
      explanationParts.push(
        `${topMover.label} is the standout move at ${formatPercent(topMover.change)}, setting the tone for the session.`,
      )
    }

    // Tech vs broad market analysis
    let sectorNote = ""
    if (qqqChange >= spyChange + 0.5) {
      sectorNote = ` Growth is leading—${qqqLabel} is at ${formatPercent(qqqChange)} versus the ${formatPercent(spyChange)} print for the ${spyLabel}.`
    } else if (spyChange >= qqqChange + 0.5) {
      sectorNote = ` Value and cyclicals are carrying things: ${diaLabel} is at ${formatPercent(diaChange)} while ${qqqLabel} lags at ${formatPercent(qqqChange)}.`
    } else if (Math.abs(qqqChange - diaChange) >= 0.6) {
      const leader = qqqChange > diaChange ? qqqLabel : diaLabel
      const laggard = qqqChange > diaChange ? diaLabel : qqqLabel
      sectorNote = ` There's a clear rotation—${leader} is pulling ahead while ${laggard} trails.`
    }

    // VIX in simple terms
    let fearNote = ""
    if (vix > 25) {
      fearNote = ` Volatility is elevated with the VIX up at ${vix.toFixed(1)}, so option premium is getting pricey.`
    } else if (vix > 20) {
      fearNote = ` There's a nervous tone—VIX around ${vix.toFixed(1)} means traders are paying up for protection.`
    } else if (vix < 15 && vix !== 0) {
      fearNote = ` The volatility backdrop is calm with VIX near ${vix.toFixed(1)}, which keeps options relatively cheap for buyers.`
    }

    // Interest rates in simple terms
    const tenYear = treasuries["10-Year"]?.yield || 0
    const twoYear = treasuries["2-Year"]?.yield || 0
    let ratesNote = ""

    if (tenYear && twoYear && twoYear > tenYear) {
      ratesNote = ` The yield curve is inverted (${twoYear.toFixed(2)}% on 2Y vs ${tenYear.toFixed(2)}% on 10Y), flagging slowdown risk.`
    } else if (tenYear > 4.5) {
      ratesNote = ` Long rates near ${tenYear.toFixed(2)}% keep pressure on equity valuations.`
    } else if (tenYear && tenYear < 3.5) {
      ratesNote = ` Softer long-term yields around ${tenYear.toFixed(2)}% are giving growth stocks some breathing room.`
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

    // News sentiment
    let newsNote = ""
    if (topNews.length > 0) {
      const sentimentCounts = topNews.reduce(
        (acc, news) => {
          const label = news.sentiment?.label?.toLowerCase()
          if (label === "positive") acc.positive += 1
          else if (label === "negative") acc.negative += 1
          else acc.neutral += 1
          return acc
        },
        { positive: 0, negative: 0, neutral: 0 },
      )

      if (sentimentCounts.positive >= sentimentCounts.negative + 2) {
        newsNote = " Headlines skew upbeat, adding fuel to the bullish tone."
      } else if (sentimentCounts.negative >= sentimentCounts.positive + 2) {
        newsNote = " Headlines lean negative, which is keeping traders cautious."
      } else if (sentimentCounts.neutral > 0) {
        newsNote = " Newsflow is mixed, so positioning stays nimble."
      }
    }

    const detailNotes = [
      explanationParts.join(" "),
      sectorNote,
      fearNote,
      ratesNote,
      hypeNote,
      insiderNote,
      newsNote,
    ]
      .filter(Boolean)
      .map((note) => note.trim())
      .join(" ")

    // Build the personalized summary
    const fullSummary = `${greeting}, here's what I'm seeing. ${marketMood} ${detailNotes}`.trim()

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
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white shadow-lg">
          <Image src="/monty-avatar.png" alt="Monty" width={40} height={40} className="h-full w-full object-cover" />
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
