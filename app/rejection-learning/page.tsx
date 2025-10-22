'use client'

import { useState, useEffect, useMemo } from "react"
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, RefreshCw, Brain, AlertTriangle } from "lucide-react"

interface RejectedOption {
  symbol: string
  strike: number
  expiration: string
  option_type: string
  rejection_reason: string
  filter_stage: string
  rejected_at: string
  stock_price?: number
  option_price: number
  volume: number
  open_interest: number
  next_day_price: number | null
  price_change_percent: number | null
  was_profitable: boolean | null
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

export default function RejectionLearningPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [rejections, setRejections] = useState<RejectedOption[]>([])
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

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
      const response = await fetch("/api/rejection-analysis")
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

        <Card className="modern-card">
          <CardHeader>
            <CardTitle>Rejected Options</CardTitle>
            <CardDescription>
              {rejections.length} options rejected in the last 7 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rejections.length === 0 ? (
              <div className="text-center py-12">
                <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">No rejected options found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Run a scan to start collecting rejection data
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
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Rejection Reason</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Performance</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Rejected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejections.slice(0, 50).map((rej, idx) => (
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
                        <td className="p-3 text-sm text-muted-foreground truncate max-w-xs">
                          {rej.rejection_reason}
                        </td>
                        <td className="p-3">
                          {rej.price_change_percent !== null ? (
                            <div className="flex items-center gap-1">
                              {rej.was_profitable ? (
                                <TrendingUp className="h-4 w-4 text-bull" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-bear" />
                              )}
                              <span className={`font-mono text-sm ${rej.was_profitable ? "text-bull" : "text-bear"}`}>
                                {rej.price_change_percent > 0 ? "+" : ""}
                                {rej.price_change_percent.toFixed(1)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not analyzed</span>
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
