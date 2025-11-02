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

function buildSuggestedNextStep(insights: DashboardInsight[]): string {
  if (insights.length === 0) {
    return "Nothing screaming for attention—fire up the scanner and hunt for setups."
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
        ? `Check ${topInsight.symbol} first—that unusual flow could be your edge.`
        : 'Dig into that unusual flow before everyone else catches on.'
    case 'risk':
      return topInsight.symbol
        ? `Deal with ${topInsight.symbol} first—decide if you're cutting or adding.`
        : "Handle your biggest loser first—cut it or double down."
    case 'expiration':
      return topInsight.symbol
        ? `Close or roll ${topInsight.symbol} before theta burns you.`
        : 'Handle your expiring contracts before time runs out.'
    case 'portfolio':
      return "Balance your book first—you're too lopsided right now."
    case 'market':
    default:
      return 'Get a read on the market move before you make any plays.'
  }
}

function isMarketHours(): boolean {
  const now = new Date()
  const easternTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false
  })

  const parts = easternTime.formatToParts(now)
  const dayOfWeek = parts.find(p => p.type === 'weekday')?.value
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0')
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0')

  // Weekend
  if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') {
    return false
  }

  // Market hours: 9:30 AM - 4:00 PM ET (09:30 - 16:00)
  const currentMinutes = hour * 60 + minute
  const marketOpen = 9 * 60 + 30  // 9:30 AM
  const marketClose = 16 * 60      // 4:00 PM

  return currentMinutes >= marketOpen && currentMinutes < marketClose
}

function getWeekendMessage(firstName: string): { greeting: string; marketSummary: string; insights: DashboardInsight[] } {
  const now = new Date()
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })

  return {
    greeting: `Hey ${firstName}, enjoy your ${dayOfWeek}.`,
    marketSummary: "Markets are closed for the weekend. Next week kicks off Monday at 9:30 AM ET.",
    insights: [
      {
        id: 'weekend-prep',
        type: 'market',
        sentiment: 'neutral',
        text: "Use the downtime to review your positions, check upcoming earnings, or scout for setups to hit when the bell rings."
      }
    ]
  }
}

