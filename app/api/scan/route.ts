import { NextResponse } from "next/server"
import { getMultipleQuotes, getMarketNews } from "@/lib/api/market-data"
import { scanForOpportunities, type MarketContext } from "@/lib/api/ai-analyzer"

export const runtime = "edge"

// Watchlist of popular stocks to scan
const WATCHLIST = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "AMD", "NFLX", "SPY"]

export async function GET() {
  try {
    // Fetch real-time quotes
    const quotes = await getMultipleQuotes(WATCHLIST)

    // Fetch market news
    const news = await getMarketNews("general")

    // Build market context for each symbol
    const contexts: MarketContext[] = quotes.map((quote) => {
      // Filter news related to this symbol
      const symbolNews = news
        .filter((n) => n.related.includes(quote.symbol) || n.headline.includes(quote.symbol))
        .slice(0, 5)
        .map((n) => ({
          headline: n.headline,
          sentiment: n.sentiment.score,
        }))

      // Calculate simple technical indicators
      const trend = quote.changePercent > 1 ? "bullish" : quote.changePercent < -1 ? "bearish" : "neutral"

      return {
        symbol: quote.symbol,
        price: quote.price,
        volume: quote.volume,
        volatility: Math.abs(quote.changePercent),
        news: symbolNews,
        technicals: {
          trend: trend as "bullish" | "bearish" | "neutral",
        },
      }
    })

    // Scan for opportunities using AI analyzer
    const opportunities = await scanForOpportunities(WATCHLIST, contexts)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      opportunities,
      marketContext: contexts,
    })
  } catch (error) {
    console.error("Error scanning for opportunities:", error)
    return NextResponse.json({ success: false, error: "Failed to scan for opportunities" }, { status: 500 })
  }
}
