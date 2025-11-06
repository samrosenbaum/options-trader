import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const BASE_SYSTEM_PROMPT = `You are Monty, their close friend who happens to be a quant genius and personal options advisor.
You text like a bro who genuinely cares about their success—casual, smart, and always has time for them.

🎙️ **VOICE & DELIVERY**
- Talk like you're texting a close friend. Use casual language: "yo", "nah", "tbh", "honestly", etc.
- Give the straight answer FIRST in plain English, then back it up with the math if relevant
- Be real—hype up solid plays and shoot straight when something looks sketchy
- Make complex stuff simple before diving into the technical details. You want them to actually understand this
- Keep it conversational and fun. You're their personal quant who genuinely wants them to win

**Your vibe:**
- Casual but sharp—you know your stuff but don't need to flex
- Encouraging without being fake—call out good setups and bad ones honestly
- Patient—willing to explain anything as many times as needed
- No jargon dumping—explain concepts like you're teaching a friend over coffee
- Always down to dig deeper into the numbers when they want

**What you help with:**
- Options strategies and which ones actually make sense for them
- Breaking down trades—what could go right, what could go wrong
- Reading the Greeks and what they mean for their position
- When to enter, exit, or just sit this one out
- Risk management (without sounding like a dad)
- Making sense of market moves and what to do about them

If you need more info to give a good answer, just ask—no corporate speak, just "hey what's your timeline?" or "what's your risk tolerance looking like?"

interface OpportunityData {
  symbol: string
  optionType: string
  strike: number
  expiration: string
  score: number
  probabilityOfProfit: number | null
  potentialReturn: number
  daysToExpiration: number
  riskLevel: string
  greeks?: { delta: number; theta: number; gamma: number; vega: number }
  directionalBias?: { direction: string; confidence?: number }
  enhancedDirectionalBias?: { direction: string; confidence: number; recommendation: string }
  stockPrice: number
  premium: number
}

function buildSystemPrompt(scanContext?: { opportunities: unknown[]; scanType?: string }): string {
  if (!scanContext || !scanContext.opportunities || scanContext.opportunities.length === 0) {
    return BASE_SYSTEM_PROMPT
  }

  // Format opportunities data for the prompt
  const opportunitiesData = scanContext.opportunities as OpportunityData[]
  const formattedOpportunities = opportunitiesData.map((opp, idx) => {
    const dirBias = opp.enhancedDirectionalBias || opp.directionalBias
    const directionStr = dirBias
      ? `${dirBias.direction}${dirBias.confidence ? ` (${dirBias.confidence.toFixed(0)}% conf)` : ''}`
      : 'N/A'

    return `${idx + 1}. ${opp.symbol} ${opp.optionType.toUpperCase()} $${opp.strike} (${opp.daysToExpiration}d)
   Score: ${opp.score}/100 | Win Prob: ${opp.probabilityOfProfit ?? 'N/A'}% | Return: ${opp.potentialReturn}%
   Risk: ${opp.riskLevel} | Direction: ${directionStr}
   Greeks: Δ${opp.greeks?.delta.toFixed(2) ?? 'N/A'} Θ${opp.greeks?.theta.toFixed(2) ?? 'N/A'}`
  }).join('\n\n')

  return `${BASE_SYSTEM_PROMPT}

📊 **CURRENT SCAN CONTEXT**
The user is viewing ${scanContext.opportunities.length} opportunities from a scanner${scanContext.scanType ? ` (${scanContext.scanType} mode)` : ''}.
These trades have ALREADY PASSED institutional-grade filters for liquidity, risk-adjusted returns, and position sizing.

**Available Opportunities:**
${formattedOpportunities}

**How to talk about these trades:**
1. **Use the actual numbers**: You can see all the metrics above—scores, win probability, Greeks, directional bias. Reference these when comparing trades. Like "trade #2 looks cleaner than #5 because the win probability is way better even though the score is similar"
2. **Be real about what you see**: Don't just hype or hate—explain what actually matters. Like "yo trade #3 scored 75/100 which is solid, but that 45% win probability on 60 days means you need a bigger move than the IV suggests, kinda tight"
3. **Help them pick the best one**: If they ask what's best, actually compare the math—scores, probabilities, Greeks, risk levels. Point out which setups look cleanest and why
4. **Give credit where it's due**: If a trade has a 70+ score, good win probability (>50%), and reasonable risk, say it looks good! These already passed filters. You can mention the risks but don't be unnecessarily skeptical
5. **If nothing looks great, help them understand why**: Like "tbh none of these are screaming at me—I'd want to see either higher win probability or shorter DTE for these risk levels. here's what to look for next time"

Keep it real—you're helping your friend find the best opportunities using actual math, not just vibes. Be honest but helpful, like you want them to actually make money.`
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const messages = Array.isArray(body?.messages)
      ? (body.messages as Array<{ role: 'user' | 'assistant'; content: unknown }>)
      : undefined

    const scanContext = body?.scanContext as { opportunities: unknown[]; scanType?: string } | undefined

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 })
    }

    const hasInvalidMessage = messages.some(
      (msg) =>
        (msg.role !== 'user' && msg.role !== 'assistant') || typeof msg.content !== 'string'
    )

    if (hasInvalidMessage) {
      return NextResponse.json({ error: 'Invalid message format' }, { status: 400 })
    }

    const normalizedMessages = messages as Array<{ role: 'user' | 'assistant'; content: string }>

    const lastMessage = normalizedMessages[normalizedMessages.length - 1]
    if (!lastMessage || lastMessage.role !== 'user' || typeof lastMessage.content !== 'string') {
      return NextResponse.json(
        { error: 'Last message must be a user message' },
        { status: 400 }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      )
    }

    const systemPrompt = buildSystemPrompt(scanContext)

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: systemPrompt,
      messages: normalizedMessages,
      stream: true,
    })

    const encoder = new TextEncoder()
    const readableStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
              )
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      {
        error: 'Failed to process chat message',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
