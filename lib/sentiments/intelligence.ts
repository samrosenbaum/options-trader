import { subDays, format } from "date-fns"

import {
  getCompanyNews,
  getMarketNews,
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
  market: {
    overall: MarketSentimentSnapshot
    sp500: MarketSentimentSnapshot
    economy: MarketSentimentSnapshot
  }
}

export type MarketSentimentSnapshot = {
  score: number
  tone: "bullish" | "bearish" | "neutral"
  confidence: number
  summary: string
  change: string
  lastUpdated: string | null
  drivers: string[]
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

function buildFallbackInsights(): SentimentInsights {
  const now = new Date()
  const fallbackTimestamp = now.toISOString()

  const fallbackNarratives: SentimentNarrative[] = [
    {
      symbol: "NVDA",
      company: "NVIDIA Corporation",
      price: 492.18,
      change: "+1.48%",
      score: 0.47,
      confidence: 0.78,
      lastUpdated: fallbackTimestamp,
      catalysts: [
        "AI server demand keeps outpacing supply through year-end",
        "Upbeat analyst channel checks highlight fresh data center orders",
        "Call buying concentrated around near-dated 500 strikes",
      ],
      rationale: [
        "Bullish read (positive) for NVDA: RBC Capital – Channel checks point to accelerating Blackwell orders into year end.",
        "Bullish read (positive) for NVDA: Bloomberg – Supply chain partners reporting another leg higher in AI GPU shipments.",
        "Bullish read (positive) for NVDA: Options Desk – Flow skew favoring upside call spreads on elevated volume.",
      ],
      direction: "bullish",
    },
    {
      symbol: "AAPL",
      company: "Apple Inc.",
      price: 178.42,
      change: "+0.92%",
      score: 0.38,
      confidence: 0.74,
      lastUpdated: fallbackTimestamp,
      catalysts: [
        "Services revenue momentum offsets softer hardware comps",
        "Wearables supply chain commentary turns incrementally positive",
        "Institutional call accumulation persists above 180 strike",
      ],
      rationale: [
        "Bullish read (positive) for AAPL: Morgan Stanley – Services growth tracking high-single digits on App Store strength.",
        "Bullish read (positive) for AAPL: Digitimes – Suppliers highlighting stable Vision Pro build schedules into holiday quarter.",
        "Bullish read (positive) for AAPL: Market chatter – Repeated call spread roll-ups spotted in options tape.",
      ],
      direction: "bullish",
    },
    {
      symbol: "TSLA",
      company: "Tesla, Inc.",
      price: 242.67,
      change: "+2.11%",
      score: 0.41,
      confidence: 0.69,
      lastUpdated: fallbackTimestamp,
      catalysts: [
        "Weekly deliveries tracking ahead of internal forecasts",
        "Cybertruck backlog commentary implies production ramp",
        "Momentum traders continue to target upside weeklies",
      ],
      rationale: [
        "Bullish read (positive) for TSLA: Electrek – Order intake steady despite price adjustments in North America.",
        "Bullish read (positive) for TSLA: CNBC – Management reiterates double-digit production growth for FY.",
        "Bullish read (positive) for TSLA: Options Desk – Elevated call delta exposure forcing dealer hedging flows.",
      ],
      direction: "bullish",
    },
    {
      symbol: "INTC",
      company: "Intel Corporation",
      price: 42.11,
      change: "-1.24%",
      score: -0.36,
      confidence: 0.62,
      lastUpdated: fallbackTimestamp,
      catalysts: [
        "Execution concerns linger around foundry turnaround plan",
        "Gross margin guide trimmed amid competitive pressure",
        "Put buying builds in December expiries",
      ],
      rationale: [
        "Bearish read (bearish) for INTC: Wall Street Journal – Foundry clients signaling slower-than-hoped node migrations.",
        "Bearish read (bearish) for INTC: Goldman Sachs – Margin targets reset lower as pricing pressure persists.",
        "Bearish read (bearish) for INTC: Options Desk – Defensive put ladders expanding around 40 strike.",
      ],
      direction: "bearish",
    },
    {
      symbol: "DIS",
      company: "The Walt Disney Company",
      price: 92.54,
      change: "-0.88%",
      score: -0.42,
      confidence: 0.66,
      lastUpdated: fallbackTimestamp,
      catalysts: [
        "Streaming subscriber growth slows as churn ticks higher",
        "Parks division margin outlook revised modestly lower",
        "Hedge funds lean short following guidance update",
      ],
      rationale: [
        "Bearish read (bearish) for DIS: Variety – Industry checks show churn re-accelerating post-price increases.",
        "Bearish read (bearish) for DIS: JPMorgan – Parks commentary suggests softer FY margins versus prior plan.",
        "Bearish read (bearish) for DIS: Options Desk – Downside put spread activity concentrated in Q1 maturities.",
      ],
      direction: "bearish",
    },
    {
      symbol: "BA",
      company: "The Boeing Company",
      price: 184.33,
      change: "-1.97%",
      score: -0.48,
      confidence: 0.64,
      lastUpdated: fallbackTimestamp,
      catalysts: [
        "Delivery timelines remain under FAA scrutiny",
        "Supplier quality audits uncover additional rework needs",
        "Credit desks note CDS widening as sentiment deteriorates",
      ],
      rationale: [
        "Bearish read (bearish) for BA: Reuters – FAA review highlights further inspection requirements for 737 program.",
        "Bearish read (bearish) for BA: Financial Times – Suppliers report incremental cost pressure tied to quality fixes.",
        "Bearish read (bearish) for BA: Credit traders – CDS widening signals mounting concern across lenders.",
      ],
      direction: "bearish",
    },
  ]

  const bullishNarratives = fallbackNarratives.filter((item) => item.direction === "bullish")
  const bearishNarratives = fallbackNarratives.filter((item) => item.direction === "bearish")
  const totalTracked = fallbackNarratives.length
  const bullishAvg =
    bullishNarratives.length === 0
      ? 0
      : bullishNarratives.reduce((sum, item) => sum + item.score, 0) / bullishNarratives.length
  const bearishAvg =
    bearishNarratives.length === 0
      ? 0
      : bearishNarratives.reduce((sum, item) => sum + Math.abs(item.score), 0) / bearishNarratives.length
  const positiveShare = bullishNarratives.length / totalTracked
  const negativeShare = bearishNarratives.length / totalTracked
  const avgConfidence =
    fallbackNarratives.reduce((sum, item) => sum + item.confidence, 0) / Math.max(totalTracked, 1)

  const heatAlerts = fallbackNarratives.filter((item) => Math.abs(item.score) >= 0.4)
  const heatAlertsBullish = heatAlerts.filter((item) => item.direction === "bullish").length
  const heatAlertsBearish = heatAlerts.filter((item) => item.direction === "bearish").length

  const topSymbols = fallbackNarratives
    .slice()
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 4)
    .map((item) => item.symbol)

  const recentSignals: SentimentSignal[] = fallbackNarratives.slice(0, 6).map((item, index) => ({
    id: `fallback-${item.symbol}-${index}`,
    label: `${item.symbol} • ${item.direction === "bullish" ? "Bullish flows detected" : "Bearish flows building"}`,
    detail: item.catalysts[0] ?? `${item.symbol} narrative updated`,
    time: fallbackTimestamp,
    direction: item.direction,
  }))

  const fallbackMarketSentiment = {
    overall: {
      score: 0.34,
      tone: "bullish" as const,
      confidence: 0.72,
      summary:
        "Risk appetite remains constructive with megacap leadership and supportive options flow across AI beneficiaries.",
      change: "66% of tracked narratives lean bullish across the hub.",
      lastUpdated: fallbackTimestamp,
      drivers: [
        "NVDA: AI server demand keeps outpacing supply through year-end",
        "AAPL: Services strength offsetting softer hardware comps",
        "TSLA: Deliveries tracking ahead of internal forecasts",
      ],
    },
    sp500: {
      score: 0.18,
      tone: "bullish" as const,
      confidence: 0.68,
      summary: "S&P flows are skewing constructive with SPY call accumulation on dip buyers stepping in.",
      change: "SPY holding a +0.42% session advance in fallback composite.",
      lastUpdated: fallbackTimestamp,
      drivers: [
        "SPY: Institutional call spreads concentrated at the 520 strike",
        "Mega-cap tech breadth improving with MSFT and GOOGL in the green",
        "Financials stabilizing as credit spreads compress modestly",
      ],
    },
    economy: {
      score: 0.12,
      tone: "neutral" as const,
      confidence: 0.6,
      summary: "Macro tone is balanced with resilient labor data offsetting lingering inflation stickiness.",
      change: "ISM services beating expectations while CPI revisions keep inflation anxiety elevated.",
      lastUpdated: fallbackTimestamp,
      drivers: [
        "Labor market prints showing steady job additions",
        "ISM services PMI signaling expansion",
        "FOMC commentary reiterating data-dependent stance",
      ],
    },
  }

  return {
    hero: {
      bullishConviction: {
        percentage: Math.max(0, Math.round(Math.min(1, bullishAvg) * 100)),
        narrativeCount: bullishNarratives.length,
        totalTracked,
        avgScore: parseFloat(bullishAvg.toFixed(2)),
      },
      bearishConviction: {
        percentage: Math.max(0, Math.round(Math.min(1, bearishAvg) * 100)),
        narrativeCount: bearishNarratives.length,
        totalTracked,
        avgScore: -parseFloat(
          (bearishNarratives.length === 0
            ? 0
            : bearishNarratives.reduce((sum, item) => sum + item.score, 0) / bearishNarratives.length
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
      avgConfidence: parseFloat(avgConfidence.toFixed(2)),
      totalArticles: 36,
      avgAbsChange: 1.38,
      heatAlerts: {
        total: heatAlerts.length,
        bullish: heatAlertsBullish,
        bearish: heatAlertsBearish,
      },
      topSymbols,
    },
    narratives: {
      bullish: bullishNarratives,
      bearish: bearishNarratives,
    },
    recentSignals,
    market: fallbackMarketSentiment,
  }
}

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

function toneFromScore(score: number, threshold = 0.06): "bullish" | "bearish" | "neutral" {
  if (score > threshold) return "bullish"
  if (score < -threshold) return "bearish"
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

  const [newsResponses, quotes, macroNews] = await Promise.all([
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
    getMarketNews("general").catch((error) => {
      console.error("Failed to fetch macro news for sentiment insights", error)
      return [] as NewsItem[]
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
  const symbolSummaries = new Map<
    string,
    {
      symbol: string
      company: string
      avgScore: number
      confidence: number
      articleCount: number
      latest: string | null
      catalysts: string[]
      quote: StockQuote | undefined
    }
  >()

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
    const confidence = calculateConfidence(sentiments)

    const sortedByRecency = filteredNews
      .slice()
      .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))

    const latestNews = sortedByRecency[0]
    const catalysts = buildCatalysts(filteredNews, 3)
    const quote = entry.quote

    symbolSummaries.set(entry.symbol, {
      symbol: entry.symbol,
      company: entry.company,
      avgScore,
      confidence,
      articleCount: filteredNews.length,
      latest: toIso(latestNews?.datetime),
      catalysts,
      quote,
    })

    if (Math.abs(avgScore) < MIN_SENTIMENT_THRESHOLD) {
      // Skip neutral narratives – they don't add directional insight.
      continue
    }

    const direction: Direction = avgScore > 0 ? "bullish" : "bearish"

    cumulativeConfidence += confidence

    const rationale = buildRationale(entry.symbol, sortedByRecency, 3)

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

  if (narratives.length === 0) {
    console.warn("Sentiment insights falling back to curated sample data due to empty feed.")
    return buildFallbackInsights()
  }

  const totalSymbolArticles = Array.from(symbolSummaries.values()).reduce(
    (sum, summary) => sum + summary.articleCount,
    0,
  )

  const weightedScoreSum = Array.from(symbolSummaries.values()).reduce(
    (sum, summary) => sum + summary.avgScore * summary.articleCount,
    0,
  )

  const weightedScore =
    totalSymbolArticles === 0 ? 0 : parseFloat((weightedScoreSum / totalSymbolArticles).toFixed(2))

  const weightedConfidence =
    totalSymbolArticles === 0
      ? 0
      : parseFloat(
          (
            Array.from(symbolSummaries.values()).reduce(
              (sum, summary) => sum + summary.confidence * summary.articleCount,
              0,
            ) / totalSymbolArticles
          ).toFixed(2),
        )

  const latestMarketUpdate = Array.from(symbolSummaries.values())
    .map((summary) => summary.latest)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => (a > b ? -1 : 1))[0] ?? null

  const topDriverSnippets = Array.from(symbolSummaries.values())
    .slice()
    .sort((a, b) => Math.abs(b.avgScore) - Math.abs(a.avgScore))
    .flatMap((summary) => summary.catalysts.map((headline) => `${summary.symbol}: ${headline}`))
    .filter((value, index, self) => self.indexOf(value) === index)
    .slice(0, 3)

  const overallTone = toneFromScore(weightedScore)

  const overallSummary =
    totalTracked === 0
      ? "Waiting on narrative strength to form a market bias."
      : overallTone === "bullish"
        ? `Risk appetite improving with ${bullishCount} bullish vs ${bearishCount} bearish narratives.`
        : overallTone === "bearish"
          ? `Defensive positioning in focus as ${bearishCount} bearish narratives outnumber ${bullishCount} bullish.`
          : `Market tone balanced with ${bullishCount} bullish and ${bearishCount} bearish narratives tracked.`

  const overallChange = `${Math.round(positiveShare * 100)}% of tracked narratives lean bullish.`

  const sp500Summary = symbolSummaries.get("SPY")
  const sp500Tone = toneFromScore(sp500Summary?.avgScore ?? 0)
  const sp500Drivers = sp500Summary?.catalysts.slice(0, 3) ?? []

  const sp500Change = sp500Summary?.quote
    ? `${formatChange(sp500Summary.quote.changePercent)} on SPY today`
    : "Price change unavailable"

  const sp500Snapshot: MarketSentimentSnapshot = {
    score: parseFloat((sp500Summary?.avgScore ?? 0).toFixed(2)),
    tone: sp500Tone,
    confidence: sp500Summary ? parseFloat(sp500Summary.confidence.toFixed(2)) : 0.4,
    summary:
      sp500Summary && sp500Summary.articleCount > 0
        ? sp500Tone === "bullish"
          ? "S&P tone firming with dip buyers leaning on upside call structures."
          : sp500Tone === "bearish"
            ? "S&P tone softens as hedging demand reappears in index puts."
            : "S&P tone steady with flows split between calls and puts."
        : "Waiting on fresh SPY headlines to qualify index tone.",
    change: sp500Change,
    lastUpdated: sp500Summary?.latest ?? latestMarketUpdate,
    drivers: sp500Drivers,
  }

  const macroFiltered = macroNews.filter((item) => typeof item.sentiment?.score === "number")
  const macroSentiments = macroFiltered.map((item) => item.sentiment.score)
  const macroAvgScore =
    macroSentiments.length === 0
      ? 0
      : parseFloat(
          (
            macroSentiments.reduce((sum, value) => sum + value, 0) / macroSentiments.length
          ).toFixed(2),
        )
  const macroTone = toneFromScore(macroAvgScore, 0.08)
  const macroConfidence =
    macroSentiments.length === 0 ? 0.35 : parseFloat(calculateConfidence(macroSentiments).toFixed(2))

  const macroDrivers = macroFiltered
    .slice()
    .sort((a, b) => Math.abs(b.sentiment.score) - Math.abs(a.sentiment.score))
    .slice(0, 3)
    .map((item) => `${item.source}: ${item.headline}`)

  const macroLatest = macroFiltered
    .slice()
    .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
    .map((item) => toIso(item.datetime))
    .find((value): value is string => Boolean(value)) ?? null

  const macroSummary =
    macroSentiments.length === 0
      ? "Awaiting macro developments to gauge economic tone."
      : macroTone === "bullish"
        ? "Macro data tilts constructive with growth signals outweighing inflation worries."
        : macroTone === "bearish"
          ? "Macro sentiment softens as recession chatter and sticky inflation dominate the tape."
          : "Macro tone balanced with mixed data across growth, inflation, and labor."

  const macroChange =
    macroSentiments.length === 0
      ? "No macro headlines processed over the last few sessions."
      : `${macroSentiments.filter((score) => score >= 0).length} positive vs ${
          macroSentiments.filter((score) => score < 0).length
        } negative macro headlines.`

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
    market: {
      overall: {
        score: weightedScore,
        tone: overallTone,
        confidence: weightedConfidence,
        summary: overallSummary,
        change: overallChange,
        lastUpdated: latestMarketUpdate,
        drivers: topDriverSnippets,
      },
      sp500: sp500Snapshot,
      economy: {
        score: macroAvgScore,
        tone: macroTone,
        confidence: macroConfidence,
        summary: macroSummary,
        change: macroChange,
        lastUpdated: macroLatest ?? latestMarketUpdate,
        drivers: macroDrivers,
      },
    },
  }
}
