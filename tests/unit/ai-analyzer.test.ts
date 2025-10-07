import { describe, expect, it } from "vitest"

import { buildOpportunity, type MarketContext } from "@/lib/api/ai-analyzer"

describe("buildOpportunity", () => {
  const baseContext: MarketContext = {
    symbol: "AAPL",
    price: 190.25,
    volume: 1250000,
    volatility: 1.8,
    news: [
      { headline: "AAPL releases new product", sentiment: 0.4 },
      { headline: "Analysts upgrade outlook", sentiment: 0.2 },
    ],
    technicals: {
      trend: "bullish",
    },
  }

  const sampleOption = {
    type: "call" as const,
    strike: 195,
    premium: 4.8,
    iv: 32.5,
    volume: 1500,
    openInterest: 4500,
    delta: 0.55,
  }

  it("normalizes implied volatility to a decimal value", () => {
    const { target, draft } = buildOpportunity(baseContext, sampleOption)

    expect(target.contract.impliedVolatility).toBeCloseTo(0.325, 4)
    expect(draft.impliedVolatility).toBeCloseTo(0.325, 4)
  })

  it("keeps the fallback draft aligned with the normalized IV", () => {
    const { target, draft } = buildOpportunity(baseContext, sampleOption)

    expect(draft.impliedVolatility).toBe(target.contract.impliedVolatility)
    expect(draft.score).toBeGreaterThan(0)
  })
})
