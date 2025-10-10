import React from "react"
import renderer, { act } from "react-test-renderer"

import OpportunityCard from "@/components/opportunity-card"
import { Opportunity } from "@/lib/types/opportunity"

describe("OpportunityCard", () => {
  it("renders swing signal insights when provided", () => {
    const opportunity: Opportunity = {
      symbol: "TSLA",
      optionType: "call",
      strike: 250,
      expiration: "2024-09-20",
      premium: 4.2,
      stockPrice: 248.65,
      score: 91.3,
      confidence: 88.1,
      reasoning: ["Momentum continuation setup"],
      patterns: ["High volume"],
      catalysts: ["Breakout confirmation"],
      riskLevel: "medium",
      potentialReturn: 250,
      potentialReturnAmount: 250,
      maxReturn: 420,
      maxReturnAmount: 420,
      maxLoss: 420,
      maxLossPercent: 100,
      maxLossAmount: 420,
      breakeven: 254.2,
      breakevenMovePercent: 12.5,
      breakevenPrice: 254.2,
      ivRank: 55,
      volumeRatio: 2.1,
      probabilityOfProfit: 62.0,
      profitProbabilityExplanation: "Historical win rate based on similar setups",
      riskRewardRatio: 3.2,
      shortTermRiskRewardRatio: 1.6,
      greeks: {
        delta: 0.54,
        gamma: 0.02,
        theta: -0.03,
        vega: 0.12,
      },
      daysToExpiration: 21,
      returnsAnalysis: [
        { move: "+5%", return: 1.9 },
        { move: "+10%", return: 4.2 },
      ],
      moveAnalysis: {
        expectedMovePercent: 5.2,
        impliedVol: 0.45,
        daysToExpiration: 21,
        thresholds: [],
        drivers: ["Momentum breakout"],
      },
      eventIntel: {
        earnings_in_days: 5,
        news_sentiment_label: "bullish",
        unique_drivers: ["Momentum breakout"],
      },
      gammaSqueezeScore: 1.4,
      unusualFlowScore: 0.9,
      maxPainStrike: 255,
      newsImpactScore: 0.7,
      recentNews: [],
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
              headlines: [
                {
                  title: "TSLA breaks out",
                  publisher: "Newswire",
                  sentiment_label: "bullish",
                  sentiment_score: 0.6,
                },
              ],
            },
          },
          {
            name: "Momentum Breakout",
            score: 0.76,
            rationale: "Price closed above key resistance",
            details: {
              momentum_zscore: 1.2,
            },
          },
        ],
        metadata: {
          generated_at: "2024-01-01T00:00:00Z",
          lookback: "6mo",
          interval: "1d",
          atr_ratio: 1.4,
          momentum_zscore: 1.2,
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
          market_context: {
            vix_ratio: 1.1,
            spy_return_5d: 0.02,
          },
        },
      },
      swingSignalError: undefined,
      _dataQuality: {
        quality: "high",
        score: 95,
        issues: [],
        warnings: [],
        priceSource: "realtime",
        priceTimestamp: "2024-01-01T00:00:00Z",
        priceAgeSeconds: 15,
      },
    }

    const component = renderer.create(
      <OpportunityCard opportunity={opportunity} investmentAmount={1000} />,
    )

    act(() => {
      const expandButton = component.root.findByType("button")
      expandButton.props.onClick()
    })

    const tree = component.toJSON()
    expect(tree).toBeTruthy()
    const serialized = JSON.stringify(tree)
    expect(serialized).toContain("Elevated swing risk")
    expect(serialized).toContain("Volatility Expansion")
    expect(serialized).toContain("ATR expansion is 1.4x its 30 day average")
  })
})
