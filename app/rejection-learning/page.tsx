'use client'

import { useState, useEffect, useMemo } from "react"
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { TrendingUp, TrendingDown, RefreshCw, Brain, AlertTriangle, Info } from "lucide-react"

interface RejectedOption {
  symbol: string
  strike: number
  expiration: string
  option_type: string
  rejection_reason: string
  filter_stage: string
  rejected_at: string
  rejection_source?: string
  stock_price?: number
  option_price: number
  volume: number
  open_interest: number
  next_day_price: number | null
  price_change_percent: number | null
  was_profitable: boolean | null
  position_id?: string | null
  days_until_expiration?: number | null
  days_held?: number | null
  realized_pl?: number | null
  realized_pl_percent?: number | null
}

interface RejectionStats {
  count: number
  profitable_count: number
  profitable_rate: number
  avg_change?: number
}

interface RejectionReasonStats extends RejectionStats {
  avg_change: number
}

interface MissedOpportunity {
  option: RejectedOption & {
    stock_price: number
    probability_score: number | null
    risk_adjusted_score: number | null
    quality_score: number | null
  }
  profit_percent: number
  what_we_missed: string
  pattern_tags: string[]
}

interface AnalysisResult {
  total_rejections: number
  analyzed_count: number
  profitable_count: number
  profitable_rate: number
  avg_change_percent: number
  missed_opportunities: MissedOpportunity[]
  rejection_reason_stats: Record<string, RejectionReasonStats>
  filter_stage_stats: Record<string, RejectionStats>
  recommendations: string[]
  ai_summary?: string | null
  raw: unknown
}

const USER_LOOKBACK_DAYS = 90
const CLOSED_HISTORY_DAYS = 30

