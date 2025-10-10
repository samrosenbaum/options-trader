import { EventEmitter } from "events"
import type { ChildProcessWithoutNullStreams } from "child_process"
import { beforeEach, describe, expect, it, vi } from "vitest"

const spawnMock = vi.fn()
const resolvePythonExecutableMock = vi.fn()

vi.mock("child_process", () => ({
  spawn: spawnMock,
}))

vi.mock("@/lib/server/python", () => ({
  resolvePythonExecutable: resolvePythonExecutableMock,
}))

class MockProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter

  constructor() {
    super()
    this.stdout = new EventEmitter()
    this.stderr = new EventEmitter()
  }
}

describe("/api/scan-python route", () => {
  beforeEach(() => {
    vi.resetModules()
    spawnMock.mockReset()
    resolvePythonExecutableMock.mockReset()
  })

  it("includes swing signal payloads from the python scanner", async () => {
    const mockPayload = {
      opportunities: [
        {
          symbol: "TSLA",
          optionType: "call",
          strike: 250,
          expiration: "2024-09-20",
          premium: 4.2,
          bid: 4.1,
          ask: 4.3,
          volume: 5200,
          openInterest: 8700,
          impliedVolatility: 0.45,
          stockPrice: 248.65,
          score: 91.3,
          confidence: 88.1,
          reasoning: ["Momentum continuation setup"],
          catalysts: ["Breakout confirmation"],
          patterns: ["High volume"],
          riskLevel: "medium",
          potentialReturn: 2.5,
          potentialReturnAmount: 250,
          maxReturn: 4.8,
          maxReturnAmount: 480,
          maxLoss: 420,
          maxLossPercent: 1.0,
          maxLossAmount: 420,
          breakeven: 254.2,
          breakevenPrice: 254.2,
          breakevenMovePercent: 0.018,
          ivRank: 55,
          volumeRatio: 2.1,
          probabilityOfProfit: 0.62,
          profitProbabilityExplanation: "Historical win rate based on similar setups",
          riskRewardRatio: 3.2,
          shortTermRiskRewardRatio: 1.6,
          returnsAnalysis: [
            { move: "+5%", return: 1.9 },
            { move: "+10%", return: 4.2 },
          ],
          greeks: {
            delta: 0.54,
            gamma: 0.02,
            theta: -0.03,
            vega: 0.12,
          },
          daysToExpiration: 21,
          swingSignal: {
            symbol: "TSLA",
            compositeScore: 78.5,
            classification: "elevated_swing_risk",
            factors: [
              {
                name: "Volatility Expansion",
                score: 0.82,
                rationale: "ATR expansion is 1.4x its 30 day average",
                details: {
                  atr_ratio: 1.4,
                },
              },
            ],
            metadata: {
              generated_at: "2024-01-01T00:00:00Z",
              atr_ratio: 1.4,
              momentum_zscore: 1.1,
              volume_zscore: 1.3,
              news_sample: [
                {
                  title: "TSLA breaks out",
                  summary: "",
                  publisher: "Newswire",
                  sentiment_label: "bullish",
                  sentiment_score: 0.6,
                },
              ],
            },
          },
        },
      ],
      metadata: {
        fetchedAt: "2024-01-01T00:00:00Z",
        source: "unit-test",
      },
    }

    resolvePythonExecutableMock.mockResolvedValue("python")
    spawnMock.mockImplementation(() => {
      const proc = new MockProcess()
      setTimeout(() => {
        proc.stdout.emit("data", Buffer.from(`${JSON.stringify(mockPayload)}\n`))
        proc.emit("close", 0)
      }, 0)
      return proc as unknown as ChildProcessWithoutNullStreams
    })

    const { GET } = await import("@/app/api/scan-python/route")
    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.opportunities).toHaveLength(1)
    const opportunity = body.opportunities[0]
    expect(opportunity.symbol).toBe("TSLA")
    expect(opportunity.swingSignal).toBeDefined()
    expect(opportunity.swingSignal.classification).toBe("elevated_swing_risk")
    expect(opportunity.swingSignal.metadata.atr_ratio).toBe(1.4)
    expect(opportunity.swingSignal.factors[0].name).toBe("Volatility Expansion")
    expect(opportunity.swingSignalError).toBeUndefined()
  })

  it("serves bundled fallback opportunities when python returns no qualifying results", async () => {
    const emptyPayload = {
      opportunities: [],
      metadata: {
        fetchedAt: "2024-01-01T00:00:00Z",
        source: "unit-test",
      },
      totalEvaluated: 12,
    }

    resolvePythonExecutableMock.mockResolvedValue("python")
    spawnMock.mockImplementation(() => {
      const proc = new MockProcess()
      setTimeout(() => {
        proc.stdout.emit("data", Buffer.from(`${JSON.stringify(emptyPayload)}\n`))
        proc.emit("close", 0)
      }, 0)
      return proc as unknown as ChildProcessWithoutNullStreams
    })

    const { GET } = await import("@/app/api/scan-python/route")
    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.metadata.fallback).toBe(true)
    expect(body.metadata.fallbackReason).toBe("no_python_results")
    expect(body.metadata.source).toBe("fallback-cache")
    expect(Array.isArray(body.opportunities)).toBe(true)
    expect(body.opportunities.length).toBeGreaterThan(0)
    expect(body.opportunities[0].symbol).toBeDefined()
  })

  it("uses fallback results if the python process fails to spawn", async () => {
    resolvePythonExecutableMock.mockResolvedValue("python")
    spawnMock.mockImplementation(() => {
      const proc = new MockProcess()
      setTimeout(() => {
        proc.emit("error", new Error("spawn ENOENT"))
      }, 0)
      return proc as unknown as ChildProcessWithoutNullStreams
    })

    const { GET } = await import("@/app/api/scan-python/route")
    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.metadata.fallback).toBe(true)
    expect(body.metadata.fallbackReason).toBe("spawn_error")
    expect(body.opportunities.length).toBeGreaterThan(0)
  })
})
