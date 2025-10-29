import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface PositionPayload {
  symbol: string
  strike: number
  expiration: string
  option_type: 'call' | 'put'
  contracts: number
  entry_price: number
  entry_date: string
  entry_stock_price: number
  current_price: number | null
  current_stock_price: number | null
  unrealized_pl: number | null
  unrealized_pl_percent: number | null
  entry_delta: number | null
  entry_theta: number | null
  current_delta: number | null
  current_theta: number | null
  exit_signal: string | null
  exit_urgency_score: number | null
  exit_reasons: string[] | null
}

interface ChatAboutPositionRequest {
  messages: ChatMessage[]
  position: PositionPayload
}

const MS_IN_DAY = 1000 * 60 * 60 * 24

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'N/A'
  }
  return `$${value.toFixed(2)}`
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'N/A'
  }
  return `${value.toFixed(1)}%`
}

export async function POST(request: Request) {
  try {
    const body: ChatAboutPositionRequest = await request.json()
    const { messages, position } = body

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      )
    }

    const anthropic = new Anthropic({ apiKey })

    const now = new Date()
    const entryDate = new Date(position.entry_date)
    const expirationDate = new Date(position.expiration)

    const daysHeld = Number.isFinite(entryDate.getTime())
      ? Math.max(0, Math.floor((now.getTime() - entryDate.getTime()) / MS_IN_DAY))
      : 'N/A'

    const daysUntilExpiration = Number.isFinite(expirationDate.getTime())
      ? Math.max(0, Math.ceil((expirationDate.getTime() - now.getTime()) / MS_IN_DAY))
      : 'N/A'

    const exitReasons = Array.isArray(position.exit_reasons)
      ? position.exit_reasons.join(', ')
      : 'None provided'

    const positionSummary = `Current Position Overview
- Symbol: ${position.symbol}
- Contracts: ${position.contracts}
- Type: ${position.option_type.toUpperCase()}
- Strike: $${position.strike}
- Expiration: ${position.expiration} (${daysUntilExpiration} days remaining)

Entry Snapshot
- Entry Date: ${position.entry_date} (${daysHeld} days held)
- Entry Price: $${position.entry_price}
- Stock at Entry: $${position.entry_stock_price}
- Entry Greeks → Delta: ${position.entry_delta ?? 'N/A'}, Theta: ${position.entry_theta ?? 'N/A'}

Current Status
- Option Price: ${formatCurrency(position.current_price)}
- Stock Price: ${formatCurrency(position.current_stock_price)}
- Unrealized P&L: ${
      position.unrealized_pl !== null && position.unrealized_pl !== undefined
        ? `$${position.unrealized_pl.toFixed(2)} (${formatPercent(position.unrealized_pl_percent)})`
        : 'N/A'
    }
- Current Greeks → Delta: ${position.current_delta ?? 'N/A'}, Theta: ${position.current_theta ?? 'N/A'}

Exit Signals
- Signal: ${position.exit_signal ?? 'None'}
- Urgency Score: ${position.exit_urgency_score ?? 'N/A'}
- Reasons: ${exitReasons}`

    const systemPrompt = `You are Monty, an institutional-grade options trading analyst. The user is already in this position and wants practical guidance. Respond like a senior analyst on a trading desk.

When you provide analysis:
- Interpret the exit signal data above (urgency, reasons) and weigh it against the position's Greeks and time left.
- Offer a clear primary recommendation (hold, exit, roll, hedge, adjust size) and explain the trade-offs.
- Share specific risk checkpoints (price levels, time triggers, volatility events) the trader should monitor.
- If you suggest adjustments, provide concrete strikes, expirations, or hedges.
- Invite follow-up questions and maintain continuity across the conversation.

Keep responses concise, structured with markdown, and laser-focused on actionable next steps.`

    const claudeMessages: ChatMessage[] = [
      { role: 'user', content: `${systemPrompt}\n\n${positionSummary}` },
      {
        role: 'assistant',
        content: `Understood. I'll keep referencing this ${position.symbol} ${position.option_type.toUpperCase()} position as we chat. What would you like to tackle first?`,
      },
      ...messages,
    ]

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: claudeMessages,
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
    console.error('Error in chat-about-position:', error)
    return NextResponse.json(
      {
        error: 'Failed to chat about position',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
