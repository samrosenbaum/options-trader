"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { mockRecommendations } from "@/lib/mock-data"
import { TrendingUp, AlertTriangle, Clock, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

export function TradeRecommendations() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">AI Trading Recommendations</h3>
          <p className="text-sm text-muted-foreground">
            Intelligent trade suggestions based on market data and sentiment analysis
          </p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Zap className="mr-2 h-4 w-4" />
          Generate New
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {mockRecommendations.map((rec) => (
          <Card key={rec.id} className="bg-card p-5 hover:bg-card/80 transition-colors">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <span className="font-mono text-sm font-bold text-primary">{rec.option.symbol}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-mono font-bold text-foreground">{rec.option.symbol}</h4>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        rec.option.type === "call" ? "border-bull text-bull" : "border-bear text-bear",
                      )}
                    >
                      {rec.option.type.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ${rec.option.strike} • {new Date(rec.option.expiration).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      rec.score >= 80 && "bg-bull",
                      rec.score >= 60 && rec.score < 80 && "bg-primary",
                      rec.score < 60 && "bg-muted-foreground",
                    )}
                  />
                  <span className="font-mono text-sm font-bold text-foreground">{rec.score.toFixed(0)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Score</p>
              </div>
            </div>

            {/* Market Data */}
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-muted/30 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Current Price</p>
                <p className="font-mono text-sm font-semibold text-foreground">${rec.marketData.price.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Change</p>
                <p
                  className={cn(
                    "font-mono text-sm font-semibold",
                    rec.marketData.change >= 0 ? "text-bull" : "text-bear",
                  )}
                >
                  {rec.marketData.change >= 0 ? "+" : ""}
                  {rec.marketData.changePercent.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Premium</p>
                <p className="font-mono text-sm font-semibold text-foreground">${rec.option.premium.toFixed(2)}</p>
              </div>
            </div>

            {/* Risk & Timeframe Badges */}
            <div className="mt-4 flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  rec.riskLevel === "low" && "border-bull text-bull",
                  rec.riskLevel === "medium" && "border-primary text-primary",
                  rec.riskLevel === "high" && "border-bear text-bear",
                )}
              >
                <AlertTriangle className="mr-1 h-3 w-3" />
                {rec.riskLevel.toUpperCase()} RISK
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Clock className="mr-1 h-3 w-3" />
                {rec.timeframe.toUpperCase()} TERM
              </Badge>
              <Badge variant="outline" className="text-xs">
                <TrendingUp className="mr-1 h-3 w-3" />
                {rec.option.action.toUpperCase()}
              </Badge>
            </div>

            {/* Reasoning */}
            <div className="mt-4">
              <p className="text-sm text-foreground leading-relaxed">{rec.option.reasoning}</p>
            </div>

            {/* Catalysts */}
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Key Catalysts</p>
              <div className="flex flex-wrap gap-2">
                {rec.catalysts.map((catalyst, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {catalyst}
                  </Badge>
                ))}
              </div>
            </div>

            {/* News Context */}
            {rec.newsContext.length > 0 && (
              <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Related News</p>
                <div className="space-y-2">
                  {rec.newsContext.slice(0, 2).map((news) => (
                    <div key={news.id} className="flex items-start gap-2">
                      <div
                        className={cn(
                          "mt-0.5 h-1.5 w-1.5 rounded-full flex-shrink-0",
                          news.sentiment === "bullish" && "bg-bull",
                          news.sentiment === "bearish" && "bg-bear",
                          news.sentiment === "neutral" && "bg-muted-foreground",
                        )}
                      />
                      <p className="text-xs text-foreground leading-relaxed">{news.headline}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Button */}
            <Button className="mt-4 w-full bg-primary text-primary-foreground hover:bg-primary/90">
              Analyze Trade
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
