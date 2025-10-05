"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react"

interface NewsItem {
  id: string
  headline: string
  summary: string
  source: string
  url: string
  datetime: number
  related: string[]
  sentiment: {
    label: "bullish" | "bearish" | "neutral"
    score: number
  }
}

export function LiveNewsFeed() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchNews = async () => {
    try {
      setIsLoading(true)
      setError(false)
      const response = await fetch("/api/news-python")
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setNews(data.news || [])
    } catch (err) {
      console.error("[v0] Error fetching news:", err)
      setError(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchNews()
    const interval = setInterval(fetchNews, 120000) // 2 minutes
    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="border-card-border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Live Market News</CardTitle>
            <CardDescription>Real-time headlines with sentiment analysis</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchNews} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {isLoading && news.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
              <p className="text-sm text-destructive">Failed to load news</p>
            </div>
          ) : (
            news.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-card-border bg-background p-3 transition-colors hover:border-primary/50"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 pt-1">
                    {item.sentiment.label === "bullish" ? (
                      <TrendingUp className="h-5 w-5 text-bull" />
                    ) : item.sentiment.label === "bearish" ? (
                      <TrendingDown className="h-5 w-5 text-bear" />
                    ) : (
                      <Minus className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold leading-tight text-foreground">{item.headline}</h4>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-muted-foreground transition-colors hover:text-primary"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.summary}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {item.source}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.datetime * 1000).toLocaleTimeString()}
                      </span>
                      {item.related.length > 0 && (
                        <div className="flex gap-1">
                          {item.related.slice(0, 3).map((symbol) => (
                            <Badge key={symbol} variant="secondary" className="text-xs font-mono">
                              {symbol}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
