'use client'

import { useState, useRef, useEffect } from 'react'
import type { Opportunity } from '@/lib/types/opportunity'

interface TradeChatProps {
  opportunity: Opportunity
  isOpen: boolean
  onClose: () => void
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function TradeChat({ opportunity, isOpen, onClose }: TradeChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat-about-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          opportunity: {
            symbol: opportunity.symbol,
            optionType: opportunity.optionType,
            strike: opportunity.strike,
            premium: opportunity.premium,
            stockPrice: opportunity.stockPrice,
            expiration: opportunity.expiration,
            score: opportunity.score,
            probabilityOfProfit: opportunity.probabilityOfProfit,
            expectedMoveReturn: opportunity.expectedMoveReturn,
            maxReturn: opportunity.maxReturn,
            riskLevel: opportunity.riskLevel,
            directionalBias: opportunity.directionalBias,
            positionSizing: opportunity.positionSizing,
            greeks: opportunity.greeks,
            tradeSummary: opportunity.tradeSummary,
            daysToExpiration: opportunity.daysToExpiration,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantMessage = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                if (parsed.text) {
                  assistantMessage += parsed.text
                  setMessages((prev) => {
                    const newMessages = [...prev]
                    const lastMessage = newMessages[newMessages.length - 1]
                    if (lastMessage?.role === 'assistant') {
                      lastMessage.content = assistantMessage
                    } else {
                      newMessages.push({ role: 'assistant', content: assistantMessage })
                    }
                    return newMessages
                  })
                }
              } catch (e) {
                // Ignore JSON parse errors
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col rounded-3xl border-2 border-slate-900 bg-white shadow-2xl dark:border-white dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 p-6 dark:border-white">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              💬 Ask AI about {opportunity.symbol}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {opportunity.optionType.toUpperCase()} ${opportunity.strike} • Exp{' '}
              {opportunity.expiration}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-slate-500 dark:text-slate-400">
              <p className="mb-2">👋 Hi! I'm here to help you analyze this trade.</p>
              <p className="text-sm">Ask me anything:</p>
              <ul className="mt-4 space-y-2 text-sm text-left max-w-md mx-auto">
                <li>• "Why is the expected edge negative?"</li>
                <li>• "What needs to happen for this to profit?"</li>
                <li>• "Should I take this trade?"</li>
                <li>• "What are the biggest risks?"</li>
              </ul>
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.content}
                </p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800">
                <div className="flex space-x-2">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400"></div>
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
                    style={{ animationDelay: '0.1s' }}
                  ></div>
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
                    style={{ animationDelay: '0.2s' }}
                  ></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t-2 border-slate-900 p-4 dark:border-white">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about this trade..."
              disabled={isLoading}
              className="flex-1 rounded-full border-2 border-slate-900 bg-white px-6 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50 dark:border-white dark:bg-slate-800 dark:text-white dark:focus:ring-white"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="rounded-full bg-blue-600 px-6 py-3 font-medium text-white transition-all hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
