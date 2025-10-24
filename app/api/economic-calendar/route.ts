import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

interface EconomicEvent {
  date: string
  time: string
  country: string
  event: string
  impact: 'High' | 'Medium' | 'Low'
  forecast: string | null
  previous: string | null
  actual: string | null
}

interface CalendarEvent {
  date: string
  time: string
  event: string
  impact: 'high' | 'medium' | 'low'
  country: string
  forecast: string | null
  previous: string | null
  category: 'fed' | 'jobs' | 'inflation' | 'gdp' | 'earnings' | 'other'
}

// High-impact events we care about for options trading
const HIGH_IMPACT_KEYWORDS = [
  'fomc', 'fed', 'interest rate', 'federal reserve',
  'nonfarm', 'payroll', 'unemployment', 'jobs report',
  'cpi', 'inflation', 'pce', 'consumer price',
  'gdp', 'gross domestic',
  'retail sales', 'housing starts', 'ism',
]

const categorizeEvent = (eventName: string): CalendarEvent['category'] => {
  const lower = eventName.toLowerCase()

  if (lower.includes('fomc') || lower.includes('fed') || lower.includes('interest rate')) {
    return 'fed'
  }
  if (lower.includes('payroll') || lower.includes('unemployment') || lower.includes('jobs')) {
    return 'jobs'
  }
  if (lower.includes('cpi') || lower.includes('inflation') || lower.includes('pce')) {
    return 'inflation'
  }
  if (lower.includes('gdp')) {
    return 'gdp'
  }
  if (lower.includes('earnings')) {
    return 'earnings'
  }

  return 'other'
}

const isHighImpact = (eventName: string): boolean => {
  const lower = eventName.toLowerCase()
  return HIGH_IMPACT_KEYWORDS.some(keyword => lower.includes(keyword))
}

// Fallback data for when API is unavailable or during development
const getFallbackEvents = (): CalendarEvent[] => {
  const today = new Date()
  const nextWeek = new Date(today)
  nextWeek.setDate(today.getDate() + 7)

  return [
    {
      date: nextWeek.toISOString().split('T')[0],
      time: '14:00',
      event: 'FOMC Rate Decision',
      impact: 'high',
      country: 'US',
      forecast: '25bps cut expected',
      previous: '5.50%',
      category: 'fed',
    },
    {
      date: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      time: '08:30',
      event: 'Non-Farm Payrolls',
      impact: 'high',
      country: 'US',
      forecast: '180K',
      previous: '150K',
      category: 'jobs',
    },
    {
      date: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      time: '08:30',
      event: 'CPI Inflation YoY',
      impact: 'high',
      country: 'US',
      forecast: '3.3%',
      previous: '3.7%',
      category: 'inflation',
    },
  ]
}

export async function GET() {
  try {
    const FMP_API_KEY = process.env.FMP_API_KEY

    // If no API key, return fallback data
    if (!FMP_API_KEY) {
      console.log('No FMP_API_KEY found, using fallback economic calendar data')
      return NextResponse.json({
        success: true,
        events: getFallbackEvents(),
        source: 'fallback',
        timestamp: new Date().toISOString(),
      })
    }

    // Fetch from FMP API
    const fromDate = new Date().toISOString().split('T')[0]
    const toDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${fromDate}&to=${toDate}&apikey=${FMP_API_KEY}`

    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      console.error('FMP API error:', response.status, response.statusText)
      return NextResponse.json({
        success: true,
        events: getFallbackEvents(),
        source: 'fallback_after_error',
        timestamp: new Date().toISOString(),
      })
    }

    const data: EconomicEvent[] = await response.json()

    // Filter and transform events
    const events: CalendarEvent[] = data
      .filter(event => event.country === 'US' && isHighImpact(event.event))
      .map(event => ({
        date: event.date,
        time: event.time || '00:00',
        event: event.event,
        impact: event.impact.toLowerCase() as 'high' | 'medium' | 'low',
        country: event.country,
        forecast: event.forecast,
        previous: event.previous,
        category: categorizeEvent(event.event),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 15) // Limit to next 15 events

    return NextResponse.json({
      success: true,
      events: events.length > 0 ? events : getFallbackEvents(),
      source: events.length > 0 ? 'fmp' : 'fallback_no_events',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error fetching economic calendar:', error)

    // Return fallback data on error
    return NextResponse.json({
      success: true,
      events: getFallbackEvents(),
      source: 'fallback_error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
