import { subDays, format } from "date-fns"

import {
  getCompanyNews,
  getMultipleQuotes,
  NewsItem,
  StockQuote,
} from "@/lib/api/market-data"

type Direction = "bullish" | "bearish"

export type SentimentNarrative = {
  symbol: string
  company: string
  price: number | null
  change: string
  score: number
  confidence: number
  lastUpdated: string | null
  catalysts: string[]
  rationale: string[]
  direction: Direction
}

export type SentimentSignal = {
  id: string
  label: string
  detail: string
  time: string
  direction: Direction
}

export type SentimentInsights = {
  hero: {
    bullishConviction: {
      percentage: number
      narrativeCount: number
      totalTracked: number
      avgScore: number
    }
    bearishConviction: {
      percentage: number
      narrativeCount: number
      totalTracked: number
      avgScore: number
    }
    flowAlignment: {
      positiveShare: number
      negativeShare: number
      tone: "bullish" | "bearish" | "neutral"
    }
  }
  secondary: {
    avgConfidence: number
    totalArticles: number
    avgAbsChange: number
    heatAlerts: {
      total: number
      bullish: number
      bearish: number
    }
    topSymbols: string[]
  }
  narratives: {
    bullish: SentimentNarrative[]
    bearish: SentimentNarrative[]
  }
  recentSignals: SentimentSignal[]
}

const WATCHLIST: Array<{ symbol: string; company: string }> = [
  { symbol: "AAPL", company: "Apple Inc." },
  { symbol: "MSFT", company: "Microsoft Corporation" },
  { symbol: "NVDA", company: "NVIDIA Corporation" },
  { symbol: "TSLA", company: "Tesla, Inc." },
  { symbol: "AMZN", company: "Amazon.com, Inc." },
  { symbol: "GOOGL", company: "Alphabet Inc." },
  { symbol: "META", company: "Meta Platforms, Inc." },
  { symbol: "AMD", company: "Advanced Micro Devices, Inc." },
  { symbol: "NFLX", company: "Netflix, Inc." },
  { symbol: "SPY", company: "SPDR S&P 500 ETF" },
]

const MIN_SENTIMENT_THRESHOLD = 0.05

function toIso(datetime: number | undefined): string | null {
  if (!datetime) return null
  try {
    return new Date(datetime * 1000).toISOString()
  } catch (error) {
    console.error("Failed to convert datetime to ISO string", error)
    return null
  }
}

function formatChange(changePercent: number | undefined): string {
  if (typeof changePercent !== "number" || Number.isNaN(changePercent)) {
    return "—"
  }

  const fixed = changePercent.toFixed(2)
  return `${changePercent >= 0 ? "+" : ""}${fixed}%`
}

function calculateConfidence(sentiments: number[]): number {
  if (sentiments.length === 0) {
    return 0.3
  }

  if (sentiments.length === 1) {
    return 0.6
  }

  const average = sentiments.reduce((sum, value) => sum + value, 0) / sentiments.length
  const variance =
    sentiments.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / sentiments.length
  const stdDev = Math.sqrt(variance)

  // Normalize: scores live in [-1, 1]. A standard deviation above 0.6 indicates noisy data.
  const normalized = Math.min(1, stdDev / 0.6)
  const baseConfidence = 1 - normalized

  // Reward more data points to avoid single-headline swings.
  const sampleBoost = Math.min(1, sentiments.length / 5)

  const confidence = baseConfidence * 0.7 + sampleBoost * 0.3

  return Math.min(0.95, Math.max(0.2, parseFloat(confidence.toFixed(2))))
}

function buildCatalysts(news: NewsItem[], limit: number): string[] {
  return news
    .slice()
    .sort((a, b) => Math.abs(b.sentiment.score) - Math.abs(a.sentiment.score))
    .slice(0, limit)
    .map((item) => item.headline.trim())
    .filter((headline) => headline.length > 0)
}

