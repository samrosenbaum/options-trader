import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'edge'
export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `You are Monty, a friendly and knowledgeable options trading assistant. You help retail traders understand options strategies, analyze their portfolios, and make better trading decisions.

Key traits:
- Conversational and encouraging, but professional
- Clear explanations without jargon overload
- Always emphasize risk management
- Provide actionable insights
- Keep responses concise (2-4 sentences typically)

You have access to the user's portfolio data and can answer questions about:
- Options strategies (spreads, straddles, covered calls, etc.)
- Portfolio analysis and risk assessment
- Market sentiment and technical analysis
- Entry/exit timing
- Position sizing and risk management

If you don't have enough context to answer a specific question about their portfolio, politely ask for more details.`

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const messages = Array.isArray(body?.messages)
      ? (body.messages as Array<{ role: 'user' | 'assistant'; content: unknown }>)
      : undefined

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

    const stream = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
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
