"use client"

import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"
import { Calculator, TrendingUp, TrendingDown, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export function OptionsCalculator() {
  const [optionType, setOptionType] = useState<"call" | "put">("call")
  const [action, setAction] = useState<"buy" | "sell">("buy")
  const [stockPrice, setStockPrice] = useState("100")
  const [strikePrice, setStrikePrice] = useState("105")
  const [premium, setPremium] = useState("3.50")
  const [contracts, setContracts] = useState("1")

  const calculateMetrics = () => {
    const stock = Number.parseFloat(stockPrice) || 0
    const strike = Number.parseFloat(strikePrice) || 0
    const prem = Number.parseFloat(premium) || 0
    const numContracts = Number.parseInt(contracts) || 1

    const totalCost = prem * 100 * numContracts
    const breakeven =
      action === "buy"
        ? optionType === "call"
          ? strike + prem
          : strike - prem
        : optionType === "call"
          ? strike + prem
          : strike - prem

    const maxProfit =
      action === "buy"
        ? optionType === "call"
          ? Number.POSITIVE_INFINITY
          : (strike - prem) * 100 * numContracts
        : prem * 100 * numContracts

    const maxLoss =
      action === "buy"
        ? totalCost
        : optionType === "call"
          ? Number.POSITIVE_INFINITY
          : (strike - prem) * 100 * numContracts

    const profitAt10Percent = stock * 1.1
    const profitAt10 =
      action === "buy"
        ? optionType === "call"
          ? Math.max(0, (profitAt10Percent - strike) * 100 * numContracts - totalCost)
          : Math.max(0, (strike - profitAt10Percent) * 100 * numContracts - totalCost)
        : 0

    const riskRewardRatio = maxLoss > 0 && maxProfit !== Number.POSITIVE_INFINITY ? maxProfit / maxLoss : 0

    return {
      totalCost,
      breakeven,
      maxProfit,
      maxLoss,
      profitAt10,
      riskRewardRatio,
    }
  }

  const metrics = calculateMetrics()

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Options Calculator</h3>
        <p className="text-sm text-muted-foreground">Calculate potential returns and risk metrics for your trades</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Section */}
        <Card className="bg-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <Calculator className="h-5 w-5 text-primary" />
            <h4 className="font-semibold text-foreground">Trade Parameters</h4>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="option-type" className="text-foreground">
                  Option Type
                </Label>
                <Select value={optionType} onValueChange={(value: "call" | "put") => setOptionType(value)}>
                  <SelectTrigger id="option-type" className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="put">Put</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="action" className="text-foreground">
                  Action
                </Label>
                <Select value={action} onValueChange={(value: "buy" | "sell") => setAction(value)}>
                  <SelectTrigger id="action" className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stock-price" className="text-foreground">
                Current Stock Price
              </Label>
              <Input
                id="stock-price"
                type="number"
                value={stockPrice}
                onChange={(e) => setStockPrice(e.target.value)}
                className="bg-background font-mono"
                placeholder="100.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="strike-price" className="text-foreground">
                Strike Price
              </Label>
              <Input
                id="strike-price"
                type="number"
                value={strikePrice}
                onChange={(e) => setStrikePrice(e.target.value)}
                className="bg-background font-mono"
                placeholder="105.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="premium" className="text-foreground">
                Premium per Share
              </Label>
              <Input
                id="premium"
                type="number"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
                className="bg-background font-mono"
                placeholder="3.50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contracts" className="text-foreground">
                Number of Contracts
              </Label>
              <Input
                id="contracts"
                type="number"
                value={contracts}
                onChange={(e) => setContracts(e.target.value)}
                className="bg-background font-mono"
                placeholder="1"
              />
            </div>

            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              <Calculator className="mr-2 h-4 w-4" />
              Calculate
            </Button>
          </div>
        </Card>

        {/* Results Section */}
        <div className="space-y-4">
          {/* Cost Analysis */}
          <Card className="bg-card p-6">
            <h4 className="font-semibold text-foreground mb-4">Cost Analysis</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Cost</span>
                <span className="font-mono text-lg font-bold text-foreground">${metrics.totalCost.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Breakeven Price</span>
                <span className="font-mono text-lg font-bold text-foreground">${metrics.breakeven.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Cost per Contract</span>
                <span className="font-mono text-sm font-semibold text-foreground">
                  ${(metrics.totalCost / Number.parseInt(contracts || "1")).toFixed(2)}
                </span>
              </div>
            </div>
          </Card>

          {/* Profit/Loss Potential */}
          <Card className="bg-card p-6">
            <h4 className="font-semibold text-foreground mb-4">Profit/Loss Potential</h4>
            <div className="space-y-4">
              <div className="rounded-lg bg-bull/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-bull" />
                  <span className="text-sm font-medium text-bull">Maximum Profit</span>
                </div>
                <p className="font-mono text-2xl font-bold text-bull">
                  {metrics.maxProfit === Number.POSITIVE_INFINITY ? "Unlimited" : `$${metrics.maxProfit.toFixed(2)}`}
                </p>
              </div>

              <div className="rounded-lg bg-bear/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-4 w-4 text-bear" />
                  <span className="text-sm font-medium text-bear">Maximum Loss</span>
                </div>
                <p className="font-mono text-2xl font-bold text-bear">
                  {metrics.maxLoss === Number.POSITIVE_INFINITY ? "Unlimited" : `$${metrics.maxLoss.toFixed(2)}`}
                </p>
              </div>

              <div className="rounded-lg bg-primary/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">Profit at +10% Move</span>
                </div>
                <p className="font-mono text-2xl font-bold text-primary">${metrics.profitAt10.toFixed(2)}</p>
              </div>
            </div>
          </Card>

          {/* Risk Metrics */}
          <Card className="bg-card p-6">
            <h4 className="font-semibold text-foreground mb-4">Risk Metrics</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Risk/Reward Ratio</span>
                <span
                  className={cn(
                    "font-mono text-lg font-bold",
                    metrics.riskRewardRatio > 2 && "text-bull",
                    metrics.riskRewardRatio >= 1 && metrics.riskRewardRatio <= 2 && "text-primary",
                    metrics.riskRewardRatio < 1 && metrics.riskRewardRatio > 0 && "text-bear",
                  )}
                >
                  {metrics.riskRewardRatio > 0 ? `1:${metrics.riskRewardRatio.toFixed(2)}` : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Risk Level</span>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    metrics.maxLoss > 1000 && "text-bear",
                    metrics.maxLoss >= 500 && metrics.maxLoss <= 1000 && "text-primary",
                    metrics.maxLoss < 500 && "text-bull",
                  )}
                >
                  {metrics.maxLoss === Number.POSITIVE_INFINITY
                    ? "UNLIMITED"
                    : metrics.maxLoss > 1000
                      ? "HIGH"
                      : metrics.maxLoss >= 500
                        ? "MEDIUM"
                        : "LOW"}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
