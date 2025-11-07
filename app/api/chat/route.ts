import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'edge'
export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// CORS headers for Chrome extension
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Handle OPTIONS preflight request
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  })
}

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

Special capabilities:
- You can analyze screenshots of the user's Robinhood portfolio to extract position data
- When analyzing screenshots, extract structured data including ticker, quantity, type, prices, P&L, and option details
- For position extraction requests, return clean JSON arrays with no markdown formatting

If you don't have enough context to answer a specific question about their portfolio, politely ask for more details.`

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const messages = Array.isArray(body?.messages)
      ? (body.messages as Array<{ role: 'user' | 'assistant'; content: unknown }>)
      : undefined

    const screenshot = body?.screenshot as string | undefined

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400, headers: corsHeaders })
    }

    const hasInvalidMessage = messages.some(
      (msg) =>
        (msg.role !== 'user' && msg.role !== 'assistant') || typeof msg.content !== 'string'
    )

    if (hasInvalidMessage) {
      return NextResponse.json({ error: 'Invalid message format' }, { status: 400, headers: corsHeaders })
    }

    // Type for message content (can be string or multimodal array)
    type MessageContent =
      | string
      | Array<{
          type: 'image';
          source: {
            type: 'base64';
            media_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
            data: string;
          };
        } | {
          type: 'text';
          text: string;
        }>;

    let normalizedMessages: Array<{ role: 'user' | 'assistant'; content: MessageContent }> = messages.map((msg) => ({
      role: msg.role,
      content: msg.content as string,
    }))

    // If screenshot is provided, convert the first message to multimodal format
    if (screenshot && normalizedMessages.length > 0) {
      const firstMessage = normalizedMessages[0]
      if (firstMessage.role === 'user' && typeof firstMessage.content === 'string') {
        // Extract base64 data from data URL
        const base64Match = screenshot.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/)
        if (base64Match) {
          const [, mediaType, base64Data] = base64Match

          // Convert to multimodal message with image
          normalizedMessages[0] = {
            role: 'user',
            content: [
              {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: `image/${mediaType}` as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
                  data: base64Data,
                },
              },
              {
                type: 'text' as const,
                text: firstMessage.content,
              },
            ],
          }
        }
      }
    }

    const lastMessage = normalizedMessages[normalizedMessages.length - 1]
    if (!lastMessage || lastMessage.role !== 'user') {
      return NextResponse.json(
        { error: 'Last message must be a user message' },
        { status: 400, headers: corsHeaders }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500, headers: corsHeaders }
      )
    }

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048, // Increased for vision responses
      system: SYSTEM_PROMPT,
      messages: normalizedMessages as any, // Type assertion for multimodal content
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
        ...corsHeaders,
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
      { status: 500, headers: corsHeaders }
    )
  }
}
