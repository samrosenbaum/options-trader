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
    probabilityOfProfit: number
    expectedMoveReturn: number
    maxReturn: number
    riskLevel: string
    directionalBias?: {
      direction: string
      confidence: number
      score: number
    }
    positionSizing?: {
      recommendedFraction: number
      expectedEdge: number
      kellyFraction: number
      riskBudgetTier: string
      rationale: string[]
    }
    greeks?: {
      delta: number
      gamma: number
      theta: number
      vega: number
    }
    tradeSummary?: string
    daysToExpiration?: number
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
You are a helpful options trading advisor analyzing this specific trade opportunity:

**Trade Details:**
- Symbol: ${opportunity.symbol}
- Option Type: ${opportunity.optionType.toUpperCase()}
- Strike: $${opportunity.strike}
- Current Stock Price: $${opportunity.stockPrice}
- Premium: $${opportunity.premium} (per contract)
- Expiration: ${opportunity.expiration}
- Days to Expiration: ${opportunity.daysToExpiration || "N/A"}
- Trade Summary: ${opportunity.tradeSummary || "N/A"}

**Scoring & Probability:**
- Scanner Score: ${opportunity.score}/100
- Probability of Profit: ${opportunity.probabilityOfProfit}%
- Expected Move Return: ${opportunity.expectedMoveReturn}%
- Max Potential Return: ${opportunity.maxReturn}%
- Risk Level: ${opportunity.riskLevel}

${opportunity.directionalBias ? `**Directional Analysis:**
- Direction: ${opportunity.directionalBias.direction} (${opportunity.directionalBias.confidence}% confidence)
- Signal Score: ${opportunity.directionalBias.score}` : ""}

${opportunity.positionSizing ? `**Position Sizing (Kelly Criterion):**
- Recommended Allocation: ${(opportunity.positionSizing.recommendedFraction * 100).toFixed(2)}%
- Expected Edge: ${(opportunity.positionSizing.expectedEdge * 100).toFixed(2)}%
- Kelly Fraction: ${(opportunity.positionSizing.kellyFraction * 100).toFixed(2)}%
- Risk Tier: ${opportunity.positionSizing.riskBudgetTier}
- Rationale: ${opportunity.positionSizing.rationale.join(" ")}` : ""}

${opportunity.greeks ? `**Greeks:**
- Delta: ${opportunity.greeks.delta.toFixed(4)}
- Gamma: ${opportunity.greeks.gamma.toFixed(4)}
- Theta: ${opportunity.greeks.theta.toFixed(4)} (daily decay)
- Vega: ${opportunity.greeks.vega.toFixed(4)}` : ""}

Answer the user's questions about this trade with clear, actionable advice. Consider:
- Risk/reward profile
- What needs to happen for profit
- Market conditions and catalysts
- Position sizing recommendations
- Entry/exit strategies
- Potential pitfalls

Be honest about risks and negative expected value when present. Help the user make informed decisions.
`

    // Prepare messages for Claude
    const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      {
        role: "user",
        content: tradeContext,
      },
      {
        role: "assistant",
        content: "I understand the trade details. I'm ready to answer your questions about this opportunity. What would you like to know?",
      },
      ...messages,
    ]

    // Stream response from Claude
    const stream = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
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
