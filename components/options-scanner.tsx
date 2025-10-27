"use client"

import { useMemo } from "react"
import { useState } from "react"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { mockMarketData, mockOptions } from "@/lib/mock-data"
import type { MarketData, OptionContract } from "@/lib/types"
import { TrendingUp, TrendingDown, Minus, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const sentimentMeta = {
  bullish: {
    label: "Bullish setup",
    badgeClass: "border-bull text-bull bg-bull/10",
    icon: TrendingUp,
    tone: "Looks for the stock to push higher",
  },
  bearish: {
    label: "Bearish setup",
    badgeClass: "border-bear text-bear bg-bear/10",
    icon: TrendingDown,
    tone: "Leans toward further downside",
  },
  neutral: {
    label: "Neutral setup",
    badgeClass: "border-muted-foreground text-muted-foreground bg-muted/40",
    icon: Minus,
    tone: "Expecting a range-bound move",
  },
} as const

const greekNotes: Record<
  keyof Pick<OptionContract, "delta" | "gamma" | "theta" | "vega">,
  { title: string; helper: string }
> = {
  delta: {
    title: "Delta",
    helper: "How much the option moves if the stock changes by $1.",
  },
  gamma: {
    title: "Gamma",
    helper: "How quickly delta itself can change as the stock moves.",
  },
  theta: {
    title: "Theta",
    helper: "Daily time decay — what you pay to hold the contract.",
  },
  vega: {
    title: "Vega",
    helper: "Sensitivity to volatility. Higher vega likes bigger swings.",
  },
}

const confidenceLabels = [
  { min: 0.8, label: "High conviction" },
  { min: 0.6, label: "Confident" },
  { min: 0.4, label: "Worth watching" },
  { min: 0, label: "Speculative" },
]

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function formatPercent(value: number, withSign = true) {
  const sign = withSign && value > 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

function getBreakevenMove(option: OptionContract, currentPrice: number) {
  if (!currentPrice) return 0
  const rawMove =
    option.type === "call"
      ? (option.breakeven - currentPrice) / currentPrice
      : (currentPrice - option.breakeven) / currentPrice
  return rawMove * 100
}

function getConfidenceText(confidence: number) {
  const entry = confidenceLabels.find((item) => confidence >= item.min)
  return entry?.label ?? "Speculative"
}

function getVolumeComment(option: OptionContract) {
  if (!option.openInterest) return "Watching flow build today."
  const ratio = option.volume / option.openInterest
  if (ratio >= 1) return "Today’s flow is outpacing existing open interest."
  if (ratio >= 0.5) return "Healthy volume supporting the idea."
  return "Volume is lighter than usual — size positions carefully."
}

function formatExpiration(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function getDaysToExpiration(dateString: string) {
  const now = new Date()
  const expDate = new Date(dateString)
  const diffTime = expDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

function SimpleMetric({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  )
}

export function OptionsScanner() {
  const marketDataMap = useMemo(
    () => Object.fromEntries(mockMarketData.map((data) => [data.symbol, data])),
    [],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Live Options Scanner</h3>
          <p className="text-sm text-muted-foreground">
            Monty translates the raw scan into the next steps you can act on right now.
          </p>
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
          <OptionIdea key={option.id} option={option} marketData={marketDataMap[option.symbol]} />
        ))}
      </div>
    </div>
  )
}

function OptionIdea({ option, marketData }: { option: OptionContract; marketData?: MarketData }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const sentiment = option.marketSentiment
  const sentimentInfo = sentiment ? sentimentMeta[sentiment.direction] : undefined
  const currentPrice = marketData?.price ?? option.strike
  const breakevenMove = getBreakevenMove(option, currentPrice)
  const premiumCost = option.premium * 100
  const riskPerContract = option.maxLoss === Number.POSITIVE_INFINITY ? premiumCost : option.maxLoss
  const recommendedAccountSize = riskPerContract > 0 ? riskPerContract / 0.02 : undefined
  const expirationLabel = formatExpiration(option.expiration)
  const daysToExpiration = getDaysToExpiration(option.expiration)
  const moveDirection = option.type === "call" ? "up" : "down"
  const confidencePercent = option.confidence * 100
  const confidenceText = getConfidenceText(option.confidence)
  const volumeComment = getVolumeComment(option)

  const summaryLines = [
    `Stock is at $${currentPrice.toFixed(2)}. You’re looking for roughly a ${Math.abs(breakevenMove).toFixed(1)}% move ${moveDirection} by ${expirationLabel} to break even.`,
    option.maxProfit === Number.POSITIVE_INFINITY
      ? `Each contract costs $${premiumCost.toFixed(0)} (controls 100 shares) with limited downside of that premium.`
      : `Risk about $${riskPerContract.toFixed(0)} to pursue an estimated reward of ${
          option.maxProfit === 0 ? "modest upside" : formatter.format(option.maxProfit)
        }.`,
    volumeComment,
  ]

  return (
    <Card className="bg-card p-5 shadow-sm transition-colors hover:bg-card/80">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <span className="font-mono text-lg font-bold text-primary">{option.symbol.slice(0, 2)}</span>
          </div>
          <div className="flex-1 space-y-3">
            {/* Trade Ticket - Critical Info */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-mono text-xl font-bold text-foreground">{option.symbol}</h4>
                <span className="font-mono text-lg font-bold text-foreground">${option.strike}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-xs font-bold",
                    option.type === "call" ? "border-bull text-bull bg-bull/5" : "border-bear text-bear bg-bear/5",
                  )}
                >
                  {option.type.toUpperCase()}
                </Badge>
                {sentimentInfo && sentiment && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "flex items-center gap-1 text-xs font-semibold",
                      sentimentInfo.badgeClass,
                    )}
                  >
                    <sentimentInfo.icon className="h-3.5 w-3.5" />
                    {sentimentInfo.label}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Premium:</span>
                  <span className="font-mono font-semibold text-foreground">
                    ${option.premium.toFixed(2)} <span className="text-xs text-muted-foreground">({formatter.format(premiumCost)}/contract)</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Expires:</span>
                  <span className="font-semibold text-foreground">
                    {expirationLabel} <span className="text-xs text-muted-foreground">({daysToExpiration}d)</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Breakeven:</span>
                  <span className="font-mono font-semibold text-foreground">
                    ${option.breakeven.toFixed(2)} <span className="text-xs text-muted-foreground">({Math.abs(breakevenMove).toFixed(1)}% {moveDirection})</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-primary/5 p-3 text-sm text-foreground">
              <p className="font-semibold text-primary">Monty’s takeaway</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {summaryLines.map((line, index) => (
                  <li key={index} className="list-disc pl-4">
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            {sentiment && sentimentInfo && (
              <div className="text-xs text-muted-foreground">
            {sentimentInfo.tone}. Confidence {Math.round(sentiment.confidence * 100)}% with a
                sentiment score of {formatPercent(sentiment.score * 100)}.
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 rounded-lg bg-muted/40 p-4 lg:w-[260px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Suggested action
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-semibold uppercase",
                (option.recommendation === "strong_buy" || option.recommendation === "buy") && "border-bull text-bull",
                option.recommendation === "hold" && "border-muted-foreground text-muted-foreground",
                (option.recommendation === "sell" || option.recommendation === "strong_sell") && "border-bear text-bear",
              )}
            >
              {option.recommendation.replace("_", " ")}
            </Badge>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{confidenceText}</p>
            <p className="text-xs text-muted-foreground">Confidence score {confidencePercent.toFixed(0)}%.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="justify-between"
            onClick={() => setDetailsOpen((prev) => !prev)}
          >
            {detailsOpen ? "Hide full data" : "See data behind this"}
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", detailsOpen ? "rotate-180" : "rotate-0")}
            />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SimpleMetric
          label="Current stock price"
          value={`$${currentPrice.toFixed(2)}`}
          helper="Live market price."
        />
        <SimpleMetric
          label="Contract volume"
          value={`${formatCompactNumber(option.volume)} today`}
          helper={`Open interest: ${formatCompactNumber(option.openInterest)}`}
        />
        <SimpleMetric
          label="Risk per contract"
          value={
            option.maxLoss === Number.POSITIVE_INFINITY
              ? formatter.format(premiumCost)
              : formatter.format(option.maxLoss)
          }
          helper="Max you can lose on this trade."
        />
        <SimpleMetric
          label="Recommended account size"
          value={
            recommendedAccountSize
              ? formatter.format(Math.ceil(recommendedAccountSize))
              : formatter.format(premiumCost)
          }
          helper="For 2% risk management best practice."
        />
      </div>

      {detailsOpen ? (
        <div className="mt-5 space-y-4 rounded-lg border border-border bg-muted/30 p-4">
          <div>
            <h5 className="text-sm font-semibold text-foreground">Greeks in plain English</h5>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(greekNotes).map(([key, meta]) => (
                <div key={key} className="rounded-md border border-border/60 bg-background p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{meta.title}</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                    {option[key as keyof typeof greekNotes].toFixed(meta.title === "Gamma" ? 3 : 2)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{meta.helper}</p>
                </div>
              ))}
              <div className="rounded-md border border-border/60 bg-background p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">IV</p>
                <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                  {(option.impliedVolatility * 100).toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Implied volatility shows what the market expects for movement.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SimpleMetric
              label="Max profit"
              value={
                option.maxProfit === Number.POSITIVE_INFINITY
                  ? "Unlimited"
                  : formatter.format(option.maxProfit)
              }
              helper={option.maxProfit === Number.POSITIVE_INFINITY ? "Upside is uncapped." : "Potential profit at expiration."}
            />
            <SimpleMetric
              label="Max loss"
              value={
                option.maxLoss === Number.POSITIVE_INFINITY
                  ? "Unlimited"
                  : formatter.format(option.maxLoss)
              }
              helper="Define position size around this number."
            />
            <SimpleMetric
              label="Probability of success"
              value={formatPercent(option.probability * 100, false)}
              helper="Model-based odds of finishing in the money."
            />
          </div>

          <div className="rounded-md bg-background p-4 text-sm text-muted-foreground">
            {option.reasoning}
          </div>
        </div>
      ) : null}
    </Card>
  )
}
