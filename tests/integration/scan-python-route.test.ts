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

    class MockProcess extends EventEmitter {
      stdout: EventEmitter
      stderr: EventEmitter

      constructor() {
        super()
        this.stdout = new EventEmitter()
        this.stderr = new EventEmitter()
      }
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

  it("keeps opportunities when the scanner reports a 0% probability of profit", async () => {
    const mockPayload = {
      opportunities: [
        {
          symbol: "AAPL",
          optionType: "call",
          strike: 200,
          expiration: "2024-12-20",
          premium: 3.5,
          bid: 3.4,
          ask: 3.6,
          volume: 1000,
          openInterest: 5000,
          impliedVolatility: 0.35,
          stockPrice: 195.23,
          score: 82.1,
          confidence: 70.5,
          reasoning: ["Earnings momentum"],
          catalysts: ["Post-earnings drift"],
          patterns: [],
          riskLevel: "medium",
          potentialReturn: 2.1,
          potentialReturnAmount: 210,
          maxReturn: 4.2,
          maxReturnAmount: 420,
          maxLoss: 350,
          maxLossPercent: 1.0,
          maxLossAmount: 350,
          breakeven: 203.5,
          breakevenPrice: 203.5,
          breakevenMovePercent: 0.017,
          ivRank: 45,
          volumeRatio: 1.8,
          probabilityOfProfit: 0,
          profitProbabilityExplanation: "Model returned boundary probability",
          riskRewardRatio: 2.0,
          shortTermRiskRewardRatio: 1.2,
          returnsAnalysis: [
            { move: "+5%", return: 1.2 },
          ],
          greeks: {
            delta: 0.48,
            gamma: 0.02,
            theta: -0.04,
            vega: 0.1,
          },
          daysToExpiration: 60,
        },
      ],
      metadata: {
        fetchedAt: "2024-01-02T00:00:00Z",
        source: "unit-test",
      },
    }

    class MockProcess extends EventEmitter {
      stdout: EventEmitter
      stderr: EventEmitter

      constructor() {
        super()
        this.stdout = new EventEmitter()
        this.stderr = new EventEmitter()
      }
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
    expect(body.opportunities[0].probabilityOfProfit).toBe(0)
  })

  it("preserves opportunities even when the probability payload is negative", async () => {
    const mockPayload = {
      opportunities: [
        {
          symbol: "MSFT",
          optionType: "put",
          strike: 300,
          expiration: "2024-10-18",
          premium: 5.5,
          bid: 5.45,
          ask: 5.6,
          volume: 2500,
          openInterest: 4100,
          impliedVolatility: 0.28,
          stockPrice: 315.88,
          score: 76.4,
          confidence: 68.2,
          reasoning: ["Earnings volatility"],
          catalysts: ["Post-earnings reversion"],
          patterns: ["Trend exhaustion"],
          riskLevel: "medium",
          potentialReturn: 1.5,
          potentialReturnAmount: 150,
          maxReturn: 3.1,
          maxReturnAmount: 310,
          maxLoss: 550,
          maxLossPercent: 1.0,
          maxLossAmount: 550,
          breakeven: 294.5,
          breakevenPrice: 294.5,
          breakevenMovePercent: 0.021,
          ivRank: 38,
          volumeRatio: 1.4,
          probabilityOfProfit: -12.5,
          profitProbabilityExplanation: "Model produced low confidence score",
          riskRewardRatio: 1.6,
          shortTermRiskRewardRatio: 0.8,
          returnsAnalysis: [
            { move: "+5%", return: 0.9 },
            { move: "+10%", return: 2.2 },
          ],
          greeks: {
            delta: -0.42,
            gamma: 0.018,
            theta: -0.02,
            vega: 0.11,
          },
          daysToExpiration: 45,
        },
      ],
      metadata: {
        fetchedAt: "2024-02-10T00:00:00Z",
        source: "unit-test",
      },
    }

    class MockProcess extends EventEmitter {
      stdout: EventEmitter
      stderr: EventEmitter

      constructor() {
        super()
        this.stdout = new EventEmitter()
        this.stderr = new EventEmitter()
      }
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
    expect(body.opportunities[0].probabilityOfProfit).toBe(0)
  })

  it("parses scanner output when stdout contains noisy logs with braces", async () => {
    const mockPayload = {
      opportunities: [
        {
          symbol: "NVDA",
          optionType: "call",
          strike: 900,
          expiration: "2024-11-15",
          premium: 12.5,
          bid: 12.4,
          ask: 12.6,
          volume: 4200,
          openInterest: 15000,
          impliedVolatility: 0.55,
          stockPrice: 905.21,
          score: 95.2,
          confidence: 88.7,
          reasoning: ["AI infrastructure leadership"],
          catalysts: ["Data center demand"],
          patterns: [],
          riskLevel: "medium",
          potentialReturn: 4.1,
          potentialReturnAmount: 410,
          maxReturn: 7.5,
          maxReturnAmount: 750,
          maxLoss: 1250,
          maxLossPercent: 1,
          maxLossAmount: 1250,
          breakeven: 912.5,
          breakevenPrice: 912.5,
          breakevenMovePercent: 0.008,
          ivRank: 62,
          volumeRatio: 1.9,
          probabilityOfProfit: 0.58,
          riskRewardRatio: 2.8,
          shortTermRiskRewardRatio: 1.4,
          returnsAnalysis: [
            { move: "+5%", return: 2.4 },
          ],
          greeks: {
            delta: 0.61,
            gamma: 0.03,
            theta: -0.04,
            vega: 0.15,
          },
          daysToExpiration: 45,
        },
      ],
      metadata: {
        fetchedAt: "2024-01-03T00:00:00Z",
        source: "unit-test",
      },
    }

    class MockProcess extends EventEmitter {
      stdout: EventEmitter
      stderr: EventEmitter

      constructor() {
        super()
        this.stdout = new EventEmitter()
        this.stderr = new EventEmitter()
      }
    }

    resolvePythonExecutableMock.mockResolvedValue("python")
    spawnMock.mockImplementation(() => {
      const proc = new MockProcess()
      setTimeout(() => {
        proc.stdout.emit(
          "data",
          Buffer.from(
            [
              "🚀 Starting bulk options data fetch...\n",
              "⚠️  Unable to load watchlist symbols from config: {'error': 'not found'}\n",
              `${JSON.stringify(mockPayload)}\n`,
            ].join("")
          ),
        )
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
    expect(body.opportunities[0].symbol).toBe("NVDA")
  })
})
