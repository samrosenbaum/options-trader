"use client"

import { useState, useEffect } from "react"
import { RefreshCw, TrendingUp, TrendingDown, Users } from "lucide-react"
import { cn } from "@/lib/utils"

interface PoliticianTrade {
  politician_name: string
  party: string
  chamber: string
  ticker: string
  transaction_type: string
  amount_range: string
  trade_date: string | null
  disclosure_date: string | null
  asset_description: string | null
}

interface TradeSummary {
  total_trades: number
  purchases: number
  sales: number
  net_sentiment: "bullish" | "bearish" | "neutral"
  notable_traders: string[]
}

export function PoliticianTradesFeed() {
  const [trades, setTrades] = useState<PoliticianTrade[]>([])
  const [summary, setSummary] = useState<TradeSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchTrades = async () => {
    try {
      setIsLoading(true)
      setError(false)
      const response = await fetch("/api/politician-trades")
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setTrades(data.trades || [])
      setSummary(data.summary || null)
    } catch (err) {
      console.error("[v0] Error fetching politician trades:", err)
      setError(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTrades()
  }, [])

  const getPartyColor = (party: string) => {
    if (party === "Democrat") return "text-blue-600 dark:text-blue-400"
    if (party === "Republican") return "text-red-600 dark:text-red-400"
    return "text-slate-600 dark:text-emerald-100/70"
  }

  const getPartyBadgeClass = (party: string) => {
    if (party === "Democrat") return "border-blue-500/40 bg-blue-500/20 text-blue-700 dark:border-blue-400/40 dark:bg-blue-500/20 dark:text-blue-300"
    if (party === "Republican") return "border-red-500/40 bg-red-500/20 text-red-700 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-300"
    return "border-slate-300 bg-slate-100 text-slate-600 dark:border-white/20 dark:bg-white/10 dark:text-emerald-100/70"
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-white/5 dark:shadow-[0_30px_120px_-60px_rgba(16,185,129,0.45)] dark:backdrop-blur-xl">
      <div className="p-6 pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Congressional Trading Activity</h3>
              <p className="text-sm text-slate-600 dark:text-emerald-100/70">
                Recent stock trades by members of Congress
                <span className="ml-2 inline-flex items-center rounded-full border border-slate-300 bg-slate-100 text-slate-600 dark:border-white/20 dark:bg-white/10 dark:text-white px-2 py-0.5 text-xs">
                  Demo Data
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={fetchTrades}
            disabled={isLoading}
            className="rounded-lg border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 disabled:opacity-50 transition-all p-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <div className="p-6">
        {/* Summary Stats */}
        {summary && !isLoading && (
          <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/10 dark:backdrop-blur-sm">
            <div className="text-center">
              <div className="text-xs text-slate-500 dark:text-emerald-100/70">Total Trades</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{summary.total_trades}</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-emerald-100/70">
                <TrendingUp className="h-3 w-3" />
                Purchases
              </div>
              <div className="text-lg font-bold text-emerald-600 dark:text-green-400">{summary.purchases}</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-emerald-100/70">
                <TrendingDown className="h-3 w-3" />
                Sales
              </div>
              <div className="text-lg font-bold text-red-600 dark:text-red-400">{summary.sales}</div>
            </div>
          </div>
        )}

        {isLoading && trades.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-600 dark:text-emerald-400" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-center dark:border-red-400/40 dark:bg-red-500/10 dark:backdrop-blur-sm">
            <p className="text-sm text-red-700 dark:text-red-200">Failed to load politician trades</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <div className="flex space-x-4 min-w-max pb-2">
              {trades.map((trade, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 w-80 rounded-xl border border-slate-200 bg-slate-50 p-3 transition-all hover:border-emerald-400 hover:bg-slate-100 dark:border-white/10 dark:bg-white/10 dark:backdrop-blur-sm dark:hover:border-emerald-400/50 dark:hover:bg-white/15"
                >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    {/* Politician Info */}
                    <div className="mb-2 flex items-center gap-2">
                      <span className={cn("text-sm font-semibold", getPartyColor(trade.party))}>
                        {trade.politician_name}
                      </span>
                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", getPartyBadgeClass(trade.party))}>
                        {trade.party.charAt(0)}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 text-slate-600 dark:border-white/20 dark:bg-white/10 dark:text-emerald-100/70 px-2 py-0.5 text-xs">
                        {trade.chamber}
                      </span>
                    </div>

                    {/* Trade Details */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        {trade.transaction_type === "purchase" ? (
                          <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-green-400" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                        )}
                        <span
                          className={cn(
                            "text-sm font-medium",
                            trade.transaction_type === "purchase" ? "text-emerald-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
                          )}
                        >
                          {trade.transaction_type === "purchase" ? "Bought" : "Sold"}
                        </span>
                      </div>

                      <span className="inline-flex items-center rounded-lg border border-emerald-500/40 bg-emerald-500/20 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-300 px-2 py-1 font-mono text-sm font-bold">
                        {trade.ticker}
                      </span>

                      <span className="text-xs text-slate-500 dark:text-emerald-100/70">{trade.amount_range}</span>
                    </div>

                    {/* Date Info */}
                    {trade.trade_date && (
                      <div className="mt-2 text-xs text-slate-500 dark:text-emerald-100/60">
                        Trade Date: {new Date(trade.trade_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upgrade Notice */}
        <div className="mt-4 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 dark:border-sky-400/40 dark:bg-sky-500/10 dark:backdrop-blur-sm">
          <p className="text-xs text-sky-700 dark:text-sky-200">
            <span className="font-semibold">Demo Data:</span> This shows sample politician trades. For real-time
            congressional trading data, consider upgrading to Quiver Quantitative API ($30-50/month).
          </p>
        </div>
      </div>
    </div>
  )
}
