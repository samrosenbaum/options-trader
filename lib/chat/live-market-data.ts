const COMMON_WORDS = new Set([
  'THE',
  'AND',
  'FOR',
  'WITH',
  'THIS',
  'THAT',
  'FROM',
  'YOUR',
  'ABOUT',
  'WHEN',
  'WANT',
  'WOULD',
  'COULD',
  'SHOULD',
  'MIGHT',
  'THINK',
  'WHERE',
  'THERE',
  'THEIR',
  'MONTY',
  'BUY',
  'SELL',
  'CALL',
  'CALLS',
  'PUT',
  'PUTS',
])

const MAX_TICKERS = 8

export interface LiveQuote {
  symbol: string
  price?: number
  change?: number
  changePercent?: number
  previousClose?: number
  volume?: number
  marketCap?: number
  currency?: string
  marketState?: string
  regularMarketTime?: number
  shortName?: string
  longName?: string
}

export interface MarketNewsItem {
  id: string
  title: string
  link: string
  publisher?: string
  publishedAt?: string
  relatedTickers: string[]
}

export interface LiveMarketContext {
  summary: string
  quotes: LiveQuote[]
  news: MarketNewsItem[]
  tickers: string[]
}

function normalizePotentialTicker(candidate: string): string | null {
  const hasDollarPrefix = candidate.startsWith('$')
  const stripped = candidate.replace(/^\$+/, '')
  if (!hasDollarPrefix && stripped !== stripped.toUpperCase()) {
    return null
  }

  const cleaned = stripped.replace(/[^A-Za-z\.]/g, '')
  if (!cleaned) return null

  const upper = cleaned.toUpperCase()
  if (upper.length < 1 || upper.length > 5) return null
  if (COMMON_WORDS.has(upper)) return null

  if (!/^[A-Z]+(?:\.[A-Z]+)?$/.test(upper)) {
    return null
  }

  return upper
}

export function extractTickersFromText(text: string): string[] {
  const matches = text.match(/\$?[A-Za-z]{1,5}(?:\.[A-Za-z]{1,2})?/g) || []
  const seen = new Set<string>()

  for (const match of matches) {
    const normalized = normalizePotentialTicker(match)
    if (!normalized) continue
    seen.add(normalized)
    if (seen.size >= MAX_TICKERS) break
  }

  return Array.from(seen)
}

function formatSignedNumber(value: number | undefined, fractionDigits = 2): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(fractionDigits)}`
}

function formatCompactNumber(value: number | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  try {
    const formatter = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    })
    return formatter.format(value)
  } catch (error) {
    console.error('Compact number formatting failed', error)
    return null
  }
}

function formatRelativeTime(isoTimestamp: string | undefined): string | null {
  if (!isoTimestamp) return null
  const timestamp = Date.parse(isoTimestamp)
  if (Number.isNaN(timestamp)) return null

  const now = Date.now()
  const diffMs = timestamp - now

  const absDiffMinutes = Math.round(Math.abs(diffMs) / (60 * 1000))

  if (absDiffMinutes < 1) {
    return 'just now'
  }

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 60 * 24],
    ['hour', 60],
    ['minute', 1],
  ]

  for (const [unit, minutes] of units) {
    if (absDiffMinutes >= minutes) {
      const value = Math.round(diffMs / (minutes * 60 * 1000))
      try {
        const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
        return formatter.format(value, unit)
      } catch (error) {
        console.error('Relative time formatting failed', error)
        break
      }
    }
  }

  return null
}

function formatMarketTimestamp(seconds: number | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  try {
    const date = new Date(seconds * 1000)
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch (error) {
    console.error('Timestamp formatting failed', error)
    return null
  }
}

async function fetchLiveQuotes(tickers: string[]): Promise<LiveQuote[]> {
  if (!tickers.length) return []

  const url = new URL('https://query1.finance.yahoo.com/v7/finance/quote')
  url.searchParams.set('symbols', tickers.join(','))

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MontyBot/1.0; +https://options-trader.app)',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Quote request failed with status ${response.status}`)
  }

  const payload = await response.json()
  const results: LiveQuote[] = Array.isArray(payload?.quoteResponse?.result)
    ? payload.quoteResponse.result.map((item: any) => ({
        symbol: item.symbol,
        price: typeof item.regularMarketPrice === 'number' ? item.regularMarketPrice : undefined,
        change: typeof item.regularMarketChange === 'number' ? item.regularMarketChange : undefined,
        changePercent:
          typeof item.regularMarketChangePercent === 'number'
            ? item.regularMarketChangePercent
            : undefined,
        previousClose:
          typeof item.regularMarketPreviousClose === 'number'
            ? item.regularMarketPreviousClose
            : undefined,
        volume: typeof item.regularMarketVolume === 'number' ? item.regularMarketVolume : undefined,
        marketCap: typeof item.marketCap === 'number' ? item.marketCap : undefined,
        currency: typeof item.currency === 'string' ? item.currency : undefined,
        marketState: typeof item.marketState === 'string' ? item.marketState : undefined,
        regularMarketTime:
          typeof item.regularMarketTime === 'number' ? item.regularMarketTime : undefined,
        shortName: typeof item.shortName === 'string' ? item.shortName : undefined,
        longName: typeof item.longName === 'string' ? item.longName : undefined,
      }))
    : []

  return results.filter((quote) => Boolean(quote.symbol))
}