export default function RejectionLearningPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [rejections, setRejections] = useState<RejectedOption[]>([])
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isBackfilling, setIsBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<{backfilled: number, skipped: number, errors: number, errorDetails?: Array<{symbol: string, error: string}>} | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{updated: number, skipped: number, errors: number, errorDetails?: Array<{symbol: string, error: string}>} | null>(null)
  const [isUpdatingPerformance, setIsUpdatingPerformance] = useState(false)
  const [performanceResult, setPerformanceResult] = useState<{updated: number, skipped: number, errors: number, errorDetails?: Array<{symbol: string, error: string}>} | null>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const closedPositionRejections = useMemo(
    () => rejections.filter(r => r.rejection_source === 'user_closed_position'),
    [rejections]
  )

  const { activeClosedPositions, historicalClosedPositions } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const historyCutoff = new Date(today)
    historyCutoff.setDate(historyCutoff.getDate() - CLOSED_HISTORY_DAYS)

    const active: RejectedOption[] = []
    const history: RejectedOption[] = []

    for (const rejection of closedPositionRejections) {
      const expirationDate = rejection.expiration ? new Date(rejection.expiration) : null
      const closedDate = rejection.rejected_at ? new Date(rejection.rejected_at) : null

      if (expirationDate) {
        expirationDate.setHours(0, 0, 0, 0)
      }
      if (closedDate) {
        closedDate.setHours(0, 0, 0, 0)
      }

      const hasExpired = expirationDate ? expirationDate < today : false

      if (!hasExpired) {
        active.push(rejection)
        continue
      }

      if (closedDate && closedDate >= historyCutoff) {
        history.push(rejection)
      }
    }

    return {
      activeClosedPositions: active,
      historicalClosedPositions: history,
    }
  }, [closedPositionRejections])

  const manualRejections = useMemo(
    () => rejections.filter(r => r.rejection_source === 'user_rejected'),
    [rejections]
  )

  useEffect(() => {
    let isActive = true

    const fetchUser = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()

        if (!isActive) return

        if (error || !user) {
          router.replace('/auth/login')
          return
        }

        setUser(user)
        fetchRejections()
      } catch (error) {
        if (isActive) {
          console.error('Failed to fetch user for Anti-Portfolio', error)
          router.replace('/auth/login')
        }
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    fetchUser()

    return () => {
      isActive = false
    }
  }, [router, supabase])

  const fetchRejections = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/rejection-analysis?source=user&days=${USER_LOOKBACK_DAYS}`)
      const data = await response.json()
      setRejections(data.rejections || [])
    } catch (err) {
      console.error("Failed to fetch rejections:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const runAnalysis = async () => {
    try {
      setIsAnalyzing(true)
      const response = await fetch("/api/rejection-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: 'analyze', daysBack: 7, minProfitPercent: 10 })
      })
      const data = await response.json()
      setAnalysis(data.analysis)
      await fetchRejections()
    } catch (err) {
      console.error("Analysis failed:", err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const runBackfill = async () => {
    try {
      setIsBackfilling(true)
      setBackfillResult(null)
      const response = await fetch("/api/backfill-rejections", {
        method: "POST"
      })
      const data = await response.json()
      if (data.success) {
        setBackfillResult({
          backfilled: data.backfilled,
          skipped: data.skipped,
          errors: data.errors,
          errorDetails: data.errorDetails
        })
        await fetchRejections() // Refresh the list
      }
    } catch (err) {
      console.error("Backfill failed:", err)
    } finally {
      setIsBackfilling(false)
    }
  }

  const syncAntiPortfolio = async () => {
    try {
      setIsSyncing(true)
      setSyncResult(null)
      const response = await fetch("/api/sync-anti-portfolio", {
        method: "POST"
      })
      const data = await response.json()
      if (data.success) {
        setSyncResult({
          updated: data.updated,
          skipped: data.skipped,
          errors: data.errors,
          errorDetails: data.errorDetails
        })
        await fetchRejections() // Refresh the list with corrected P&L
      }
    } catch (err) {
      console.error("Sync failed:", err)
    } finally {
      setIsSyncing(false)
    }
  }

  const cleanupOrphans = async () => {
    if (!confirm('Remove orphaned anti-portfolio entries that don\'t match any real positions?')) {
      return
    }

    try {
      setIsLoading(true)
      const response = await fetch("/api/cleanup-anti-portfolio", {
        method: "POST"
      })
      const data = await response.json()
      if (data.success) {
        alert(`Cleanup complete: Deleted ${data.deleted} orphaned entries`)
        await fetchRejections()
      }
    } catch (err) {
      console.error("Cleanup failed:", err)
      alert("Cleanup failed")
    } finally {
      setIsLoading(false)
    }
  }

  const updateNextDayPerformance = async () => {
    try {
      setIsUpdatingPerformance(true)
      setPerformanceResult(null)
      const response = await fetch("/api/update-closed-position-performance", {
        method: "POST"
      })
      const data = await response.json()
      if (data.success) {
        setPerformanceResult({
          updated: data.updated,
          skipped: data.skipped,
          errors: data.errors,
          errorDetails: data.errorDetails
        })
        await fetchRejections() // Refresh to show updated performance data
      }
    } catch (err) {
      console.error("Performance update failed:", err)
    } finally {
      setIsUpdatingPerformance(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <p className="mt-4 text-sm text-muted-foreground">Loading Anti-Portfolio...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <>
      <Navigation userEmail={user.email} />
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Brain className="h-8 w-8 text-primary" />
              Anti-Portfolio
            </h1>
            <p className="text-muted-foreground mt-1">
              Track opportunities you manually rejected — learn from the ones you passed on
            </p>
            <p className="text-xs text-muted-foreground mt-1 italic">
              Note: This shows only opportunities you rejected, not what the scanner filtered internally
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchRejections} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={runBackfill} disabled={isBackfilling}>
              {isBackfilling ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Backfilling...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Import Old Trades
                </>
              )}
            </Button>
            <Button variant="outline" onClick={syncAntiPortfolio} disabled={isSyncing}>
              {isSyncing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync P&L
                </>
              )}
            </Button>
            <Button variant="outline" onClick={updateNextDayPerformance} disabled={isUpdatingPerformance}>
              {isUpdatingPerformance ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Update Prices
                </>
              )}
            </Button>
            <Button onClick={runAnalysis} disabled={isAnalyzing || rejections.length === 0}>
              {isAnalyzing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Analyze Performance
                </>
              )}
            </Button>
          </div>
        </div>

        {backfillResult && (
          <Card className="modern-card mb-6 border-emerald-500/20 bg-emerald-500/5">
            <CardHeader>
              <CardTitle className="text-emerald-400">Backfill Complete</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-6 text-sm mb-4">
                <div>
                  <span className="text-muted-foreground">Imported:</span>
                  <span className="ml-2 font-bold text-emerald-400">{backfillResult.backfilled}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Skipped:</span>
                  <span className="ml-2 font-bold">{backfillResult.skipped}</span>
                </div>
                {backfillResult.errors > 0 && (
                  <div>
                    <span className="text-muted-foreground">Errors:</span>
                    <span className="ml-2 font-bold text-red-400">{backfillResult.errors}</span>
                  </div>
                )}
              </div>
              {backfillResult.errorDetails && backfillResult.errorDetails.length > 0 && (
                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                    <span className="text-sm font-semibold text-red-400">Error Details</span>
                  </div>
                  <div className="space-y-2">
                    {backfillResult.errorDetails.map((err, idx) => (
                      <div key={idx} className="text-xs font-mono">
                        <span className="text-red-300">{err.symbol}:</span>{' '}
                        <span className="text-muted-foreground">{err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {syncResult && (
          <Card className="modern-card mb-6 border-blue-500/20 bg-blue-500/5">
            <CardHeader>
              <CardTitle className="text-blue-400">P&L Sync Complete</CardTitle>
              <CardDescription>Anti-Portfolio P&L values synced with closed positions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-6 text-sm mb-4">
                <div>
                  <span className="text-muted-foreground">Updated:</span>
                  <span className="ml-2 font-bold text-blue-400">{syncResult.updated}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Already in sync:</span>
                  <span className="ml-2 font-bold">{syncResult.skipped}</span>
                </div>
                {syncResult.errors > 0 && (
                  <div>
                    <span className="text-muted-foreground">Errors:</span>
                    <span className="ml-2 font-bold text-red-400">{syncResult.errors}</span>
                  </div>
                )}
              </div>
              {syncResult.errorDetails && syncResult.errorDetails.length > 0 && (
                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                    <span className="text-sm font-semibold text-red-400">Error Details</span>
                  </div>
                  <div className="space-y-2">
                    {syncResult.errorDetails.map((err, idx) => (
                      <div key={idx} className="text-xs font-mono">
                        <span className="text-red-300">{err.symbol}:</span>{' '}
                        <span className="text-muted-foreground">{err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {analysis && analysis.ai_summary && (
          <Card className="modern-card mb-6">
            <CardHeader>
              <CardTitle>AI Debrief</CardTitle>
              <CardDescription>Key takeaways from profitable rejections</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 whitespace-pre-line text-foreground">
                {analysis.ai_summary}
              </p>
            </CardContent>
          </Card>
        )}

        {analysis && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="modern-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Rejected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analysis.total_rejections}</div>
                <p className="text-xs text-muted-foreground mt-1">Last 7 days</p>
              </CardContent>
            </Card>

            <Card className="modern-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Became Profitable</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-bull">{analysis.profitable_count}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {(analysis.profitable_rate * 100).toFixed(1)}% miss rate
                </p>
              </CardContent>
            </Card>

            <Card className="modern-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Change</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${analysis.avg_change_percent > 0 ? "text-bull" : "text-bear"}`}>
                  {analysis.avg_change_percent > 0 ? "+" : ""}
                  {analysis.avg_change_percent.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">Next day performance</p>
              </CardContent>
            </Card>

            <Card className="modern-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Top Miss Reason</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-semibold truncate">
                  {Object.entries(analysis.rejection_reason_stats || {})
                    .sort(([, a], [, b]) => b.profitable_rate - a.profitable_rate)[0]?.[0] || "N/A"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Highest profitable rate</p>
              </CardContent>
            </Card>
          </div>
        )}

        {analysis && analysis.recommendations.length > 0 && (
          <Card className="modern-card mb-6">
            <CardHeader>
              <CardTitle>Filter Tuning Ideas</CardTitle>
              <CardDescription>Suggestions based on recent rejection outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                {analysis.recommendations.map((recommendation, idx) => (
                  <li key={idx} className="text-foreground">{recommendation}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {analysis && analysis.missed_opportunities.length > 0 && (
          <Card className="modern-card mb-6">
            <CardHeader>
              <CardTitle>Recent Missed Opportunities</CardTitle>
              <CardDescription>Top profitable rejections from the analysis window</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Symbol</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Details</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Profit</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.missed_opportunities.slice(0, 5).map((miss, idx) => {
                      const profitPercent = typeof miss.profit_percent === "number"
                        ? miss.profit_percent
                        : miss.option.price_change_percent ?? 0
                      const strikeDisplay = typeof miss.option.strike === "number"
                        ? miss.option.strike.toFixed(2)
                        : String(miss.option.strike)
                      const expirationDisplay = miss.option.expiration
                        ? new Date(miss.option.expiration).toLocaleDateString()
                        : "N/A"
                      return (
                        <tr
                          key={`${miss.option.symbol}-${miss.option.strike}-${idx}`}
                          className="border-b hover:bg-muted/50"
                        >
                          <td className="p-3 font-semibold font-mono">{miss.option.symbol}</td>
                          <td className="p-3 text-sm">
                            <div className="font-medium text-foreground">
                              {miss.option.option_type.toUpperCase()} ${strikeDisplay} exp {expirationDisplay}
                            </div>
                            <div className="text-muted-foreground text-xs mt-1">
                              Rejected for: {miss.option.rejection_reason}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {miss.what_we_missed || "—"}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-4 w-4 text-bull" />
                              <span className="font-mono text-sm text-bull">
                                +{profitPercent.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {miss.pattern_tags.length > 0 ? miss.pattern_tags.join(", ") : "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Closed Positions Section */}
        <Card className="modern-card border-amber-200 dark:border-amber-800 mb-6">
          <CardHeader>
            <CardTitle>
              Closed Too Soon
            </CardTitle>
            <CardDescription>
              Positions you closed before expiration - track what you missed
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeClosedPositions.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No early exits currently being tracked. Once a contract expires it moves into history for {CLOSED_HISTORY_DAYS} days so you can still review the outcome.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Symbol</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Type</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Strike</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Days Left</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">You Made</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                        <div className="flex items-center gap-1">
                          If Held
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3 w-3" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">Price change since you closed</p>
                                <p className="text-xs text-muted-foreground">Green = gained value (closed early)</p>
                                <p className="text-xs text-muted-foreground">Red = lost value (good close)</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Closed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeClosedPositions
                      .slice(0, 20)
                      .map((rej, idx) => (
                        <tr key={idx} className="border-b hover:bg-muted/50">
                          <td className="p-3">
                            <span className="font-mono font-semibold">{rej.symbol}</span>
                          </td>
                          <td className="p-3">
                            <Badge variant={rej.option_type === "call" ? "default" : "secondary"}>
                              {rej.option_type.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="p-3 font-mono">${rej.strike.toFixed(2)}</td>
                          <td className="p-3">
                            <span className={`font-semibold ${(rej.days_until_expiration || 0) > 7 ? 'text-amber-600' : 'text-slate-600'}`}>
                              {rej.days_until_expiration || 0}d
                            </span>
                          </td>
                          <td className="p-3">
                            <div className={`font-mono text-sm ${(rej.realized_pl || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              ${(rej.realized_pl || 0).toFixed(0)}
                              <span className="text-xs ml-1">
                                ({(rej.realized_pl_percent || 0) > 0 ? '+' : ''}{(rej.realized_pl_percent || 0).toFixed(0)}%)
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            {rej.price_change_percent !== null ? (
                              <div className="flex items-center gap-1">
                                {rej.price_change_percent > 0 ? (
                                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                                ) : (
                                  <TrendingDown className="h-4 w-4 text-red-600" />
                                )}
                                <span className={`font-mono text-sm ${rej.price_change_percent > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  {rej.price_change_percent > 0 ? "+" : ""}
                                  {rej.price_change_percent.toFixed(1)}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {(() => {
                                  const closedDate = new Date(rej.rejected_at)
                                  const today = new Date()
                                  closedDate.setHours(0, 0, 0, 0)
                                  today.setHours(0, 0, 0, 0)
                                  return closedDate.getTime() === today.getTime()
                                    ? 'Tracking starts tomorrow'
                                    : 'Tracking...'
                                })()}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {new Date(rej.rejected_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {historicalClosedPositions.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Recent History (last {CLOSED_HISTORY_DAYS} days)
                </h3>
                <div className="overflow-x-auto mt-3">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground">Symbol</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground">Strike</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground">You Made</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground">If Held</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground">Closed</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground">Expired</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicalClosedPositions
                        .slice(0, 30)
                        .map((rej, idx) => (
                          <tr key={`history-${idx}`} className="border-b hover:bg-muted/50">
                            <td className="p-3">
                              <span className="font-mono font-semibold">{rej.symbol}</span>
                            </td>
                            <td className="p-3">
                              <Badge variant={rej.option_type === "call" ? "default" : "secondary"}>
                                {rej.option_type.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="p-3 font-mono">${rej.strike.toFixed(2)}</td>
                            <td className="p-3">
                              <div className={`font-mono text-sm ${(rej.realized_pl || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                ${(rej.realized_pl || 0).toFixed(0)}
                                <span className="text-xs ml-1">
                                  ({(rej.realized_pl_percent || 0) > 0 ? '+' : ''}{(rej.realized_pl_percent || 0).toFixed(0)}%)
                                </span>
                              </div>
                            </td>
                            <td className="p-3">
                              {rej.price_change_percent !== null ? (
                                <div className="flex items-center gap-1">
                                  {rej.price_change_percent > 0 ? (
                                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                                  ) : (
                                    <TrendingDown className="h-4 w-4 text-red-600" />
                                  )}
                                  <span className={`font-mono text-sm ${rej.price_change_percent > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                    {rej.price_change_percent > 0 ? "+" : ""}
                                    {rej.price_change_percent.toFixed(1)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">n/a</span>
                              )}
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {new Date(rej.rejected_at).toLocaleDateString()}
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {new Date(rej.expiration).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="modern-card">
          <CardHeader>
            <CardTitle>
              Rejected Opportunities
            </CardTitle>
            <CardDescription>
              {manualRejections.length} opportunities you manually rejected in the scanner - track if you made the right call
            </CardDescription>
          </CardHeader>
          <CardContent>
            {manualRejections.length === 0 ? (
              <div className="text-center py-12">
                <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">No manually rejected options found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  When you reject opportunities in the scanner, they&apos;ll appear here
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Symbol</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Type</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Strike</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Why Rejected</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">If Held</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Rejected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualRejections
                      .slice(0, 50)
                      .map((rej, idx) => (
                      <tr key={idx} className="border-b hover:bg-muted/50">
                        <td className="p-3">
                          <span className="font-mono font-semibold">{rej.symbol}</span>
                        </td>
                        <td className="p-3">
                          <Badge variant={rej.option_type === "call" ? "default" : "secondary"}>
                            {rej.option_type.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono">${rej.strike.toFixed(2)}</td>
                        <td className="p-3 text-sm text-muted-foreground align-top max-w-xs">
                          <div className="font-medium text-foreground">
                            {rej.rejection_reason}
                          </div>
                          {rej.user_notes && (
                            <p className="mt-1 text-xs italic text-muted-foreground">
                              “{rej.user_notes}”
                            </p>
                          )}
                        </td>
                        <td className="p-3">
                          {rej.price_change_percent !== null ? (
                            <div className="flex items-center gap-1">
                              {rej.price_change_percent > 0 ? (
                                <TrendingUp className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-red-600" />
                              )}
                              <span className={`font-mono text-sm ${rej.price_change_percent > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {rej.price_change_percent > 0 ? "+" : ""}
                                {rej.price_change_percent.toFixed(1)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Tracking...</span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(rej.rejected_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  )
}
