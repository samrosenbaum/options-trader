import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
  opportunity: {
    symbol: string
    optionType: string
    strike: number
    premium: number
    stockPrice: number
    expiration: string
    score: number
    probabilityOfProfit: number | null
    potentialReturn: number
    maxReturn: number
    riskLevel: string
    directionalBias?: {
      direction: string
      confidence?: number
      score?: number
    } | null
    enhancedDirectionalBias?: {
      direction: string
      confidence: number
      score: number
      recommendation: string
      signals?: Record<string, { score?: number; weight?: number; [key: string]: unknown }>
      timestamp?: string
    } | null
    positionSizing?: {
      recommendedFraction: number
      expectedEdge?: number
      kellyFraction: number
      riskBudgetTier: string
      rationale: string[]
    } | null
    greeks?: {
      delta: number
      gamma: number
      theta: number
      vega: number
    }
    tradeSummary?: string
    daysToExpiration: number
  }
}

export async function POST(request: Request) {
  try {
    const body: ChatRequest = await request.json()
    const { messages, opportunity } = body

    // Validate Anthropic API key
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      )
    }

    const anthropic = new Anthropic({ apiKey })

    // Build context about the trade
    const tradeContext = `
You are Monty, an expert options trade analyst helping users understand opportunities that have ALREADY PASSED strict institutional-grade filters.

🎯 **IMPORTANT CONTEXT:** This trade scored ${opportunity.score}/100 and passed rigorous filters including:
- Liquidity requirements (volume, open interest, bid-ask spread)
- Risk-adjusted scoring (probability, Greeks, implied volatility)
- Position sizing analysis (Kelly criterion, drawdown limits)

Your role is to help the user UNDERSTAND and EXECUTE this trade effectively. The scanner shows a directional bias below - if your analysis differs from this bias, ACKNOWLEDGE the scanner's view first, then explain WHY you see it differently and what information led you to a different conclusion. Be transparent about disagreements rather than forcing alignment.

**Trade Setup:**
- ${opportunity.symbol} ${opportunity.optionType.toUpperCase()} $${opportunity.strike} exp ${opportunity.expiration}
- Current Stock: $${opportunity.stockPrice} | Premium: $${(opportunity.premium / 100).toFixed(2)}/share
- Days to Expiration: ${opportunity.daysToExpiration || "N/A"}
${opportunity.tradeSummary ? `- Setup: ${opportunity.tradeSummary}` : ''}

**Scanner Analysis:**
- Quality Score: ${opportunity.score}/100 ⭐
- Win Probability: ${opportunity.probabilityOfProfit ?? "N/A"}%
- Potential Return: ${opportunity.potentialReturn}% (max ${opportunity.maxReturn}%)
- Risk Level: ${opportunity.riskLevel}

${opportunity.enhancedDirectionalBias || opportunity.directionalBias ? `**Directional Signal (from scanner's technical analysis):**
${opportunity.enhancedDirectionalBias ? `- ${opportunity.enhancedDirectionalBias.direction.toUpperCase()} bias with ${opportunity.enhancedDirectionalBias.confidence.toFixed(1)}% confidence (score: ${opportunity.enhancedDirectionalBias.score.toFixed(1)})
- Recommendation: ${opportunity.enhancedDirectionalBias.recommendation}
${opportunity.enhancedDirectionalBias.signals ? `- Individual Signal Scores:
${Object.entries(opportunity.enhancedDirectionalBias.signals).map(([name, data]) => `  • ${name}: ${data.score?.toFixed(1) || 'N/A'} (weight: ${data.weight?.toFixed(2) || 'N/A'})`).join('\n')}` : ''}
- Based on: Options flow (call/put volume ratio), IV skew analysis, price momentum (30d), and aggregated technical indicators` :
`- ${opportunity.directionalBias!.direction.toUpperCase()} bias${opportunity.directionalBias!.confidence ? ` with ${opportunity.directionalBias!.confidence}% confidence` : ''}${opportunity.directionalBias!.score ? ` (signal strength: ${opportunity.directionalBias!.score})` : ''}`}
- Note: Use this technical data in your analysis. If you reach a different conclusion, explain which factors led you there and how they might differ from or complement these technical signals.` : ""}

${opportunity.positionSizing ? `**Institutional Position Sizing:**
- Recommended: ${(opportunity.positionSizing.recommendedFraction * 100).toFixed(2)}% of portfolio
${opportunity.positionSizing.expectedEdge !== undefined && opportunity.positionSizing.expectedEdge >= 0 ? `- Positive Expected Edge: ${(opportunity.positionSizing.expectedEdge * 100).toFixed(2)}%` : ''}
- Risk Tier: ${opportunity.positionSizing.riskBudgetTier}
- Strategy: ${opportunity.positionSizing.rationale.join(" ")}` : ""}

${opportunity.greeks ? `**Greeks Snapshot:**
- Delta: ${opportunity.greeks.delta.toFixed(3)} | Theta: ${opportunity.greeks.theta.toFixed(3)}/day
- Gamma: ${opportunity.greeks.gamma.toFixed(4)} | Vega: ${opportunity.greeks.vega.toFixed(3)}` : ""}

**Your Mission:**
Help the user understand:
1. What needs to happen for this trade to win (breakeven, targets, timeline)
2. Key risks and how to manage them (theta decay, volatility changes, adverse moves)
3. Optimal entry/exit strategy (when to take profits, stop losses, roll options)
4. Market catalysts or events that could impact the trade

Be constructive, educational, and specific. This trade already passed the filters—focus on execution excellence.
`

    // Prepare messages for Claude
    const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      {
        role: "user",
        content: tradeContext,
      },
      {
        role: "assistant",
        content: `Got it! This ${opportunity.symbol} ${opportunity.optionType} trade scored ${opportunity.score}/100 and passed our institutional filters. I'm here to help you understand the setup and execute it well. What would you like to know?`,
      },
      ...messages,
    ]

    // Stream response from Claude
    const stream = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      messages: claudeMessages,
      stream: true,
    })

    // Create a ReadableStream to send to the client
    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              const text = event.delta.text
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("Error in chat-about-trade:", error)
    return NextResponse.json(
      {
        error: "Failed to process chat request",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
