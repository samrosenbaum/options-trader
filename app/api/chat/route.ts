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

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: Request) {
  try {
    const { message, history } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      )
    }

    // Build conversation history
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

    if (history && Array.isArray(history)) {
      history.forEach((msg: Message) => {
        messages.push({
          role: msg.role,
          content: msg.content,
        })
      })
    }

    // Add current message
    messages.push({
      role: 'user',
      content: message,
    })

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    })

    const assistantMessage = response.content[0]
    const text = assistantMessage.type === 'text' ? assistantMessage.text : ''

    return NextResponse.json({
      message: text,
      usage: response.usage,
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
