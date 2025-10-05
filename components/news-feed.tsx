"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { mockNews } from "@/lib/mock-data"
import { TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

function formatTimeAgo(timestamp: string) {
  const now = new Date()
  const time = new Date(timestamp)
  const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60))

  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`
  } else if (diffInMinutes < 1440) {
    return `${Math.floor(diffInMinutes / 60)}h ago`
  } else {
    return `${Math.floor(diffInMinutes / 1440)}d ago`
  }
}

export function NewsFeed() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Market News & Sentiment</h3>
          <p className="text-sm text-muted-foreground">Real-time headlines with AI-powered sentiment analysis</p>
        </div>
      </div>

      <div className="grid gap-4">
        {mockNews.map((news) => (
          <Card key={news.id} className="bg-card p-4 hover:bg-card/80 transition-colors">
            <div className="flex items-start gap-4">
              {/* Sentiment Indicator */}
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-lg",
                  news.sentiment === "bullish" && "bg-bull/10",
                  news.sentiment === "bearish" && "bg-bear/10",
                  news.sentiment === "neutral" && "bg-muted",
                )}
              >
                {news.sentiment === "bullish" && <TrendingUp className="h-6 w-6 text-bull" />}
                {news.sentiment === "bearish" && <TrendingDown className="h-6 w-6 text-bear" />}
                {news.sentiment === "neutral" && <Minus className="h-6 w-6 text-muted-foreground" />}
              </div>

              {/* Content */}
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-foreground leading-snug">{news.headline}</h4>
                    <p className="mt-2 text-sm text-muted-foreground">{news.summary}</p>
                  </div>
                  <a
                    href={news.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>

                {/* Metadata */}
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-medium">{news.source}</span>
                  <span>•</span>
                  <span className="font-mono">{formatTimeAgo(news.timestamp)}</span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    {news.symbols.map((symbol) => (
                      <Badge key={symbol} variant="outline" className="font-mono text-xs">
                        {symbol}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Sentiment Score */}
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Sentiment Score</span>
                      <span
                        className={cn(
                          "font-mono font-semibold",
                          news.sentimentScore > 0 && "text-bull",
                          news.sentimentScore < 0 && "text-bear",
                          news.sentimentScore === 0 && "text-muted-foreground",
                        )}
                      >
                        {news.sentimentScore > 0 ? "+" : ""}
                        {news.sentimentScore.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all",
                          news.sentimentScore > 0 && "bg-bull",
                          news.sentimentScore < 0 && "bg-bear",
                          news.sentimentScore === 0 && "bg-muted-foreground",
                        )}
                        style={{
                          width: `${Math.abs(news.sentimentScore) * 100}%`,
                          marginLeft: news.sentimentScore < 0 ? `${100 - Math.abs(news.sentimentScore) * 100}%` : "0",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
