'use client'

import { useState, useEffect } from "react"
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
  option_price: number
  volume: number
  open_interest: number
  next_day_price: number | null
  price_change_percent: number | null
  was_profitable: boolean | null
}

interface AnalysisResult {
  total_rejections: number
  analyzed_count: number
  profitable_count: number
  profitable_rate: number
  avg_change_percent: number
  missed_opportunities: any[]
  rejection_reason_stats: Record<string, any>
  filter_stage_stats: Record<string, any>
}

export default function RejectionLearningPage() {
  const [rejections, setRejections] = useState<RejectedOption[]>([])
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  useEffect(() => {
    fetchRejections()
  }, [])

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
        body: JSON.stringify({ daysBack: 7, minProfitPercent: 10 })
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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Brain className="h-8 w-8 text-primary" />
              Rejection Learning Lab
            </h1>
            <p className="text-muted-foreground mt-1">
              Analyze rejected options to improve your filters and reduce missed opportunities
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

        {analysis && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Rejected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analysis.total_rejections}</div>
                <p className="text-xs text-muted-foreground mt-1">Last 7 days</p>
              </CardContent>
            </Card>

            <Card>
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

            <Card>
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

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Top Miss Reason</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-semibold truncate">
                  {Object.entries(analysis.rejection_reason_stats || {})
                    .sort(([, a]: any, [, b]: any) => b.profitable_rate - a.profitable_rate)[0]?.[0] || "N/A"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Highest profitable rate</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
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
  )
}
