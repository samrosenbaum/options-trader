import { beforeAll, afterAll, describe, expect, it, vi } from "vitest"

import { computeOptionGreeks, ensureOptionGreeks } from "../../lib/math/greeks"

const anchorDate = new Date("2024-01-01T00:00:00Z")
const expirationDate = new Date("2024-07-01T00:00:00Z")

describe("computeOptionGreeks", () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(anchorDate)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it("produces accurate Black-Scholes greeks for calls", () => {
    const greeks = computeOptionGreeks({
      type: "call",
      stockPrice: 100,
      strike: 105,
      impliedVolatility: 0.25,
      expiration: expirationDate,
      riskFreeRate: 0.02
    })

    expect(greeks).not.toBeNull()
    expect(greeks?.delta).toBeCloseTo(0.4476, 4)
    expect(greeks?.gamma).toBeCloseTo(0.0224, 4)
    expect(greeks?.theta).toBeCloseTo(-0.0213, 4)
    expect(greeks?.vega).toBeCloseTo(0.2793, 4)
  })

  it("handles percentage implied volatility inputs and put contracts", () => {
    const greeks = computeOptionGreeks({
      type: "put",
      stockPrice: 100,
      strike: 105,
      impliedVolatility: 25, // Accept percent inputs
      expiration: expirationDate,
      riskFreeRate: 0.02
    })

    expect(greeks).not.toBeNull()
    expect(greeks?.delta).toBeCloseTo(-0.5524, 4)
    expect(greeks?.gamma).toBeCloseTo(0.0224, 4)
    expect(greeks?.theta).toBeCloseTo(-0.0156, 4)
    expect(greeks?.vega).toBeCloseTo(0.2793, 4)
  })
})

describe("ensureOptionGreeks", () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(anchorDate)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it("fills in missing greeks from computed fallback", () => {
    const fallback = ensureOptionGreeks(
      {
        delta: 0,
        gamma: undefined,
        theta: undefined,
        vega: undefined
      },
      {
        option_type: "call",
        stock_price: 100,
        strike: 105,
        implied_volatility: 0.25,
        expiration: expirationDate.toISOString()
      }
    )

    expect(fallback.delta).toBeCloseTo(0.4813, 4)
    expect(fallback.gamma).toBeCloseTo(0.022574, 6)
    expect(fallback.theta).toBeCloseTo(-0.0251, 4)
    expect(fallback.vega).toBeCloseTo(0.2814, 4)
  })
})
