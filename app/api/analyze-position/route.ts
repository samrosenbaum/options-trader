import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 30

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface PositionAnalysisRequest {
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
  days_held: number
  days_until_expiration: number
}

export async function POST(request: NextRequest) {
  try {
    const body: PositionAnalysisRequest = await request.json()

    const positionSummary = `
Position Details:
- Symbol: ${body.symbol}
- Type: ${body.option_type.toUpperCase()}
- Strike: $${body.strike}
- Contracts: ${body.contracts}
- Expiration: ${body.expiration} (${body.days_until_expiration} days left)

Entry:
- Entry Price: $${body.entry_price}
- Entry Date: ${body.entry_date} (${body.days_held} days ago)
- Stock Price at Entry: $${body.entry_stock_price}
- Entry Delta: ${body.entry_delta || 'N/A'}
- Entry Theta: ${body.entry_theta || 'N/A'}

Current Status:
- Current Option Price: ${body.current_price ? `$${body.current_price}` : 'N/A'}
- Current Stock Price: ${body.current_stock_price ? `$${body.current_stock_price}` : 'N/A'}
- Unrealized P&L: ${body.unrealized_pl ? `$${body.unrealized_pl.toFixed(2)} (${body.unrealized_pl_percent?.toFixed(1)}%)` : 'N/A'}
- Current Delta: ${body.current_delta || 'N/A'}
- Current Theta: ${body.current_theta || 'N/A'}

Exit Signals:
- Signal: ${body.exit_signal || 'No signal'}
- Urgency: ${body.exit_urgency_score ? `${body.exit_urgency_score}/100` : 'N/A'}
- Reasons: ${body.exit_reasons?.join(', ') || 'None'}
`

    const prompt = `You are Monty, an expert options trading analyst. Analyze this position and provide actionable analysis.
You speak like a trusted friend who happens to be a quant genius—approachable first, then deeply analytical.

VOICE & DELIVERY GUIDELINES
- Start with the direct answer or primary recommendation in plain English so the trader immediately knows your call.
- Follow with a "Why this works" or "Receipts" section that cites the supporting math (Greeks, probabilities, risk metrics, catalysts).
- Keep the tone encouraging yet candid. Celebrate good setups, but flag problems clearly and explain the landmines.
- Offer to dig into deeper math if they want it—Monty is a retail trader's best friend, so make the path from simple explanation to advanced detail obvious.

${positionSummary}

Provide a comprehensive analysis covering:

1. **Position Health Assessment**
   - Is this position salvageable or should I cut losses?
   - What do the Greeks tell us about recovery probability?

2. **Recovery Probability**
   - Can this realistically recover before expiration?
   - What stock price movement is needed?
   - Is there enough time given current Theta decay?

3. **Action Recommendations**
   Choose ONE primary recommendation and explain why:
   - **HOLD**: Keep the position, explain timeframe for reassessment
   - **EXIT NOW**: Cut losses, explain why recovery is unlikely
   - **DOUBLE DOWN**: Average down by buying more, explain optimal strike/expiration
   - **ROLL**: Close this and open a new position (specify details)

4. **If Doubling Down Makes Sense**
   - Suggested strike price and expiration
   - Why this would improve the position
   - Total capital at risk
   - New breakeven price

5. **Risk Factors**
   - Key risks if holding
   - What could go wrong with doubling down
   - Maximum loss scenarios

Be direct, specific, and actionable. If the position looks bad, say so clearly. If there's opportunity, explain the thesis concisely.

Format your response in clear markdown with headers and bullet points.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const analysis = message.content[0].type === 'text' ? message.content[0].text : ''

    return NextResponse.json({
      success: true,
      analysis,
    })
  } catch (error) {
    console.error('Position analysis error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to analyze position',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
