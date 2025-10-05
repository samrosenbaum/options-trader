"use client"

import { Card } from "@/components/ui/card"
import { mockMarketData } from "@/lib/mock-data"
import { TrendingUp, TrendingDown } from "lucide-react"

export function MarketOverview() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {mockMarketData.map((stock) => (
        <Card key={stock.symbol} className="bg-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-sm text-muted-foreground">{stock.symbol}</p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground">${stock.price.toFixed(2)}</p>
            </div>
            {stock.change >= 0 ? (
              <TrendingUp className="h-5 w-5 text-bull" />
            ) : (
              <TrendingDown className="h-5 w-5 text-bear" />
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className={`font-mono text-sm font-semibold ${stock.change >= 0 ? "text-bull" : "text-bear"}`}>
              {stock.change >= 0 ? "+" : ""}
              {stock.change.toFixed(2)}
            </span>
            <span className={`font-mono text-sm ${stock.change >= 0 ? "text-bull" : "text-bear"}`}>
              ({stock.changePercent >= 0 ? "+" : ""}
              {stock.changePercent.toFixed(2)}%)
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Volume</p>
              <p className="font-mono text-foreground">{(stock.volume / 1000000).toFixed(1)}M</p>
            </div>
            <div>
              <p className="text-muted-foreground">High/Low</p>
              <p className="font-mono text-foreground">
                {stock.high.toFixed(2)}/{stock.low.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
