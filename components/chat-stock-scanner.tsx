'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface StockMessage {
  id: string
  type: 'monty' | 'user'
  content: string
  timestamp: Date
  stockData?: {
    symbol: string
    score: number
    price: number | null
    sentiment: 'bullish' | 'bearish' | 'neutral'
    quickSummary: string
    details?: {
      marketCap?: number | null
      peRatio?: number | null
      profitMargin?: number | null
      strengths?: string[]
      risks?: string[]
    }
  }
  quickReplies?: Array<{
    id: string
    label: string
    action: string
  }>
}

interface FundamentalsSignal {
  id: string
  symbol: string
  overallScore: number
  qualityLevel: 'excellent' | 'good' | 'fair' | 'poor'
  recommendation: string
  buyReason: string | null
  currentPrice: number | null
  marketCap: number | null
  peRatio: number | null
  pegRatio: number | null
  targetUpsidePct: number | null
  profitMargin: number | null
  revenueGrowth: number | null
  earningsGrowth: number | null
  roe: number | null
  debtToEquity: number | null
  strengths: string[]
  weaknesses: string[]
  riskFactors: string[]
  riskLevel: 'low' | 'moderate' | 'high'
}

export function ChatStockScanner() {
  const [messages, setMessages] = useState<StockMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentStockIndex, setCurrentStockIndex] = useState(0)
  const [stocksData, setStocksData] = useState<FundamentalsSignal[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Initialize with greeting
  useEffect(() => {
    const intro: StockMessage = {
      id: '0',
      type: 'monty',
      content: "Hey! I'm your Stock Fundamentals Scanner. I analyze companies based on:\n\n• Financial Health (25%) - debt levels, cash flow, liquidity\n• Profitability (25%) - margins, ROE, capital efficiency  \n• Growth (20%) - revenue and earnings trends\n• Valuation (15%) - P/E, PEG, price ratios\n• Leverage (15%) - debt management",
      timestamp: new Date(),
    }

    setTimeout(() => {
      const greeting: StockMessage = {
        id: '1',
        type: 'monty',
        content: "I find fundamentally strong companies with solid growth potential and reasonable valuations - perfect for long-term investing.\n\nWant to see what's looking good today?",
        timestamp: new Date(),
        quickReplies: [
          { id: 'show-me', label: 'Show me', action: 'start-scan' },
          { id: 'best-only', label: 'Just the best ones', action: 'scan-excellent' },
          { id: 'all-stocks', label: 'Show me everything', action: 'scan-all' },
        ],
      }
      setMessages((prev) => [...prev, greeting])
    }, 1500)

    setMessages([intro])
  }, [])

  const addMessage = (message: Omit<StockMessage, 'id' | 'timestamp'>) => {
    const newMessage: StockMessage = {
      ...message,
      id: Date.now().toString(),
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, newMessage])
  }

  const simulateTyping = async (duration: number = 1000) => {
    setIsTyping(true)
    await new Promise((resolve) => setTimeout(resolve, duration))
    setIsTyping(false)
  }

  const fetchStocks = async (minScore: number = 65) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/fundamentals-scanner?minScore=${minScore}`)

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch stock data')
      }

      setStocksData(data.data || [])
      return data.data || []
    } catch (error) {
      console.error('Error fetching stocks:', error)

      // Show user-friendly error message
      addMessage({
        type: 'monty',
        content: "Oops! Having trouble connecting to the market data right now. This might be because:\n\n• The fundamentals database hasn't been populated yet\n• There's a connection issue\n\nTry again in a bit, or contact support if this keeps happening.",
      })

      return []
    } finally {
      setIsLoading(false)
    }
  }

  const formatPrice = (price: number | null) => {
    if (!price) return 'N/A'
    return `$${price.toFixed(2)}`
  }

  const formatMarketCap = (marketCap: number | null) => {
    if (!marketCap) return 'N/A'
    if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(2)}T`
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`
    return `$${(marketCap / 1e6).toFixed(2)}M`
  }

  const getScoreEmoji = (score: number) => {
    return ''
  }

  const getSentiment = (score: number): 'bullish' | 'bearish' | 'neutral' => {
    if (score >= 70) return 'bullish'
    if (score < 50) return 'bearish'
    return 'neutral'
  }

  const getConversationalIntro = (stock: FundamentalsSignal) => {
    const intros = [
      `Okay, check this out - ${stock.symbol}`,
      `Here's a good one: ${stock.symbol}`,
      `You'll like this - ${stock.symbol}`,
      `${stock.symbol} is looking interesting`,
      `Let me tell you about ${stock.symbol}`,
    ]
    return intros[Math.floor(Math.random() * intros.length)]
  }

  const getScoreComment = (score: number) => {
    if (score >= 85) return "This is one of the best I've seen"
    if (score >= 80) return "Really strong fundamentals here"
    if (score >= 70) return "Looking pretty solid"
    if (score >= 60) return "Decent opportunity"
    return "Worth keeping an eye on"
  }

  const getKeyHighlight = (stock: FundamentalsSignal) => {
    const highlights = []

    if (stock.profitMargin && stock.profitMargin > 0.2) {
      highlights.push(`Crushing it with ${(stock.profitMargin * 100).toFixed(1)}% profit margin`)
    }
    if (stock.revenueGrowth && stock.revenueGrowth > 0.15) {
      highlights.push(`Revenue growing ${(stock.revenueGrowth * 100).toFixed(1)}% - strong momentum`)
    }
    if (stock.targetUpsidePct && stock.targetUpsidePct > 15) {
      highlights.push(`Analysts see ${stock.targetUpsidePct.toFixed(1)}% upside potential`)
    }
    if (stock.peRatio && stock.peRatio < 15) {
      highlights.push(`Trading at a reasonable P/E of ${stock.peRatio.toFixed(1)}`)
    }

    return highlights[0] || stock.buyReason || 'Solid fundamentals across the board'
  }

  const presentStock = async (stock: FundamentalsSignal) => {
    await simulateTyping(800)

    // Intro message
    addMessage({
      type: 'monty',
      content: getConversationalIntro(stock),
    })

    await simulateTyping(600)

    // Score and quick summary
    addMessage({
      type: 'monty',
      content: `Score: ${stock.overallScore}/100\n${getScoreComment(stock.overallScore)}`,
      stockData: {
        symbol: stock.symbol,
        score: stock.overallScore,
        price: stock.currentPrice,
        sentiment: getSentiment(stock.overallScore),
        quickSummary: getKeyHighlight(stock),
      },
    })

    await simulateTyping(500)

    // Price and market cap
    const priceInfo = `Trading at ${formatPrice(stock.currentPrice)}${
      stock.marketCap ? ` • Market cap: ${formatMarketCap(stock.marketCap)}` : ''
    }`
    addMessage({
      type: 'monty',
      content: priceInfo,
    })

    await simulateTyping(700)

    // Key highlight
    addMessage({
      type: 'monty',
      content: getKeyHighlight(stock),
    })

    // Quick replies
    const hasMoreStocks = currentStockIndex < stocksData.length - 1
    addMessage({
      type: 'monty',
      content: hasMoreStocks ? "Want to know more, or should I show you the next one?" : "Want more details on this one?",
      quickReplies: [
        { id: 'more-details', label: 'Tell me more', action: `details-${stock.symbol}` },
        { id: 'risks', label: "What's the risk?", action: `risks-${stock.symbol}` },
        ...(hasMoreStocks
          ? [{ id: 'next', label: 'Next stock', action: 'next-stock' }]
          : [{ id: 'restart', label: 'Start over', action: 'start-scan' }]),
      ],
    })
  }

  const showStockDetails = async (symbol: string) => {
    const stock = stocksData.find((s) => s.symbol === symbol)
    if (!stock) return

    await simulateTyping(600)

    addMessage({
      type: 'monty',
      content: `Here's the full breakdown for ${symbol}:`,
    })

    await simulateTyping(500)

    // Financial metrics
    const metrics = []
    if (stock.peRatio) metrics.push(`P/E Ratio: ${stock.peRatio.toFixed(1)}`)
    if (stock.pegRatio) metrics.push(`PEG Ratio: ${stock.pegRatio.toFixed(2)}`)
    if (stock.roe) metrics.push(`ROE: ${(stock.roe * 100).toFixed(1)}%`)
    if (stock.revenueGrowth) metrics.push(`Revenue Growth: ${(stock.revenueGrowth * 100).toFixed(1)}%`)
    if (stock.earningsGrowth) metrics.push(`Earnings Growth: ${(stock.earningsGrowth * 100).toFixed(1)}%`)

    if (metrics.length > 0) {
      addMessage({
        type: 'monty',
        content: `Key Metrics:\n${metrics.join('\n')}`,
      })

      await simulateTyping(500)
    }

    // Strengths
    if (stock.strengths.length > 0) {
      const strengthsList = stock.strengths.slice(0, 3).map(s => `${s}`).join('\n')
      addMessage({
        type: 'monty',
        content: `What's working:\n${strengthsList}`,
      })

      await simulateTyping(500)
    }

    // Continue options
    const hasMoreStocks = currentStockIndex < stocksData.length - 1
    addMessage({
      type: 'monty',
      content: hasMoreStocks ? "Want to see the risks, or move to the next stock?" : "Need anything else?",
      quickReplies: [
        { id: 'risks', label: 'Show risks', action: `risks-${stock.symbol}` },
        ...(hasMoreStocks
          ? [{ id: 'next', label: 'Next stock', action: 'next-stock' }]
          : [{ id: 'restart', label: 'Find more stocks', action: 'start-scan' }]),
      ],
    })
  }

  const showStockRisks = async (symbol: string) => {
    const stock = stocksData.find((s) => s.symbol === symbol)
    if (!stock) return

    await simulateTyping(600)

    addMessage({
      type: 'monty',
      content: `Risk level: ${stock.riskLevel}`,
    })

    await simulateTyping(500)

    // Weaknesses and risks
    const concerns = [...stock.weaknesses, ...stock.riskFactors].slice(0, 3)
    if (concerns.length > 0) {
      const concernsList = concerns.map(c => `${c}`).join('\n')
      addMessage({
        type: 'monty',
        content: `Here's what to watch out for:\n${concernsList}`,
      })
    }

    await simulateTyping(500)

    const hasMoreStocks = currentStockIndex < stocksData.length - 1
    addMessage({
      type: 'monty',
      content: hasMoreStocks ? "Ready for the next one?" : "Anything else you want to know?",
      quickReplies: hasMoreStocks
        ? [{ id: 'next', label: 'Next stock', action: 'next-stock' }]
        : [{ id: 'restart', label: 'Find more stocks', action: 'start-scan' }],
    })
  }

  const handleQuickReply = async (action: string) => {
    // Add user message
    const replyLabels: Record<string, string> = {
      'start-scan': 'Show me',
      'scan-excellent': 'Just the best ones',
      'scan-all': 'Show me everything',
      'next-stock': 'Next stock',
    }

    if (action.startsWith('details-')) {
      const symbol = action.replace('details-', '')
      addMessage({ type: 'user', content: 'Tell me more' })
      await showStockDetails(symbol)
      return
    }

    if (action.startsWith('risks-')) {
      const symbol = action.replace('risks-', '')
      addMessage({ type: 'user', content: "What's the risk?" })
      await showStockRisks(symbol)
      return
    }

    const label = replyLabels[action] || action
    addMessage({ type: 'user', content: label })

    if (action === 'start-scan' || action === 'scan-excellent') {
      await simulateTyping(1000)
      addMessage({
        type: 'monty',
        content: "Let me scan the market real quick...",
      })

      const minScore = action === 'scan-excellent' ? 80 : 65
      const stocks = await fetchStocks(minScore)

      if (stocks.length === 0) {
        await simulateTyping(500)
        addMessage({
          type: 'monty',
          content: "Hmm, not finding anything that meets the criteria right now. Want to try a broader search?",
          quickReplies: [{ id: 'scan-all', label: 'Show me everything', action: 'scan-all' }],
        })
        return
      }

      await simulateTyping(800)
      const count = Math.min(stocks.length, 5)
      addMessage({
        type: 'monty',
        content: `Found ${count} ${count === 1 ? 'stock' : 'stocks'} worth checking out! Let me walk you through ${
          count === 1 ? 'it' : 'them'
        }...`,
      })

      setCurrentStockIndex(0)
      await presentStock(stocks[0])
    } else if (action === 'scan-all') {
      await simulateTyping(1000)
      addMessage({
        type: 'monty',
        content: "On it! Scanning everything...",
      })

      const stocks = await fetchStocks(50)

      if (stocks.length === 0) {
        await simulateTyping(500)
        addMessage({
          type: 'monty',
          content: "Market's pretty quiet right now. Check back in a bit!",
        })
        return
      }

      await simulateTyping(800)
      const count = Math.min(stocks.length, 10)
      addMessage({
        type: 'monty',
        content: `Okay! I found ${count} opportunities. Let's start with the top ones...`,
      })

      setCurrentStockIndex(0)
      await presentStock(stocks[0])
    } else if (action === 'next-stock') {
      const nextIndex = currentStockIndex + 1
      if (nextIndex < stocksData.length) {
        setCurrentStockIndex(nextIndex)
        await presentStock(stocksData[nextIndex])
      }
    }
  }

  return (
    <div className="flex h-[calc(100vh-200px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <div className="flex-1">
          <h3 className="font-semibold text-white">Stock Fundamentals Scanner</h3>
          <p className="text-xs text-slate-400">Finding quality companies with strong fundamentals</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <AnimatePresence>
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex max-w-[85%] gap-2 ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className="space-y-1 w-full">
                  <div
                    className={`rounded-2xl px-5 py-3 ${
                      message.type === 'user'
                        ? 'bg-emerald-500/20 text-white border border-emerald-500/30'
                        : 'border border-white/10 bg-white/5 text-white backdrop-blur-sm'
                    }`}
                  >
                    <p className="whitespace-pre-line text-sm leading-relaxed">{message.content}</p>

                    {message.stockData && (
                      <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
                        <span className="text-xs font-medium text-emerald-300">{message.stockData.symbol}</span>
                        {message.stockData.sentiment === 'bullish' && (
                          <span className="text-xs text-emerald-400">Strong</span>
                        )}
                        {message.stockData.sentiment === 'bearish' && (
                          <span className="text-xs text-red-400">Weak</span>
                        )}
                      </div>
                    )}
                  </div>

                  {message.quickReplies && message.quickReplies.length > 0 && index === messages.length - 1 && (
                    <div className="flex flex-wrap gap-2">
                      {message.quickReplies.map((reply) => (
                        <button
                          key={reply.id}
                          onClick={() => handleQuickReply(reply.action)}
                          disabled={isTyping || isLoading}
                          className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-300 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          {reply.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <p className="px-2 text-[10px] text-slate-500">
                    {message.timestamp.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2"
          >
            <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-sm">
              <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
              <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
              <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
