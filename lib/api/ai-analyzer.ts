import { requestSignals } from "./scoring-service"
import {
  MarketContext,
  OptionContract,
  OptionGreeks,
  ScanRequest,
  ScanResponse,
  ScanTarget,
  Signal,
} from "./types"

export type { MarketContext } from "./types"

export interface OpportunityScore {
  symbol: string
  optionType: "call" | "put"
  action: "buy" | "sell"
  strike: number
  expiration: string
  premium: number
  bid: number
  ask: number
  volume: number
  openInterest: number
  impliedVolatility: number
  stockPrice: number
  score: number
  confidence: number
  reasoning: string[]
  catalysts: string[]
  riskLevel: "low" | "medium" | "high"
  potentialReturn: number
  maxLoss: number
  breakeven: number
  ivRank: number
  volumeRatio: number
  newsImpact: number
  greeks: OptionGreeks
  probabilityOfProfit?: number | null
  profitProbabilityExplanation?: string
  breakevenMovePercent?: number | null
  breakevenPrice?: number | null
}

interface SampleOption {
  type: "call" | "put"
  strike: number
  premium: number
  iv: number
  volume: number
  openInterest: number
  delta: number
}

function calculateIVRank(currentIV: number): number {
  const typicalIVRange = { low: 20, high: 80 }
  return ((currentIV - typicalIVRange.low) / (typicalIVRange.high - typicalIVRange.low)) * 100
}

function calculatePotentialReturn(
  type: "call" | "put",
  currentPrice: number,
  strike: number,
  premium: number,
): number {
  const targetPrice = type === "call" ? currentPrice * 1.1 : currentPrice * 0.9
  const intrinsicValue = type === "call" ? Math.max(0, targetPrice - strike) : Math.max(0, strike - targetPrice)
  return Math.max(0, intrinsicValue - premium)
}

function getNextExpiration(): string {
  const now = new Date()
  const daysToFriday = (5 - now.getDay() + 7) % 7 || 7
  const nextFriday = new Date(now.getTime() + daysToFriday * 24 * 60 * 60 * 1000)
  nextFriday.setDate(nextFriday.getDate() + 7)
  return nextFriday.toISOString().split("T")[0]
}

function computeGreeks(option: SampleOption, stockPrice: number): OptionGreeks {
  // Simplified Greek calculations based on Black-Scholes approximations
  // For more accurate values, use the Python scoring engine
  
  // Convert IV from percentage to decimal (e.g., 30 -> 0.30)
  const sigma = option.iv / 100
  
  // Assume ~30 days to expiration for sample options
  const T = 30 / 365
  const sqrtT = Math.sqrt(T)
  
  // Risk-free rate assumption
  const r = 0.05
  
  const S = stockPrice
  const K = option.strike
  
  // Calculate d1 for Black-Scholes
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
  
  // Standard normal PDF approximation at d1
  const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI)
  
  // Gamma: rate of change of delta with respect to stock price
  // Gamma = N'(d1) / (S * σ * √T)
  const gamma = nd1 / (S * sigma * sqrtT)
  
  // Vega: rate of change of option price with respect to 1% change in IV
  // Vega = S * N'(d1) * √T / 100
  const vega = (S * nd1 * sqrtT) / 100
  
  // Theta: rate of change of option price with respect to time (per day)
  // Simplified approximation
  const theta = -(S * nd1 * sigma) / (2 * sqrtT * 365)
  
  return {
    delta: option.delta,
    gamma: Number(gamma.toFixed(4)),
    theta: Number(theta.toFixed(4)),
    vega: Number(vega.toFixed(4)),
  }
}

