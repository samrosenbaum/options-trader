export interface OpportunityScore {
  symbol: string
  optionType: "call" | "put"
  action: "buy" | "sell"
  strike: number
  expiration: string
  score: number // 0-100
  confidence: number // 0-100
  reasoning: string[]
  catalysts: string[]
  riskLevel: "low" | "medium" | "high"
  potentialReturn: number
  maxLoss: number
  breakeven: number
  ivRank: number
  volumeRatio: number
  newsImpact: number
}

export interface MarketContext {
  symbol: string
  price: number
  volume: number
  volatility: number
  news: Array<{ headline: string; sentiment: number }>
  technicals: {
    rsi?: number
    macd?: number
    trend: "bullish" | "bearish" | "neutral"
  }
}

// Calculate opportunity score based on multiple factors
export function calculateOpportunityScore(
  context: MarketContext,
  option: {
    type: "call" | "put"
    strike: number
    premium: number
    iv: number
    volume: number
    openInterest: number
    delta: number
  },
): OpportunityScore {
  let score = 0
  const reasoning: string[] = []
  const catalysts: string[] = []

  // Factor 1: Implied Volatility Rank (0-30 points)
  const ivRank = calculateIVRank(option.iv)
  if (ivRank > 70) {
    score += 25
    reasoning.push(`High IV rank (${ivRank.toFixed(0)}%) suggests elevated option premiums`)
  } else if (ivRank < 30) {
    score += 20
    reasoning.push(`Low IV rank (${ivRank.toFixed(0)}%) indicates potential for volatility expansion`)
  } else {
    score += 10
  }

  // Factor 2: Volume to Open Interest Ratio (0-25 points)
  const volumeRatio = option.volume / Math.max(option.openInterest, 1)
  if (volumeRatio > 2) {
    score += 25
    reasoning.push(`Unusual volume (${volumeRatio.toFixed(1)}x open interest) indicates strong interest`)
    catalysts.push("Unusual Options Activity")
  } else if (volumeRatio > 1) {
    score += 15
    reasoning.push(`Above-average volume suggests growing interest`)
  } else {
    score += 5
  }

  // Factor 3: News Sentiment (0-20 points)
  const avgSentiment = context.news.reduce((sum, n) => sum + n.sentiment, 0) / Math.max(context.news.length, 1)
  const sentimentAligned =
    (option.type === "call" && avgSentiment > 0.3) || (option.type === "put" && avgSentiment < -0.3)
  if (sentimentAligned) {
    score += 20
    reasoning.push(
      `News sentiment strongly ${avgSentiment > 0 ? "bullish" : "bearish"}, aligned with ${option.type} position`,
    )
    catalysts.push("Positive News Catalyst")
  } else if (Math.abs(avgSentiment) > 0.1) {
    score += 10
  } else {
    score += 5
  }

  // Factor 4: Technical Setup (0-15 points)
  const technicalAligned =
    (option.type === "call" && context.technicals.trend === "bullish") ||
    (option.type === "put" && context.technicals.trend === "bearish")
  if (technicalAligned) {
    score += 15
    reasoning.push(`Technical indicators confirm ${context.technicals.trend} trend`)
    catalysts.push("Technical Breakout")
  } else {
    score += 5
  }

  // Factor 5: Risk/Reward Ratio (0-10 points)
  const moneyness = (context.price - option.strike) / context.price
  const potentialReturn = calculatePotentialReturn(option.type, context.price, option.strike, option.premium)
  const riskRewardRatio = potentialReturn / option.premium

  if (riskRewardRatio > 3) {
    score += 10
    reasoning.push(`Excellent risk/reward ratio of ${riskRewardRatio.toFixed(1)}:1`)
  } else if (riskRewardRatio > 2) {
    score += 7
  } else {
    score += 3
  }

  // Factor 6: Delta efficiency (0-10 points)
  const deltaEfficiency = Math.abs(option.delta) / option.premium
  if (deltaEfficiency > 0.5) {
    score += 10
    reasoning.push(`High delta efficiency (${deltaEfficiency.toFixed(2)}) provides good leverage`)
  } else {
    score += 5
  }

  // Determine risk level
  let riskLevel: "low" | "medium" | "high"
  if (Math.abs(moneyness) < 0.05) {
    riskLevel = "medium"
  } else if (Math.abs(moneyness) > 0.15) {
    riskLevel = "high"
  } else {
    riskLevel = "low"
  }

  // Calculate breakeven
  const breakeven = option.type === "call" ? option.strike + option.premium : option.strike - option.premium

  // Confidence based on number of aligned factors
  const confidence = Math.min(95, score * 0.9 + 10)

  return {
    symbol: context.symbol,
    optionType: option.type,
    action: "buy", // Could be enhanced to suggest selling strategies
    strike: option.strike,
    expiration: getNextExpiration(),
    score: Math.min(100, score),
    confidence,
    reasoning,
    catalysts,
    riskLevel,
    potentialReturn,
    maxLoss: option.premium,
    breakeven,
    ivRank,
    volumeRatio,
    newsImpact: avgSentiment,
  }
}

