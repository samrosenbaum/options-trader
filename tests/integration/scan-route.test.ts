import { createServer } from "http"
import request from "supertest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GET } from "@/app/api/scan/route"

vi.mock("@/lib/api/market-data", () => ({
  getMultipleQuotes: vi.fn(async (symbols: string[]) =>
    symbols.map((symbol, index) => ({
      symbol,
      price: 190 + index,
      volume: 1000000 + index * 1000,
      changePercent: index % 2 === 0 ? 1.2 : -0.5,
    })),
  ),
  getMarketNews: vi.fn(async () => [
    {
      related: ["AAPL", "MSFT"],
      headline: "Tech stocks rally on strong earnings",
      sentiment: { score: 0.6 },
    },
    {
      related: ["TSLA"],
      headline: "EV market sees increased competition",
      sentiment: { score: -0.2 },
    },
  ]),
}))

describe("/api/scan route", () => {
  const originalConsoleError = console.error

  beforeEach(() => {
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = originalConsoleError
  })

  function buildServer() {
    return createServer(async (req, res) => {
      if (req.url === "/api/scan" && req.method === "GET") {
        try {
          const response = await GET()
          res.statusCode = response.status
          response.headers.forEach((value, key) => {
            res.setHeader(key, value)
          })
          const body = await response.text()
          res.end(body)
        } catch (error) {
          res.statusCode = 500
          res.end(String(error))
        }
      } else {
        res.statusCode = 404
        res.end()
      }
    })
  }

  it("returns opportunities when the scoring service succeeds", async () => {
    const fastApiPayload = {
      signals: [
        {
          symbol: "AAPL",
          contract: {
            symbol: "AAPL",
            type: "call",
            strike: 195,
            expiration: "2024-09-20",
            lastPrice: 5.2,
            bid: 5.0,
            ask: 5.4,
            volume: 1500,
            openInterest: 4000,
            impliedVolatility: 0.45,
            stockPrice: 192.15,
          },
          greeks: {
            delta: 0.55,
            gamma: 0.02,
            theta: -0.03,
            vega: 0.12,
          },
          score: {
            total_score: 82.4,
            breakdowns: [],
            reasons: ["Strong momentum"],
            tags: ["momentum"],
            metadata: { market_data: { volumeRatio: 2.1 } },
          },
          confidence: 88.5,
          reasons: ["Strong momentum"],
          tags: ["momentum"],
          generated_at: new Date().toISOString(),
          metadata: {
            action: "buy",
            catalysts: ["News Catalyst"],
            reasoning: ["Volume ratio 2.1x open interest"],
            riskLevel: "low",
            potentialReturn: 2.4,
            maxLoss: 5.2,
            breakeven: 200.2,
            ivRank: 55,
            volumeRatio: 2.1,
            newsImpact: 0.4,
          },
        },
      ],
      errors: [],
    }

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(fastApiPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    const server = buildServer()
    const response = await request(server).get("/api/scan")

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(Array.isArray(response.body.opportunities)).toBe(true)
    expect(response.body.opportunities.length).toBeGreaterThan(0)
    const opportunity = response.body.opportunities[0]
    expect(opportunity.symbol).toBe("AAPL")
    expect(opportunity.score).toBeGreaterThan(0)
    expect(opportunity.confidence).toBeGreaterThan(0)
    expect(opportunity.catalysts.length).toBeGreaterThan(0)
  })

  it("returns an error payload when the scoring service fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection refused")),
    )

    const server = buildServer()
    const response = await request(server).get("/api/scan")

    expect(response.status).toBe(502)
    expect(response.body.success).toBe(false)
    expect(response.body.error).toContain("connection refused")
  })
})
