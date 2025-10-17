"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, RefreshCw, Zap, Target } from "lucide-react"

interface OpportunityScore {
  symbol: string
  optionType: "call" | "put"
  action: "buy" | "sell"
  strike: number
  expiration: string
  premium: number
  bid: number
  ask: number
  volume: number
  openInterest: number
  impliedVolatility: number
  stockPrice: number
  score: number
  confidence: number
  reasoning: string[]
  catalysts: string[]
  riskLevel: "low" | "medium" | "high"
  potentialReturn: number
  maxLoss: number
  breakeven: number
  ivRank: number
  volumeRatio: number
  greeks: {
    delta: number
    gamma: number
    theta: number
    vega: number
  }
}

export function LiveScanner() {
  const [opportunities, setOpportunities] = useState<OpportunityScore[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [budget, setBudget] = useState(1500) // Default budget

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(false)
      const response = await fetch(`/api/scan-python?budget=${budget}`)
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setOpportunities(data.opportunities || [])
      setLastUpdate(data.timestamp ? new Date(data.timestamp) : new Date())
    } catch (err) {
      console.error("[v0] Error fetching opportunities:", err)
      setError(true)
    } finally {
      setIsLoading(false)
    }
  }, [budget])

  useEffect(() => {
    fetchData()
    if (autoRefresh) {
      const interval = setInterval(fetchData, 120000) // 2 minutes
      return () => clearInterval(interval)
    }
  }, [autoRefresh, fetchData]) // Re-fetch when budget changes

  return (
    <Card className="border-card-border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Live Opportunity Scanner
            </CardTitle>
            <CardDescription>
              Real-time analysis via yfinance • {opportunities.length} high-potential trades
              {lastUpdate && ` • Updated ${lastUpdate.toLocaleTimeString()}`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Max Budget:</label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="w-24 rounded border border-input bg-background px-2 py-1 text-sm"
                min="100"
                max="10000"
                step="100"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? "border-primary text-primary" : ""}
            >
              {autoRefresh ? "Auto" : "Manual"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && opportunities.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <RefreshCw className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Scanning real options data...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
            <p className="text-sm text-destructive">Failed to load opportunities. Please try again.</p>
            <p className="mt-1 text-xs text-muted-foreground">Make sure Python dependencies are installed</p>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="rounded-lg border border-muted bg-muted/10 p-8 text-center">
            <Target className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">No high-scoring opportunities found. Scanning...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {opportunities.map((opp, index) => (
              <div
                key={`${opp.symbol}-${opp.strike}-${index}`}
                className="rounded-lg border border-card-border bg-background p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-mono text-lg font-bold text-foreground">{opp.symbol}</h4>
                      <Badge variant={opp.optionType === "call" ? "default" : "secondary"}>
                        {opp.optionType.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        ${opp.strike}
                      </Badge>
                      <Badge variant="outline">{opp.expiration}</Badge>
                    </div>

                    <div className="mt-2 flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Score:</span>
                        <span className="font-bold text-primary">{opp.score.toFixed(0)}/100</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Confidence:</span>
                        <span className="font-semibold text-foreground">{opp.confidence.toFixed(0)}%</span>
                      </div>
                      <Badge
                        variant={
                          opp.riskLevel === "low" ? "default" : opp.riskLevel === "medium" ? "secondary" : "destructive"
                        }
                      >
                        {opp.riskLevel.toUpperCase()} RISK
                      </Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-4 gap-3 rounded-lg bg-muted/30 p-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Delta</p>
                        <p className="font-mono font-semibold text-foreground">{opp.greeks.delta.toFixed(3)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Gamma</p>
                        <p className="font-mono font-semibold text-foreground">{opp.greeks.gamma.toFixed(4)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Theta</p>
                        <p className="font-mono font-semibold text-foreground">{opp.greeks.theta.toFixed(3)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Vega</p>
                        <p className="font-mono font-semibold text-foreground">{opp.greeks.vega.toFixed(3)}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Potential Return</p>
                        <p className="font-mono font-semibold text-bull">${opp.potentialReturn.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Max Loss</p>
                        <p className="font-mono font-semibold text-bear">${opp.maxLoss.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Breakeven</p>
                        <p className="font-mono font-semibold text-foreground">${opp.breakeven.toFixed(2)}</p>
                      </div>
                    </div>

                    {opp.catalysts.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {opp.catalysts.map((catalyst, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            <Zap className="mr-1 h-3 w-3" />
                            {catalyst}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 space-y-1">
                      {opp.reasoning.map((reason, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          • {reason}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="ml-4 flex flex-col items-end gap-2">
                    {opp.optionType === "call" ? (
                      <TrendingUp className="h-8 w-8 text-bull" />
                    ) : (
                      <TrendingDown className="h-8 w-8 text-bear" />
                    )}
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">IV Rank</p>
                      <p className="font-mono text-sm font-semibold">{opp.ivRank.toFixed(0)}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Vol Ratio</p>
                      <p className="font-mono text-sm font-semibold">{opp.volumeRatio.toFixed(1)}x</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