function buildRationale(symbol: string, news: NewsItem[], limit: number): string[] {
  return news
    .slice(0, limit)
    .map((item) => {
      const direction = item.sentiment.score >= 0 ? "Bullish" : "Bearish"
      const label = item.sentiment.label
      const source = item.source ? `${item.source} – ` : ""
      const summary = item.summary || item.headline

      return `${direction} read (${label}) for ${symbol}: ${source}${summary}`
    })
    .filter((text) => text.length > 0)
}

function determineTone(positiveShare: number, negativeShare: number): "bullish" | "bearish" | "neutral" {
  if (positiveShare - negativeShare > 0.15) return "bullish"
  if (negativeShare - positiveShare > 0.15) return "bearish"
  return "neutral"
}

type SymbolNews = {
  symbol: string
  company: string
  news: NewsItem[]
  quote: StockQuote | undefined
}

export async function fetchSentimentInsights(): Promise<SentimentInsights> {
  const now = new Date()
  const from = format(subDays(now, 5), "yyyy-MM-dd")
  const to = format(now, "yyyy-MM-dd")

  const symbols = WATCHLIST.map((item) => item.symbol)

  const [newsResponses, quotes] = await Promise.all([
    Promise.all(
      WATCHLIST.map(async (item) => {
        try {
          const companyNews = await getCompanyNews(item.symbol, from, to)
          return { symbol: item.symbol, company: item.company, news: companyNews }
        } catch (error) {
          console.error(`Failed to fetch company news for ${item.symbol}`, error)
          return { symbol: item.symbol, company: item.company, news: [] }
        }
      }),
    ),
    getMultipleQuotes(symbols).catch((error) => {
      console.error("Failed to fetch quotes for sentiment insights", error)
      return [] as StockQuote[]
    }),
  ])

  // Check if we got any news at all (API might be rate limited)
  const totalNewsItems = newsResponses.reduce((sum, item) => sum + item.news.length, 0)
  if (totalNewsItems === 0) {
    console.warn("No news data available - API may be rate limited. Displaying empty state.")
  }

  const quoteMap = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]))

  const narratives: SentimentNarrative[] = []
  const allSignals: Array<{ symbol: string; item: NewsItem }> = []

  let totalArticles = 0
  let cumulativeConfidence = 0

  const symbolNews: SymbolNews[] = newsResponses.map((entry) => ({
    ...entry,
    quote: quoteMap.get(entry.symbol.toUpperCase()),
  }))

  for (const entry of symbolNews) {
    const filteredNews = entry.news.filter((item) => typeof item.sentiment?.score === "number")
    if (filteredNews.length === 0) {
      continue
    }

    totalArticles += filteredNews.length

    const sentiments = filteredNews.map((item) => item.sentiment.score)
    const avgScore = sentiments.reduce((sum, value) => sum + value, 0) / sentiments.length

    if (Math.abs(avgScore) < MIN_SENTIMENT_THRESHOLD) {
      // Skip neutral narratives – they don't add directional insight.
      continue
    }

    const direction: Direction = avgScore > 0 ? "bullish" : "bearish"

    const confidence = calculateConfidence(sentiments)
    cumulativeConfidence += confidence

    const sortedByRecency = filteredNews
      .slice()
      .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))

    const latestNews = sortedByRecency[0]
    const catalysts = buildCatalysts(filteredNews, 3)
    const rationale = buildRationale(entry.symbol, sortedByRecency, 3)

    const quote = entry.quote

    narratives.push({
      symbol: entry.symbol,
      company: entry.company,
      price: typeof quote?.price === "number" ? quote.price : null,
      change: formatChange(quote?.changePercent),
      score: parseFloat(avgScore.toFixed(2)),
      confidence,
      lastUpdated: toIso(latestNews?.datetime),
      catalysts,
      rationale,
      direction,
    })

    for (const item of sortedByRecency.slice(0, 6)) {
      if (typeof item.datetime === "number") {
        allSignals.push({ symbol: entry.symbol, item })
      }
    }
  }

  const bullishNarratives = narratives
    .filter((narrative) => narrative.direction === "bullish")
    .sort((a, b) => b.score - a.score)
  const bearishNarratives = narratives
    .filter((narrative) => narrative.direction === "bearish")
    .sort((a, b) => a.score - b.score)

  const totalTracked = narratives.length
  const bullishCount = bullishNarratives.length
  const bearishCount = bearishNarratives.length

  const bullishAvg =
    bullishCount === 0
      ? 0
      : bullishNarratives.reduce((sum, item) => sum + item.score, 0) / bullishCount
  const bearishAvg =
    bearishCount === 0
      ? 0
      : bearishNarratives.reduce((sum, item) => sum + Math.abs(item.score), 0) / bearishCount

  const positiveShare = totalTracked === 0 ? 0 : bullishCount / totalTracked
  const negativeShare = totalTracked === 0 ? 0 : bearishCount / totalTracked

  const avgConfidence = totalTracked === 0 ? 0 : cumulativeConfidence / totalTracked

  const trackedQuotes = narratives
    .map((narrative) => quoteMap.get(narrative.symbol))
    .filter((quote): quote is StockQuote => Boolean(quote) && typeof quote?.changePercent === "number")

  const avgAbsChange =
    trackedQuotes.length === 0
      ? 0
      : trackedQuotes.reduce((sum, quote) => sum + Math.abs(quote.changePercent), 0) /
        trackedQuotes.length

  const heatAlerts = narratives.filter((narrative) => Math.abs(narrative.score) >= 0.4)
  const heatAlertsBullish = heatAlerts.filter((narrative) => narrative.direction === "bullish").length
  const heatAlertsBearish = heatAlerts.filter((narrative) => narrative.direction === "bearish").length

  const topSymbols = narratives
    .slice()
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 4)
    .map((item) => item.symbol)

  const recentSignals = allSignals
    .filter(({ item }) => Math.abs(item.sentiment.score) >= MIN_SENTIMENT_THRESHOLD)
    .sort((a, b) => (b.item.datetime ?? 0) - (a.item.datetime ?? 0))
    .slice(0, 6)
    .map(({ symbol, item }) => {
      const direction: Direction = item.sentiment.score >= 0 ? "bullish" : "bearish"
      const detail = item.summary || item.headline
      const identifier = item.id ?? `${item.datetime}`

      return {
        id: `${symbol}-${identifier}`,
        label: `${symbol} • ${item.headline}`,
        detail,
        time: toIso(item.datetime) ?? new Date().toISOString(),
        direction,
      }
    })

  return {
    hero: {
      bullishConviction: {
        percentage: Math.max(0, Math.round(Math.min(1, bullishAvg) * 100)),
        narrativeCount: bullishCount,
        totalTracked,
        avgScore: parseFloat(bullishAvg.toFixed(2)),
      },
      bearishConviction: {
        percentage: Math.max(0, Math.round(Math.min(1, bearishAvg) * 100)),
        narrativeCount: bearishCount,
        totalTracked,
        avgScore: -parseFloat(
          (bearishCount === 0
            ? 0
            : bearishNarratives.reduce((sum, item) => sum + item.score, 0) / bearishCount
          ).toFixed(2),
        ),
      },
      flowAlignment: {
        positiveShare,
        negativeShare,
        tone: determineTone(positiveShare, negativeShare),
      },
    },
    secondary: {
      avgConfidence,
      totalArticles,
      avgAbsChange,
      heatAlerts: {
        total: heatAlerts.length,
        bullish: heatAlertsBullish,
        bearish: heatAlertsBearish,
      },
      topSymbols,
    },
    narratives: {
      bullish: bullishNarratives.slice(0, 3),
      bearish: bearishNarratives.slice(0, 3),
    },
    recentSignals,
  }
}
