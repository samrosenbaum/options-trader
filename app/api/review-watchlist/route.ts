import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { calculatePortfolioGaps, getNeededPositionTypes } from "@/lib/portfolio-balance"

export const runtime = "nodejs"
export const maxDuration = 60

interface WatchlistItem {
  id: string
  symbol: string
  optionType: string
  strike: number
  premium: number
  score?: number | null
  riskLevel?: string | null
  daysToExpiration?: number | null
  tradeSummary?: string | null
  expiration: string
  addedAt: string
  currentPremium?: number | null
  plAmount?: number | null
  plPercent?: number | null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { items, priceData } = body as {
      items: WatchlistItem[]
      priceData?: Record<string, { currentPremium: number | null, plAmount: number | null, plPercent: number | null }>
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "No watchlist items provided" },
        { status: 400 }
      )
    }

    // Validate Anthropic API key
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      )
    }

    // Get portfolio balance data
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let portfolioContext = ""
    if (user) {
      const { data: positions } = await supabase
        .from('positions')
        .select('option_type, contracts, status')
        .eq('user_id', user.id)
        .eq('status', 'open')

      if (positions && positions.length > 0) {
        const gaps = calculatePortfolioGaps(positions)
        const neededTypes = getNeededPositionTypes(gaps)

        if (neededTypes.length > 0) {
          const neededDescriptions = gaps
            .filter(g => neededTypes.includes(g.key))
            .map(g => `${g.key.replace('_', ' ')} (currently ${g.actual.toFixed(1)}%, target ${g.percentage}%)`)
            .join(', ')

          portfolioContext = `\n\n📊 **PORTFOLIO BALANCE CONTEXT:**
Your portfolio needs more: ${neededDescriptions}
When comparing options, favor those that help balance your portfolio.`
        }
      }
    }

    const anthropic = new Anthropic({ apiKey })

    // Get market context
    let marketContext = ""
    try {
      const marketResponse = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=5d')
      const marketData = await marketResponse.json()

      if (marketData?.chart?.result?.[0]) {
        const result = marketData.chart.result[0]
        const meta = result.meta
        const spyPrice = meta.regularMarketPrice || meta.previousClose
        const spyChange = ((spyPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100).toFixed(2)

        const changeNum = parseFloat(spyChange)
        marketContext = `\n\n📈 **MARKET CONTEXT (${new Date().toLocaleDateString()}):**
- SPY: $${spyPrice.toFixed(2)} (${changeNum >= 0 ? '+' : ''}${spyChange}% today)
- Market is ${changeNum > 1 ? 'strongly bullish' : changeNum > 0.3 ? 'moderately bullish' : changeNum < -1 ? 'strongly bearish' : changeNum < -0.3 ? 'moderately bearish' : 'flat/choppy'}
- Consider this when evaluating directional plays`
      }
    } catch (err) {
      console.error('Failed to fetch market context:', err)
    }

    // Build watchlist context
    const watchlistContext = items.map((item, idx) => {
      const prices = priceData?.[item.id]
      const priceInfo = prices?.currentPremium
        ? `Current: $${prices.currentPremium.toFixed(2)} (${prices.plPercent !== null ? (prices.plPercent >= 0 ? '+' : '') + prices.plPercent.toFixed(1) + '%' : 'N/A'} P/L)`
        : ''

      return `
${idx + 1}. ${item.symbol} ${item.optionType.toUpperCase()} $${item.strike} (exp: ${item.expiration})
   - Entry Premium: $${item.premium.toFixed(2)} ${priceInfo}
   - Score: ${item.score ?? 'N/A'}/100
   - Risk: ${item.riskLevel ?? 'Unknown'}
   - Days to Exp: ${item.daysToExpiration ?? 'N/A'}
   - Thesis: ${item.tradeSummary || 'No summary provided'}
   - Added: ${new Date(item.addedAt).toLocaleDateString()}`
    }).join('\n')

    const systemPrompt = `You are Monty, an expert options strategist helping a trader prioritize their watchlist.
You sound like a trusted friend who is also a quant prodigy—friendly first, then deeply data-backed.

VOICE & DELIVERY
- Lead with the punchline: tell the trader exactly what to do right now in plain language.
- Immediately follow with a "Why this is the move" or "Receipts" section citing the key data (scores, DTE, portfolio balance, market context).
- Keep the tone encouraging but transparent—call out risks or weak setups without sugarcoating.
- Make it clear you're ready to dig deeper into the numbers if they want more detail. Monty is the retail trader's best friend, so demystify the quant thinking before you flex it.

The trader has ${items.length} options on their watchlist and needs help deciding which to enter NOW, which to wait on, and which to skip.${portfolioContext}${marketContext}

Your task:
1. **TIER THE OPPORTUNITIES** into 3-4 tiers:
   - 🔥 ENTER NOW: Best setups with compelling thesis RIGHT NOW
   - ⏰ WATCH CLOSELY: Good setups but wait for better entry or catalysts
   - 🤔 MAYBE LATER: Weaker setups, lower priority
   - ❌ SKIP: Poor risk/reward or thesis has degraded

2. **PROVIDE SPECIFIC REASONING** for each tier, considering:
   - Score quality and risk level
   - Time decay (DTE) - are they getting stale?
   - Price movement since added (if available)
   - Portfolio balance needs (if applicable)
   - Conflicting or redundant positions
   - Overall risk concentration

3. **BE DECISIVE BUT HONEST** - it's okay to say "none are compelling right now" if that's true

4. Keep it concise but actionable. Use bullet points. Be direct.

Here are the watchlist items:
${watchlistContext}`

    const userPrompt = `Review my watchlist and tell me:
1. Which option(s) should I enter RIGHT NOW and why?
2. Which should I keep watching but not enter yet?
3. Which should I remove from the watchlist?

Please be specific about priorities and reasoning. I need to make a decision today.`

    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 2000,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    })

    const assistantMessage = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("")

    return NextResponse.json({
      success: true,
      analysis: assistantMessage,
      itemsReviewed: items.length,
    })
  } catch (error) {
    console.error("Watchlist review error:", error)
    return NextResponse.json(
      { error: "Failed to review watchlist" },
      { status: 500 }
    )
  }
}