function calculateIVRank(currentIV: number): number {
  // Simplified IV rank calculation
  // In production, would compare to 52-week IV range
  const typicalIVRange = { low: 20, high: 80 }
  return ((currentIV - typicalIVRange.low) / (typicalIVRange.high - typicalIVRange.low)) * 100
}

function calculatePotentialReturn(type: "call" | "put", currentPrice: number, strike: number, premium: number): number {
  // Estimate potential return based on 10% move
  const targetPrice = type === "call" ? currentPrice * 1.1 : currentPrice * 0.9
  const intrinsicValue = type === "call" ? Math.max(0, targetPrice - strike) : Math.max(0, strike - targetPrice)
  return Math.max(0, intrinsicValue - premium)
}

function getNextExpiration(): string {
  const now = new Date()
  const daysToFriday = (5 - now.getDay() + 7) % 7 || 7
  const nextFriday = new Date(now.getTime() + daysToFriday * 24 * 60 * 60 * 1000)
  nextFriday.setDate(nextFriday.getDate() + 7) // Next week's Friday
  return nextFriday.toISOString().split("T")[0]
}

// Scan multiple symbols and return top opportunities
export async function scanForOpportunities(symbols: string[], contexts: MarketContext[]): Promise<OpportunityScore[]> {
  const opportunities: OpportunityScore[] = []

  for (let i = 0; i < contexts.length; i++) {
    const context = contexts[i]

    // Generate sample options for analysis
    // In production, would fetch real options chain data
    const sampleOptions = generateSampleOptions(context.price)

    for (const option of sampleOptions) {
      const score = calculateOpportunityScore(context, option)
      if (score.score > 60) {
        // Only include high-scoring opportunities
        opportunities.push(score)
      }
    }
  }

  // Sort by score descending
  return opportunities.sort((a, b) => b.score - a.score).slice(0, 10)
}

function generateSampleOptions(stockPrice: number) {
  const options = []

  // Generate ATM, ITM, and OTM options
  const strikes = [
    stockPrice * 0.95, // ITM call / OTM put
    stockPrice, // ATM
    stockPrice * 1.05, // OTM call / ITM put
  ]

  for (const strike of strikes) {
    // Call option
    options.push({
      type: "call" as const,
      strike,
      premium: Math.max(0.5, (stockPrice - strike) * 0.3 + Math.random() * 2),
      iv: 30 + Math.random() * 40,
      volume: Math.floor(Math.random() * 5000) + 100,
      openInterest: Math.floor(Math.random() * 10000) + 500,
      delta: strike < stockPrice ? 0.6 + Math.random() * 0.3 : 0.2 + Math.random() * 0.3,
    })

    // Put option
    options.push({
      type: "put" as const,
      strike,
      premium: Math.max(0.5, (strike - stockPrice) * 0.3 + Math.random() * 2),
      iv: 30 + Math.random() * 40,
      volume: Math.floor(Math.random() * 5000) + 100,
      openInterest: Math.floor(Math.random() * 10000) + 500,
      delta: strike > stockPrice ? -0.6 - Math.random() * 0.3 : -0.2 - Math.random() * 0.3,
    })
  }

  return options
}