function buildOpportunity(
  context: MarketContext,
  option: SampleOption,
): { target: ScanTarget; draft: OpportunityScore; key: string } {
  const expiration = getNextExpiration()
  const mid = Math.max(option.premium, 0.05)
  const spread = Math.max(mid * 0.1, 0.05)
  const bid = Math.max(mid - spread / 2, 0.01)
  const ask = bid + spread
  const greeks = computeGreeks(option, context.price)
  const avgSentiment = context.news.reduce((sum, n) => sum + n.sentiment, 0) / Math.max(context.news.length, 1)
  const volumeRatio = option.volume / Math.max(option.openInterest, 1)
  const ivRank = calculateIVRank(option.iv)
  const potentialReturn = calculatePotentialReturn(option.type, context.price, option.strike, mid)
  const breakeven = option.type === "call" ? option.strike + mid : option.strike - mid
  const moneyness = (context.price - option.strike) / Math.max(context.price, 1)

  const catalysts: string[] = []
  const reasoning: string[] = []

  if (volumeRatio > 2) {
    catalysts.push("Unusual Options Activity")
    reasoning.push(`Volume ratio ${volumeRatio.toFixed(1)}x open interest`)
  } else if (volumeRatio > 1) {
    reasoning.push("Healthy options volume relative to open interest")
  }

  if (Math.abs(avgSentiment) > 0.3) {
    catalysts.push("News Catalyst")
    reasoning.push(`News sentiment ${avgSentiment > 0 ? "bullish" : "bearish"}`)
  }

  if (option.type === "call" && context.technicals.trend === "bullish") {
    catalysts.push("Technical Breakout")
    reasoning.push("Technicals indicate bullish momentum")
  } else if (option.type === "put" && context.technicals.trend === "bearish") {
    catalysts.push("Technical Breakdown")
    reasoning.push("Technicals indicate bearish momentum")
  }

  const riskLevel: "low" | "medium" | "high" = Math.abs(moneyness) > 0.15 ? "high" : Math.abs(moneyness) < 0.05 ? "medium" : "low"

  const heuristicsScore = Math.min(
    100,
    40 + volumeRatio * 10 + Math.max(0, 50 * Math.abs(avgSentiment)) + (riskLevel === "low" ? 10 : 0),
  )
  const confidenceHint = Math.min(95, heuristicsScore * 0.9 + 10)

  const contract: OptionContract = {
    symbol: context.symbol,
    type: option.type,
    strike: Number(option.strike.toFixed(2)),
    expiration,
    lastPrice: Number(mid.toFixed(2)),
    bid: Number(bid.toFixed(2)),
    ask: Number(ask.toFixed(2)),
    volume: Math.round(option.volume),
    openInterest: Math.round(option.openInterest),
    impliedVolatility: Number(option.iv.toFixed(4)),
    stockPrice: Number(context.price.toFixed(2)),
  }

  const metadata = {
    action: "buy" as const,
    catalysts,
    reasoning,
    riskLevel,
    potentialReturn: Number(potentialReturn.toFixed(2)),
    maxLoss: Number(mid.toFixed(2)),
    breakeven: Number(breakeven.toFixed(2)),
    ivRank: Number(ivRank.toFixed(2)),
    volumeRatio: Number(volumeRatio.toFixed(2)),
    newsImpact: Number(avgSentiment.toFixed(2)),
    heuristicsScore,
    confidenceHint,
  }

  const target: ScanTarget = {
    contract,
    greeks,
    market_data: {
      price: context.price,
      volatility: context.volatility,
      volume: context.volume,
      newsImpact: avgSentiment,
      volumeRatio,
    },
    metadata,
  }

  const draft: OpportunityScore = {
    symbol: context.symbol,
    optionType: option.type,
    action: "buy",
    strike: contract.strike,
    expiration,
    premium: contract.lastPrice,
    bid: contract.bid,
    ask: contract.ask,
    volume: contract.volume,
    openInterest: contract.openInterest,
    impliedVolatility: contract.impliedVolatility,
    stockPrice: contract.stockPrice,
    score: heuristicsScore,
    confidence: confidenceHint,
    reasoning,
    catalysts,
    riskLevel,
    potentialReturn: metadata.potentialReturn,
    maxLoss: metadata.maxLoss,
    breakeven: metadata.breakeven,
    ivRank: metadata.ivRank,
    volumeRatio: metadata.volumeRatio,
    newsImpact: metadata.newsImpact,
    greeks,
  }

  const key = `${contract.symbol}|${contract.type}|${contract.strike}|${contract.expiration}`

  return { target, draft, key }
}

