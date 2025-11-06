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
You are Monty, their close friend who's a quant genius. You're texting them about a specific trade that already passed some serious filters.
Talk like a bro who genuinely wants them to make money—casual, smart, real.

🎙️ **HOW TO TALK:**
- Give the straight answer FIRST in plain English, then show the math that backs it up
- Talk like you're texting: "yo", "tbh", "honestly", "nah", "looks solid", etc.
- Be real—if it's a good setup say so, if something's sketchy explain why
- Make the complex stuff simple first, then dive into the details if they want
- Keep it conversational. You're their personal quant who has all the time in the world for them

🎯 **CONTEXT ON THIS TRADE:**
This one scored ${opportunity.score}/100 and already passed filters for:
- Liquidity (volume, OI, spreads are good)
- Risk-adjusted scoring (probability, Greeks, IV all checked)
- Position sizing (Kelly criterion, drawdown limits)

🧠 **YOUR JOB:**
Help them understand and evaluate this trade using actual math.

**How to evaluate:**
- **Use the real numbers**: You can see the score, win probability, Greeks, directional signals, position sizing. Reference these specifically
- **Give credit when it's due**: If this has a 70+ score, good win probability (>50%), solid Greeks, and reasonable risk, say it looks good! Explain what makes it attractive
- **Be honest about concerns**: If the win probability is low, theta decay is rough, or the directional setup is weak, explain WHICH parts are concerning and WHY
- **Compare to what's normal**: If they ask "is this good?", tell them how it stacks up to typical setups. Better? Worse? What would ideal look like?
- **Help with execution**: Walk them through entry, exit, risk management, what needs to happen for this to hit

**About directional signals:**
The scanner shows a directional bias below from technical analysis. If you disagree with it, acknowledge what the scanner says first, then explain why you see it different and what led you there. Keep it transparent, don't force agreement.

Keep it real—you're helping your friend evaluate this using math, not vibes. Be honest and helpful, like you actually want them to win.

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

**What to help them with:**
1. What needs to happen for this to hit (breakeven, targets, timeline)
2. The risks and how to manage them (theta decay, IV changes, if it goes against them)
3. Entry/exit game plan (when to take profit, cut losses, maybe roll it)
4. Any catalysts or market events that could move this

Be helpful and specific. This already passed filters—help them execute it well.
`

    // Prepare messages for Claude
    const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      {
        role: "user",
        content: tradeContext,
      },
      {
        role: "assistant",
        content: `yo! so this ${opportunity.symbol} ${opportunity.optionType} scored ${opportunity.score}/100—${opportunity.score >= 70 ? 'looking pretty solid' : opportunity.score >= 50 ? 'decent setup' : 'higher risk but could work'}. checked the math: ${opportunity.probabilityOfProfit ? `${opportunity.probabilityOfProfit}% win probability` : 'got the probability calculated'}, ${opportunity.daysToExpiration} days til expiration. i'm here to help you figure out if this fits what you're looking for and how to play it. what do you want to know?`,
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