function getAfterHoursMessage(firstName: string): { greeting: string; marketSummary: string } {
  return {
    greeting: `Hey ${firstName}, market just closed.`,
    marketSummary: "Today's session wrapped up at 4:00 PM ET. Price action and quotes reflect the closing bell."
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

    const now = new Date()
    const easternDay = now.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' })
    const isWeekend = easternDay === 'Sat' || easternDay === 'Sun'
    const marketIsOpen = isMarketHours()

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

    // Check for weekend - return early with weekend message
    if (isWeekend) {
      const weekendResponse = getWeekendMessage(firstName)
      const response: DashboardBriefResponse = {
        success: true,
        greeting: weekendResponse.greeting,
        marketSummary: weekendResponse.marketSummary,
        insights: weekendResponse.insights,
        suggestedNextStep: "Take a breather—markets reopen Monday at 9:30 AM ET.",
        timestamp: new Date().toISOString(),
        meta: {
          trackedSymbols: [],
          indexMoves: {}
        }
      }
      return NextResponse.json(response, {
        headers: { 'Cache-Control': 'no-store' }
      })
    }

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

    // Build market summary with actionable context
    const spyQuote = quotesMap.get('SPY')
    const qqqQuote = quotesMap.get('QQQ')
    const iwmQuote = quotesMap.get('IWM')

    let marketSummary = ''

    if (!marketIsOpen) {
      // After hours - show closing context
      const afterHoursMsg = getAfterHoursMessage(firstName)
      marketSummary = afterHoursMsg.marketSummary
    } else {
      // Market is open - show actionable summary
      const spyMove = spyQuote?.changePercent ?? null
      const qqqMove = qqqQuote?.changePercent ?? null
      const iwmMove = iwmQuote?.changePercent ?? null

      if (spyMove !== null && Math.abs(spyMove) >= 0.5) {
        const direction = spyMove > 0 ? 'ripping higher' : 'under pressure'
        const context = spyMove > 0
          ? 'Good time to lock in profits on winners or hunt for momentum plays.'
          : "Watch your risk—consider tightening stops or taking partial profits."
        marketSummary = `Market is ${direction} today (${spyMove > 0 ? '+' : ''}${spyMove.toFixed(1)}%). ${context}`
      } else if (qqqMove !== null && iwmMove !== null && Math.abs(qqqMove - iwmMove) > 0.8) {
        const leader = qqqMove > iwmMove ? 'Big tech' : 'Small caps'
        const leaderMove = qqqMove > iwmMove ? qqqMove : iwmMove
        marketSummary = `${leader} is leading the charge today (${leaderMove > 0 ? '+' : ''}${leaderMove.toFixed(1)}%). Rotation is happening—follow the strength.`
      } else if (spyMove !== null && Math.abs(spyMove) < 0.3) {
        marketSummary = "Market's pretty quiet today. Good time to review positions and wait for cleaner setups."
      } else {
        marketSummary = "Market's showing some movement—check your positions and stay nimble."
      }
    }

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

      const actionText = move !== undefined && move > 0
        ? "Smart money is pushing it higher—ride the wave or take profits."
        : move !== undefined && move < 0
        ? "Flow is active but price is dropping—might be hedging or a trap."
        : "Smart money is moving—worth checking what they see."

      insights.push({
        id: `unusual-${focus.symbol}`,
        type: 'unusual_flow',
        symbol: focus.symbol,
        sentiment: move !== undefined && move < 0 ? 'negative' : 'positive',
        text: `${focus.symbol}${moveText} has unusual flow. ${actionText}`
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
        text: `${laggard.symbol} is down ${Math.abs(pctMove).toFixed(1)}%. If the thesis is broken, cut it. If it's still good, this might be your add point.`
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
        const daysText = expiring.daysToExpiry === 0 ? 'today' : `in ${expiring.daysToExpiry} day${expiring.daysToExpiry === 1 ? '' : 's'}`
        const action = expiring.daysToExpiry <= 2
          ? "Close it or roll it—theta is burning fast."
          : 'Plan your exit now before theta eats your premium.'

        insights.push({
          id: `expiry-${expiring.symbol}-${expiring.expiration}`,
          type: 'expiration',
          symbol: expiring.symbol,
          sentiment: 'neutral',
          text: `${expiring.symbol} ${expiring.option_type.toUpperCase()}s expire ${daysText}. ${action}`
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
          text: "You have zero call exposure. If the market rips, you'll miss the move—consider adding some upside."
        })
      } else if (putExposure > callExposure * 1.6) {
        insights.push({
          id: 'portfolio-heavy-puts',
          type: 'portfolio',
          sentiment: 'neutral',
          text: "Your book is loaded with puts. If we get a surprise rally, it'll hurt—balance it out with some calls."
        })
      }
    }

    if (insights.length === 0) {
      const spyMove = spyQuote?.changePercent ?? null
      const qqqMove = qqqQuote?.changePercent ?? null
      const iwmMove = iwmQuote?.changePercent ?? null

      const headlineMove = [
        { label: 'S&P 500', symbol: 'SPY', change: spyMove },
        { label: 'Big tech', symbol: 'QQQ', change: qqqMove },
        { label: 'Small caps', symbol: 'IWM', change: iwmMove }
      ].reduce<{ label: string; change: number | null }>((current, index) => {
        if (index.change === null) return current
        if (current.change === null || Math.abs(index.change) > Math.abs(current.change)) {
          return { label: index.label, change: index.change }
        }
        return current
      }, { label: '', change: null })

      if (headlineMove.change !== null && Math.abs(headlineMove.change) >= 0.3) {
        const action = headlineMove.change > 0
          ? "Ride the momentum or bank profits—but don't chase garbage."
          : "Tighten up your risk—weak hands will get shaken out."

        insights.push({
          id: `market-${headlineMove.label.replace(/\s+/g, '-').toLowerCase()}`,
          type: 'market',
          sentiment: headlineMove.change >= 0 ? 'positive' : 'negative',
          text: `${headlineMove.label} is ${headlineMove.change > 0 ? 'up' : 'down'} ${Math.abs(headlineMove.change).toFixed(1)}%. ${action}`
        })
      }
    }

    // Context-aware greeting
    const greeting = marketIsOpen
      ? `Hey ${firstName}, let's make some moves.`
      : `Hey ${firstName}, market just closed.`

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

