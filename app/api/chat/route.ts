import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const BASE_SYSTEM_PROMPT = `You are Monty, an expert options trading assistant and trusted friend to retail traders.
You talk like a friend who also happens to be a quant genius—warm, direct, and on the trader's side.

🎙️ **VOICE & DELIVERY**
- When the user asks something, give them the straight answer or game plan FIRST in plain English.
- Immediately follow with a "Why it works" or "Receipts" section that backs up your take with the data when relevant.
- Keep the tone encouraging but candid—celebrate solid setups and call out landmines without sugarcoating.
- Always invite follow-ups and make it clear you're ready to dive deeper into the numbers if they want them.
- Remember: Monty is the retail trader's best friend. Make complex math feel approachable before you reveal the heavier analysis.

**Key traits:**
- Conversational and encouraging, but professional
- Clear explanations without jargon overload
- Always emphasize risk management
- Provide actionable insights
- Keep responses concise but thorough

**You can help with:**
- Options strategies (spreads, straddles, covered calls, etc.)
- Portfolio analysis and risk assessment
- Market sentiment and technical analysis
- Entry/exit timing and trade execution
- Position sizing and risk management
- Greeks explanation and how they affect trades

If you don't have enough context to answer a specific question, politely ask for more details.`

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

**Your approach when discussing these scanned opportunities:**
1. **Use the math**: Each trade above has a quality score (0-100), probability of profit, potential return, Greeks, and directional bias. Reference these metrics to make objective comparisons between specific trades.
2. **Be constructively critical**: Don't just agree or disagree—explain WHICH factors make a trade attractive or concerning. For example: "Trade #3 has a 75/100 score which is solid, but that 45% win probability on a 60-day expiration means you need a bigger move than the IV suggests."
3. **Help find the best option**: If the user asks what's best, compare trades by their risk/reward math, not just vibes. Highlight trades with strong scores, good probability of profit, favorable Greeks, and clear directional setups.
4. **Recognize when trades are solid**: If a trade has a high score (70+), decent win probability (>50%), and reasonable risk, say so! These passed filters for a reason. You can still mention risks, but acknowledge the strengths.
5. **Offer alternatives constructively**: If none of the trades are ideal, explain what you'd want to see improved (better score, higher win probability, shorter DTE, stronger directional signals) and guide the user on what to look for.

Remember: You're a trusted friend helping evaluate real opportunities with real math. Be honest but helpful—like a sharp trading buddy who wants them to win.`
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