async function fetchLatestNews(tickers: string[], limit = 4): Promise<MarketNewsItem[]> {
  if (!tickers.length) return []

  try {
    const url = new URL('https://query2.finance.yahoo.com/v3/finance/news')
    url.searchParams.set('symbols', tickers.join(','))
    url.searchParams.set('count', String(limit))

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MontyBot/1.0; +https://options-trader.app)',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      console.warn('News request failed', response.status)
      return []
    }

    const payload = await response.json()
    const items = Array.isArray(payload?.data) ? payload.data : []

    return items
      .map((item: any) => {
        const id = typeof item.id === 'string' ? item.id : typeof item.uuid === 'string' ? item.uuid : null
        if (!id) return null

        const title = typeof item.title === 'string' ? item.title : null
        const link = typeof item.link === 'string' ? item.link : null
        if (!title || !link) return null

        const publisher = typeof item.publisher === 'string' ? item.publisher : undefined
        const publishedAt = typeof item.providerPublishTime === 'number'
          ? new Date(item.providerPublishTime * 1000).toISOString()
          : typeof item.published_at === 'string'
          ? item.published_at
          : undefined
        const relatedTickers = Array.isArray(item.relatedTickers)
          ? item.relatedTickers.filter((symbol: unknown) => typeof symbol === 'string')
          : []

        return {
          id,
          title,
          link,
          publisher,
          publishedAt,
          relatedTickers,
        } satisfies MarketNewsItem
      })
      .filter((item): item is MarketNewsItem => item !== null)
  } catch (error) {
    console.warn('News fetch failed', error)
    return []
  }
}

function buildQuoteSummary(quotes: LiveQuote[]): string | null {
  if (!quotes.length) return null

  const lines = quotes.map((quote) => {
    const priceLabel = typeof quote.price === 'number' ? `$${quote.price.toFixed(2)}` : 'n/a'
    const changeLabel = formatSignedNumber(quote.change)
    const percentLabel = formatSignedNumber(quote.changePercent)
    const volumeLabel = formatCompactNumber(quote.volume)
    const marketCapLabel = formatCompactNumber(quote.marketCap)
    const marketStateLabel = quote.marketState && quote.marketState !== 'REGULAR' ? quote.marketState : null
    const timestampLabel = formatMarketTimestamp(quote.regularMarketTime)

    const parts: string[] = [`${quote.symbol}: ${priceLabel}`]

    if (changeLabel || percentLabel) {
      const changeParts = [changeLabel, percentLabel ? `${percentLabel}%` : null].filter(Boolean)
      if (changeParts.length) {
        parts.push(`(${changeParts.join(' ')})`)
      }
    }

    if (volumeLabel) {
      parts.push(`Vol ${volumeLabel}`)
    }

    if (marketCapLabel) {
      parts.push(`Cap ${marketCapLabel}`)
    }

    if (marketStateLabel) {
      parts.push(marketStateLabel)
    }

    if (timestampLabel) {
      parts.push(`as of ${timestampLabel} ET`)
    }

    const descriptor = quote.shortName || quote.longName
    if (descriptor) {
      parts.push(`(${descriptor})`)
    }

    return `• ${parts.join(' ')}`
  })

  return lines.join('\n')
}

function buildNewsSummary(newsItems: MarketNewsItem[]): string | null {
  if (!newsItems.length) return null

  const lines = newsItems.slice(0, 3).map((item) => {
    const relative = formatRelativeTime(item.publishedAt) || 'recent'
    const publisher = item.publisher ? `${item.publisher}` : 'News'
    return `• ${item.title} — ${publisher} (${relative})`
  })

  if (!lines.length) return null

  return lines.join('\n')
}

export async function buildLiveMarketContext(
  tickers: string[],
): Promise<LiveMarketContext | null> {
  if (!tickers.length) return null

  const uniqueTickers = Array.from(new Set(tickers)).slice(0, MAX_TICKERS)

  try {
    const [quotes, news] = await Promise.all([
      fetchLiveQuotes(uniqueTickers),
      fetchLatestNews(uniqueTickers),
    ])

    const quoteSummary = buildQuoteSummary(quotes)
    const newsSummary = buildNewsSummary(news)

    if (!quoteSummary && !newsSummary) {
      return null
    }

    const sections = ['Live market snapshot:']

    if (quoteSummary) {
      sections.push(quoteSummary)
    }

    if (newsSummary) {
      sections.push('\nLatest headlines:', newsSummary)
    }

    return {
      summary: sections.join('\n'),
      quotes,
      news,
      tickers: uniqueTickers,
    }
  } catch (error) {
    console.error('Failed to build market context', error)
    return null
  }
}
