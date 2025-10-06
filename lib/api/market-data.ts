export interface StockQuote {
  symbol: string
  price: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
  open: number
  previousClose: number
}

export interface OptionsChain {
  symbol: string
  expirationDate: string
  strike: number
  type: "call" | "put"
  bid: number
  ask: number
  last: number
  volume: number
  openInterest: number
  impliedVolatility: number
  delta: number
  gamma: number
  theta: number
  vega: number
}

export interface NewsItem {
  id: string
  headline: string
  summary: string
  source: string
  url: string
  datetime: number
  related: string[]
  sentiment: {
    score: number
    label: "bullish" | "bearish" | "neutral"
  }
}

interface FinnhubNewsItem {
  id: number | string
  headline: string
  summary: string
  source: string
  url: string
  datetime: number
  related?: string
}

// Finnhub API (free tier: 60 calls/minute)
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "demo"
const FINNHUB_BASE_URL = "https://finnhub.io/api/v1"

export async function getStockQuote(symbol: string): Promise<StockQuote> {
  try {
    const response = await fetch(`${FINNHUB_BASE_URL}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    const data = await response.json()

    return {
      symbol,
      price: data.c,
      change: data.d,
      changePercent: data.dp,
      volume: 0, // Finnhub doesn't provide volume in quote endpoint
      high: data.h,
      low: data.l,
      open: data.o,
      previousClose: data.pc,
    }
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error)
    throw error
  }
}

export async function getMultipleQuotes(symbols: string[]): Promise<StockQuote[]> {
  const promises = symbols.map((symbol) => getStockQuote(symbol))
  return Promise.all(promises)
}

export async function getMarketNews(category = "general"): Promise<NewsItem[]> {
  try {
    const response = await fetch(`${FINNHUB_BASE_URL}/news?category=${category}&token=${FINNHUB_API_KEY}`)
    const data = (await response.json()) as FinnhubNewsItem[]

    return data.slice(0, 20).map((item) => ({
      id: item.id.toString(),
      headline: item.headline,
      summary: item.summary,
      source: item.source,
      url: item.url,
      datetime: item.datetime,
      related: item.related ? item.related.split(",") : [],
      sentiment: analyzeSentiment(`${item.headline} ${item.summary}`),
    }))
  } catch (error) {
    console.error("Error fetching market news:", error)
    return []
  }
}

export async function getCompanyNews(symbol: string, from: string, to: string): Promise<NewsItem[]> {
  try {
    const response = await fetch(
      `${FINNHUB_BASE_URL}/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`,
    )
    const data = (await response.json()) as FinnhubNewsItem[]

    return data.slice(0, 10).map((item) => ({
      id: item.id.toString(),
      headline: item.headline,
      summary: item.summary,
      source: item.source,
      url: item.url,
      datetime: item.datetime,
      related: [symbol],
      sentiment: analyzeSentiment(`${item.headline} ${item.summary}`),
    }))
  } catch (error) {
    console.error(`Error fetching news for ${symbol}:`, error)
    return []
  }
}

// Simple sentiment analysis based on keywords
function analyzeSentiment(text: string): { score: number; label: "bullish" | "bearish" | "neutral" } {
  const lowerText = text.toLowerCase()

  const bullishWords = [
    "surge",
    "rally",
    "gain",
    "profit",
    "growth",
    "beat",
    "exceed",
    "strong",
    "positive",
    "upgrade",
    "buy",
    "bullish",
    "soar",
    "jump",
    "rise",
    "increase",
    "record",
    "high",
  ]
  const bearishWords = [
    "fall",
    "drop",
    "loss",
    "decline",
    "weak",
    "negative",
    "downgrade",
    "sell",
    "bearish",
    "plunge",
    "crash",
    "miss",
    "disappoint",
    "concern",
    "risk",
    "low",
  ]

  let score = 0
  bullishWords.forEach((word) => {
    if (lowerText.includes(word)) score += 1
  })
  bearishWords.forEach((word) => {
    if (lowerText.includes(word)) score -= 1
  })

  // Normalize to -1 to 1 range
  const normalizedScore = Math.max(-1, Math.min(1, score / 5))

  let label: "bullish" | "bearish" | "neutral"
  if (normalizedScore > 0.2) label = "bullish"
  else if (normalizedScore < -0.2) label = "bearish"
  else label = "neutral"

  return { score: normalizedScore, label }
}

// Get unusual options activity (mock for now, would need paid data source)
export async function getUnusualOptionsActivity(): Promise<OptionsChain[]> {
  // This would typically require a paid options data provider like:
  // - Tradier API
  // - CBOE DataShop
  // - Polygon.io
  // For now, return empty array - will be populated by AI analysis
  return []
}