function mergeSignalWithDraft(signal: Signal, draftMap: Map<string, OpportunityScore>): OpportunityScore {
  const key = `${signal.contract.symbol}|${signal.contract.type}|${signal.contract.strike}|${signal.contract.expiration}`
  const draft = draftMap.get(key)
  const metadata = signal.metadata || {}
  
  // Extract profit probability from metadata
  const profitProbability = metadata.profit_probability as any
  const probabilityOfProfit = profitProbability?.probability != null 
    ? Number(profitProbability.probability) * 100  // Convert to percentage
    : null
  const profitProbabilityExplanation = profitProbability?.explanation as string | undefined
  const breakevenMovePercent = profitProbability?.required_move_pct != null
    ? Number(profitProbability.required_move_pct) * 100  // Convert to percentage
    : null
  const breakevenPrice = profitProbability?.breakeven_price != null
    ? Number(profitProbability.breakeven_price)
    : null

  return {
    symbol: signal.symbol,
    optionType: signal.contract.type,
    action: (metadata.action as "buy" | "sell") || draft?.action || "buy",
    strike: signal.contract.strike,
    expiration: signal.contract.expiration,
    premium: signal.contract.lastPrice,
    bid: signal.contract.bid,
    ask: signal.contract.ask,
    volume: signal.contract.volume,
    openInterest: signal.contract.openInterest,
    impliedVolatility: signal.contract.impliedVolatility,
    stockPrice: signal.contract.stockPrice,
    score: signal.score.total_score,
    confidence: signal.confidence || (metadata.confidenceHint as number) || draft?.confidence || signal.score.total_score,
    reasoning: signal.reasons.length ? signal.reasons : (metadata.reasoning as string[]) || draft?.reasoning || [],
    catalysts: (metadata.catalysts as string[]) || draft?.catalysts || [],
    riskLevel: (metadata.riskLevel as "low" | "medium" | "high") || draft?.riskLevel || "medium",
    potentialReturn: Number(metadata.potentialReturn ?? draft?.potentialReturn ?? 0),
    maxLoss: Number(metadata.maxLoss ?? draft?.maxLoss ?? signal.contract.lastPrice),
    breakeven: Number(metadata.breakeven ?? draft?.breakeven ?? signal.contract.strike),
    ivRank: Number(metadata.ivRank ?? draft?.ivRank ?? 0),
    volumeRatio: Number(metadata.volumeRatio ?? draft?.volumeRatio ?? 0),
    newsImpact: Number(metadata.newsImpact ?? draft?.newsImpact ?? 0),
    greeks: signal.greeks,
    probabilityOfProfit,
    profitProbabilityExplanation,
    breakevenMovePercent,
    breakevenPrice,
  }
}

function generateSampleOptions(stockPrice: number): SampleOption[] {
  const options: SampleOption[] = []
  const strikes = [stockPrice * 0.95, stockPrice, stockPrice * 1.05]

  for (const strike of strikes) {
    options.push({
      type: "call",
      strike,
      premium: Math.max(0.5, (stockPrice - strike) * 0.3 + 1.5),
      iv: 30 + (stockPrice % 20),
      volume: Math.floor(stockPrice * 2 + strike) % 4000 + 500,
      openInterest: Math.floor(stockPrice * 3 + strike) % 8000 + 500,
      delta: strike < stockPrice ? 0.65 : 0.35,
    })

    options.push({
      type: "put",
      strike,
      premium: Math.max(0.5, (strike - stockPrice) * 0.3 + 1.2),
      iv: 28 + (stockPrice % 25),
      volume: Math.floor(stockPrice * 1.5 + strike) % 4000 + 400,
      openInterest: Math.floor(stockPrice * 2.2 + strike) % 8000 + 400,
      delta: strike > stockPrice ? -0.65 : -0.35,
    })
  }

  return options
}

export async function scanForOpportunities(symbols: string[], contexts: MarketContext[]): Promise<OpportunityScore[]> {
  const targets: ScanTarget[] = []
  const draftMap = new Map<string, OpportunityScore>()

  for (const context of contexts) {
    const sampleOptions = generateSampleOptions(context.price)
    for (const option of sampleOptions) {
      const { target, draft, key } = buildOpportunity(context, option)
      targets.push(target)
      draftMap.set(key, draft)
    }
  }

  if (targets.length === 0) {
    return []
  }

  const requestPayload: ScanRequest = {
    targets,
    market_context: Object.fromEntries(contexts.map((ctx) => [ctx.symbol, ctx])),
    scoring_config: {},
  }

  const response: ScanResponse = await requestSignals(requestPayload)
  const opportunities = response.signals.map((signal) => mergeSignalWithDraft(signal, draftMap))

  return opportunities.filter((opp) => opp.score >= 60).sort((a, b) => b.score - a.score).slice(0, 10)
}
