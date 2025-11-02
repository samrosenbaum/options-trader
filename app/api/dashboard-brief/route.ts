import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMultipleQuotes, type StockQuote } from '@/lib/api/market-data'
import type { Database } from '@/lib/types/database.types'

export const runtime = 'nodejs'
export const maxDuration = 20

type PositionRow = Database['public']['Tables']['positions']['Row']

type InsightType = 'unusual_flow' | 'risk' | 'portfolio' | 'expiration' | 'market'

interface DashboardInsight {
  id: string
  type: InsightType
  text: string
  symbol?: string
  sentiment: 'positive' | 'negative' | 'neutral'
}

interface DashboardBriefResponse {
  success: true
  greeting: string
  marketSummary: string
  insights: DashboardInsight[]
  suggestedNextStep: string
  timestamp: string
  meta: {
    trackedSymbols: string[]
    indexMoves: Record<string, number | null>
  }
}

const INDEX_SYMBOLS = [
  { symbol: 'SPY', label: 'the S&P 500' },
  { symbol: 'QQQ', label: 'big-cap tech' },
  { symbol: 'IWM', label: 'small caps' }
]

function describePercentMove(changePercent: number | null | undefined): string | null {
  if (changePercent === null || changePercent === undefined || Number.isNaN(changePercent)) {
    return null
  }

  const rounded = Number(changePercent.toFixed(1))
  const direction = rounded >= 0 ? 'up' : 'down'
  const magnitude = Math.abs(rounded)

  if (magnitude < 0.2) {
    return `is basically flat (${rounded.toFixed(1)}%)`
  }

  if (magnitude < 0.8) {
    return `is ${direction} about ${magnitude.toFixed(1)}%`
  }

  if (magnitude < 1.5) {
    return `is ${direction === 'up' ? 'picking up steam' : 'coming under pressure'} (~${rounded.toFixed(1)}%)`
  }

  return `is ${direction === 'up' ? 'ripping' : 'getting hit hard'} (${rounded.toFixed(1)}%)`
}

