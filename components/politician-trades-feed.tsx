"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
    return "text-muted-foreground"
  }

  const getPartyBadgeVariant = (party: string): "default" | "secondary" | "outline" => {
    if (party === "Democrat") return "default"
    if (party === "Republican") return "secondary"
    return "outline"
  }

  return (
    <Card className="border-card-border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Congressional Trading Activity</CardTitle>
              <CardDescription>
                Recent stock trades by members of Congress
                <Badge variant="outline" className="ml-2 text-xs">
                  Demo Data
                </Badge>
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchTrades} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        {summary && !isLoading && (
          <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg border border-card-border bg-background p-3">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Total Trades</div>
              <div className="text-lg font-bold">{summary.total_trades}</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                Purchases
              </div>
              <div className="text-lg font-bold text-bull">{summary.purchases}</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <TrendingDown className="h-3 w-3" />
                Sales
              </div>
              <div className="text-lg font-bold text-bear">{summary.sales}</div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {isLoading && trades.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
              <p className="text-sm text-destructive">Failed to load politician trades</p>
            </div>
          ) : (
            trades.map((trade, index) => (
              <div
                key={index}
                className="rounded-lg border border-card-border bg-background p-3 transition-colors hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    {/* Politician Info */}
                    <div className="mb-2 flex items-center gap-2">
                      <span className={cn("text-sm font-semibold", getPartyColor(trade.party))}>
                        {trade.politician_name}
                      </span>
                      <Badge variant={getPartyBadgeVariant(trade.party)} className="text-xs">
                        {trade.party.charAt(0)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {trade.chamber}
                      </Badge>
                    </div>

                    {/* Trade Details */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        {trade.transaction_type === "purchase" ? (
                          <TrendingUp className="h-4 w-4 text-bull" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-bear" />
                        )}
                        <span
                          className={cn(
                            "text-sm font-medium",
                            trade.transaction_type === "purchase" ? "text-bull" : "text-bear",
                          )}
                        >
                          {trade.transaction_type === "purchase" ? "Bought" : "Sold"}
                        </span>
                      </div>

                      <Badge variant="secondary" className="font-mono text-sm font-bold">
                        {trade.ticker}
                      </Badge>

                      <span className="text-xs text-muted-foreground">{trade.amount_range}</span>
                    </div>

                    {/* Date Info */}
                    {trade.trade_date && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Trade Date: {new Date(trade.trade_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Upgrade Notice */}
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">Demo Data:</span> This shows sample politician trades. For real-time
            congressional trading data, consider upgrading to Quiver Quantitative API ($30-50/month).
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
