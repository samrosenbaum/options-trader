"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { mockOptions } from "@/lib/mock-data"
import { TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function OptionsScanner() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Live Options Scanner</h3>
          <p className="text-sm text-muted-foreground">High-potential derivative trades updated in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            Filters
          </Button>
          <Button variant="outline" size="sm">
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {mockOptions.map((option) => (
          <Card key={option.id} className="bg-card p-4 hover:bg-card/80 transition-colors">
            <div className="flex items-start justify-between gap-4">
              {/* Left Section - Symbol & Type */}
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <span className="font-mono text-lg font-bold text-primary">{option.symbol.slice(0, 2)}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-mono text-lg font-bold text-foreground">{option.symbol}</h4>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-xs",
                        option.type === "call" ? "border-bull text-bull" : "border-bear text-bear",
                      )}
                    >
                      {option.type.toUpperCase()}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-xs",
                        option.action === "buy" ? "border-primary text-primary" : "border-muted-foreground",
                      )}
                    >
                      {option.action.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="font-mono">Strike: ${option.strike}</span>
                    <span>•</span>
                    <span className="font-mono">Exp: {new Date(option.expiration).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="font-mono">Premium: ${option.premium}</span>
                  </div>
                </div>
              </div>

              {/* Right Section - Recommendation */}
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {option.recommendation === "strong_buy" || option.recommendation === "buy" ? (
                      <TrendingUp className="h-4 w-4 text-bull" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-bear" />
                    )}
                    <span
                      className={cn(
                        "font-mono text-sm font-semibold uppercase",
                        (option.recommendation === "strong_buy" || option.recommendation === "buy") && "text-bull",
                        option.recommendation === "hold" && "text-muted-foreground",
                        (option.recommendation === "sell" || option.recommendation === "strong_sell") && "text-bear",
                      )}
                    >
                      {option.recommendation.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Contract Cost: {currencyFormatter.format(option.premium * 100)}
                  </div>
                </div>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  View Details
                </Button>
              </div>
            </div>

            {/* Greeks Section */}
            <div className="mt-4 grid grid-cols-5 gap-4 border-t border-border pt-4">
              <div>
                <p className="text-xs text-muted-foreground">Delta</p>
                <p className="font-mono text-sm font-semibold text-foreground">{option.delta.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gamma</p>
                <p className="font-mono text-sm font-semibold text-foreground">{option.gamma.toFixed(3)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Theta</p>
                <p className="font-mono text-sm font-semibold text-foreground">{option.theta.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vega</p>
                <p className="font-mono text-sm font-semibold text-foreground">{option.vega.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">IV</p>
                <p className="font-mono text-sm font-semibold text-foreground">
                  {(option.impliedVolatility * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Reasoning Section */}
            <div className="mt-4 rounded-lg bg-muted/50 p-3">
              <p className="text-sm text-foreground">{option.reasoning}</p>
            </div>

            {/* Risk Metrics */}
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Max Profit</p>
                <p className="font-mono text-sm font-semibold text-bull">
                  {option.maxProfit === Number.POSITIVE_INFINITY ? "Unlimited" : `$${option.maxProfit.toFixed(0)}`}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Max Loss</p>
                <p className="font-mono text-sm font-semibold text-bear">${option.maxLoss.toFixed(0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Breakeven</p>
                <p className="font-mono text-sm font-semibold text-foreground">${option.breakeven.toFixed(2)}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