function buildSuggestedNextStep(insights: DashboardInsight[]): string {
  if (insights.length === 0) {
    return "Nothing urgent jumped out—spin up the scanner and see what catches your eye first."
  }

  const priorityOrder: Record<InsightType, number> = {
    unusual_flow: 0,
    risk: 1,
    expiration: 2,
    portfolio: 3,
    market: 4
  }

  const [topInsight] = [...insights].sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type])

  switch (topInsight.type) {
    case 'unusual_flow':
      return topInsight.symbol
        ? `I'd start by opening up ${topInsight.symbol}—that flow is worth a closer look.`
        : 'The unusual flow call-out is the one to tackle first.'
    case 'risk':
      return topInsight.symbol
        ? `Give ${topInsight.symbol} a look before it bleeds further.`
        : 'Triage the biggest red position before it runs away from you.'
    case 'expiration':
      return topInsight.symbol
        ? `${topInsight.symbol} is running out of time—let's sort that one out first.`
        : 'You have contracts heading into expiry; review those before anything else.'
    case 'portfolio':
      return 'Take a minute to rebalance the book before hunting new trades.'
    case 'market':
    default:
      return 'Catch up on the macro move first so the rest of the day lines up.'
  }
}

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const [settingsResponse, positionsResponse] = await Promise.all([
      supabase
        .from('user_settings')
        .select('user_name')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('positions')
        .select('symbol, option_type, strike, expiration, contracts, tags, unrealized_pl, unrealized_pl_percent, updated_at')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('updated_at', { ascending: false })
    ])

    const userName = settingsResponse.data?.user_name || user.email || ''
    const firstName = userName.split(' ')[0] || 'there'

    const positions = (positionsResponse.data as PositionRow[] | null) ?? []

    const trackedSymbols = Array.from(
      new Set([
        ...positions.map((pos) => pos.symbol.toUpperCase()),
        ...INDEX_SYMBOLS.map((item) => item.symbol)
      ])
    )

    let quotes: StockQuote[] = []
    if (trackedSymbols.length > 0) {
      try {
        quotes = await getMultipleQuotes(trackedSymbols)
      } catch (error) {
        console.error('Failed to fetch quotes for dashboard brief:', error)
      }
    }

    const quotesMap = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]))

    const listFormatter = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })
    const marketSnippets = INDEX_SYMBOLS.map(({ symbol, label }) => {
      const quote = quotesMap.get(symbol)
      const description = describePercentMove(quote?.changePercent)
      return description ? `${label} ${description}` : null
    }).filter((item): item is string => Boolean(item))

    const marketSummary = marketSnippets.length > 0
      ? `While you were out, ${listFormatter.format(marketSnippets)}.`
      : 'While you were out the tape stayed pretty quiet.'

    const insights: DashboardInsight[] = []

    const unusualTaggedPositions = positions.filter((pos) => {
      const tags = (pos.tags as string[] | null) ?? []
      return tags.some((tag) => tag.toLowerCase().includes('unusual') || tag.toLowerCase().includes('smart-money') || tag.toLowerCase().includes('flow'))
    })

    if (unusualTaggedPositions.length > 0) {
      const focus = unusualTaggedPositions[0]
      const quote = quotesMap.get(focus.symbol.toUpperCase())
      const move = quote?.changePercent
      const moveText = typeof move === 'number' && !Number.isNaN(move)
        ? ` (${move >= 0 ? '+' : ''}${move.toFixed(1)}%)`
        : ''

      insights.push({
        id: `unusual-${focus.symbol}`,
        type: 'unusual_flow',
        symbol: focus.symbol,
        sentiment: move !== undefined && move < 0 ? 'negative' : 'positive',
        text: `There’s still unusual flow lighting up ${focus.symbol}${moveText}. Might be worth a quick look before the crowd piles in.`
      })
    }

    const positionsWithQuotes = positions
      .map((pos) => ({
        ...pos,
        quote: quotesMap.get(pos.symbol.toUpperCase())
      }))
      .filter((pos) => pos.quote) as Array<PositionRow & { quote: StockQuote }>

    const deepRed = positionsWithQuotes
      .filter((pos) => typeof pos.quote.changePercent === 'number' && pos.quote.changePercent <= -1.5)
      .sort((a, b) => (a.quote.changePercent ?? 0) - (b.quote.changePercent ?? 0))

    if (deepRed.length > 0) {
      const laggard = deepRed[0]
      const pctMove = laggard.quote.changePercent ?? 0

      insights.push({
        id: `risk-${laggard.symbol}`,
        type: 'risk',
        symbol: laggard.symbol,
        sentiment: 'negative',
        text: `${laggard.symbol} is getting hit (${pctMove.toFixed(1)}%). Make sure the thesis still checks out before it slides further.`
      })
    }

    if (positions.length > 0) {
      const now = new Date()
      const soonExpiring = positions
        .map((pos) => ({
          ...pos,
          daysToExpiry: Math.floor((new Date(pos.expiration).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        }))
        .filter((pos) => pos.daysToExpiry >= 0 && pos.daysToExpiry <= 7)
        .sort((a, b) => a.daysToExpiry - b.daysToExpiry)

      if (soonExpiring.length > 0) {
        const expiring = soonExpiring[0]
        insights.push({
          id: `expiry-${expiring.symbol}-${expiring.expiration}`,
          type: 'expiration',
          symbol: expiring.symbol,
          sentiment: 'neutral',
          text: `${expiring.symbol} ${expiring.option_type.toUpperCase()}s roll off in ${expiring.daysToExpiry} day${expiring.daysToExpiry === 1 ? '' : 's'}. Let’s plan the exit before time decay does it for you.`
        })
      }

      const callExposure = positions
        .filter((pos) => pos.option_type === 'call')
        .reduce((total, pos) => total + (pos.contracts ?? 1), 0)

      const putExposure = positions
        .filter((pos) => pos.option_type === 'put')
        .reduce((total, pos) => total + (pos.contracts ?? 1), 0)

      if (callExposure === 0) {
        insights.push({
          id: 'portfolio-no-calls',
          type: 'portfolio',
          sentiment: 'neutral',
          text: 'Portfolio construction check: you’re flat on long calls. Might be time to layer in some upside exposure.'
        })
      } else if (putExposure > callExposure * 1.6) {
        insights.push({
          id: 'portfolio-heavy-puts',
          type: 'portfolio',
          sentiment: 'neutral',
          text: 'The book is leaning pretty bearish right now. Balance it out with something that benefits if the market squeezes.'
        })
      }
    }

    if (insights.length === 0 && marketSnippets.length > 0) {
      const headlineMove = INDEX_SYMBOLS.reduce<{ label: string; change: number | null }>((current, index) => {
        const quote = quotesMap.get(index.symbol)
        const change = typeof quote?.changePercent === 'number' ? quote.changePercent : null
        if (change === null) {
          return current
        }
        if (current.change === null || Math.abs(change) > Math.abs(current.change)) {
          return { label: index.label, change }
        }
        return current
      }, { label: '', change: null })

      if (headlineMove.change !== null) {
        insights.push({
          id: `market-${headlineMove.label.replace(/\s+/g, '-').toLowerCase()}`,
          type: 'market',
          sentiment: headlineMove.change >= 0 ? 'positive' : 'negative',
          text: `${headlineMove.label} is the big mover (${headlineMove.change.toFixed(1)}%). Let’s keep that backdrop in mind before lining up trades.`
        })
      }
    }

    const greeting = `Hey ${firstName}, glad you're back at the desk.`
    const suggestedNextStep = buildSuggestedNextStep(insights)

    const response: DashboardBriefResponse = {
      success: true,
      greeting,
      marketSummary,
      insights,
      suggestedNextStep,
      timestamp: new Date().toISOString(),
      meta: {
        trackedSymbols,
        indexMoves: Object.fromEntries(
          INDEX_SYMBOLS.map(({ symbol }) => {
            const quote = quotesMap.get(symbol)
            return [symbol, typeof quote?.changePercent === 'number' ? quote.changePercent : null]
          })
        )
      }
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    console.error('Failed to build dashboard brief:', error)
    return NextResponse.json(
      { error: 'Failed to build dashboard brief' },
      { status: 500 }
    )
  }
}

