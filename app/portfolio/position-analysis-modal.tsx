'use client'

import { useEffect, useRef, useState } from 'react'
import type { Database } from '@/lib/types/database.types'
import ReactMarkdown from 'react-markdown'

type Position = Database['public']['Tables']['positions']['Row']

type Message = {
  role: 'user' | 'assistant'
  content: string
  isSystem?: boolean
}

const quickPrompts = [
  'Should I exit or hold this position?',
  'What adjustments could improve this trade?',
  'How should I manage risk here?',
  'What is the profit potential from here?',
]

export default function PositionAnalysisModal({
  position,
  onClose,
}: {
  position: Position
  onClose: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendButtonText, setSendButtonText] = useState('Ask Monty')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const greetings = [
      `Hey! Ready to talk about your ${position.symbol} ${position.option_type.toUpperCase()}? I've got the insights you need.`,
      `What's up! Let's dig into your ${position.symbol} ${position.option_type.toUpperCase()} position. Fire away with your questions!`,
      `Hi there! I'm Monty, your options strategist. Let's analyze your ${position.symbol} ${position.option_type.toUpperCase()} together.`,
      `Welcome back! Got questions about your ${position.symbol} ${position.option_type.toUpperCase()}? I'm here to help you nail this trade.`,
    ]

    setMessages([
      {
        role: 'assistant',
        content: greetings[Math.floor(Math.random() * greetings.length)],
        isSystem: true,
      },
    ])
    setInput('')
    setError(null)
    setIsStreaming(false)
  }, [position.id, position.option_type, position.symbol])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  useEffect(() => {
    if (!isStreaming) {
      inputRef.current?.focus()
    }
  }, [isStreaming])

  const hasActiveConversation = messages.some(
    (message) => !message.isSystem && message.role === 'assistant'
  )

  // Update send button text based on conversation state
  useEffect(() => {
    const buttonTexts = hasActiveConversation
      ? ['Send to Monty', 'Ask Away', 'Fire Away', 'Send It']
      : ['Ask Monty', 'Get Advice', 'Consult Monty', 'Ask Away']

    // Pick a random fun text on mount or when conversation state changes
    const randomText = buttonTexts[Math.floor(Math.random() * buttonTexts.length)]
    setSendButtonText(randomText)
  }, [hasActiveConversation])

  const sendMessage = async (messageContent?: string) => {
    const trimmedContent = (messageContent ?? input).trim()
    if (!trimmedContent || isStreaming) {
      return
    }

    const userMessage: Message = {
      role: 'user',
      content: trimmedContent,
    }

    if (!messageContent) {
      setInput('')
    }

    setMessages((prev) => [...prev, userMessage])
    setIsStreaming(true)
    setError(null)

    const nonSystemMessages = messages.filter((msg) => !msg.isSystem)
    const conversation = [...nonSystemMessages, userMessage]

    try {
      const response = await fetch('/api/chat-about-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversation.map(({ role, content }) => ({ role, content })),
          position: {
            symbol: position.symbol,
            strike: position.strike,
            expiration: position.expiration,
            option_type: position.option_type,
            contracts: position.contracts,
            entry_price: position.entry_price,
            entry_date: position.entry_date,
            entry_stock_price: position.entry_stock_price,
            current_price: position.current_price,
            current_stock_price: position.current_stock_price,
            unrealized_pl: position.unrealized_pl,
            unrealized_pl_percent: position.unrealized_pl_percent,
            entry_delta: position.entry_delta,
            entry_theta: position.entry_theta,
            current_delta: position.current_delta,
            current_theta: position.current_theta,
            exit_signal: position.exit_signal,
            exit_urgency_score: position.exit_urgency_score,
            exit_reasons: position.exit_reasons,
          },
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error('Failed to get Monty\'s response')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          const data = line.slice(6)
          if (data === '[DONE]') {
            continue
          }

          try {
            const parsed = JSON.parse(data) as { text?: string }
            if (parsed.text) {
              assistantContent += parsed.text
              setMessages((prev) => {
                const updated = [...prev]
                const lastIndex = updated.length - 1
                if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
                  updated[lastIndex] = {
                    ...updated[lastIndex],
                    content: assistantContent,
                  }
                }
                return updated
              })
            }
          } catch (streamError) {
            console.error('Failed to parse stream chunk', streamError)
          }
        }
      }
    } catch (err) {
      console.error('Position chat error:', err)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I couldn't analyze that. Please try again in a moment.",
        },
      ])
      setError(err instanceof Error ? err.message : 'Failed to get Monty\'s response')
    } finally {
      setIsStreaming(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-8 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Ask Monty: Position Analysis
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <svg
              className="w-6 h-6"
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

        {/* Position Summary */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Symbol</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                {position.symbol}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Position</div>
              <div className="font-semibold text-slate-900 dark:text-white">
                ${position.strike} {position.option_type.toUpperCase()}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">P&amp;L</div>
              <div
                className={`font-bold ${
                  (position.unrealized_pl || 0) >= 0
                    ? 'text-emerald-600'
                    : 'text-red-600'
                }`}
              >
                ${(position.unrealized_pl || 0).toFixed(2)} (
                {(position.unrealized_pl_percent || 0).toFixed(1)}%)
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Exit Signal</div>
              <div
                className={`font-semibold ${
                  position.exit_signal === 'exit_now'
                    ? 'text-red-600'
                    : position.exit_signal === 'consider'
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                }`}
              >
                {position.exit_signal === 'exit_now'
                  ? 'Exit Now'
                  : position.exit_signal === 'consider'
                    ? 'Consider Exit'
                    : 'Hold'}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">
            Quick Questions
          </p>
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                disabled={isStreaming}
                className="group rounded-full border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:shadow-md hover:scale-105 hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 dark:border-blue-800 dark:from-blue-900/30 dark:to-purple-900/30 dark:text-slate-200 dark:hover:border-blue-600"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-slate-900 flex flex-col h-[420px]">
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${
                  message.role === 'user'
                    ? 'justify-end'
                    : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    message.isSystem
                      ? 'bg-gradient-to-r from-blue-100 to-purple-100 text-slate-800 border-2 border-blue-200 dark:from-blue-900/40 dark:to-purple-900/40 dark:text-slate-100 dark:border-blue-700/50'
                      : message.role === 'user'
                        ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md dark:from-blue-500 dark:to-blue-400'
                        : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                  }`}
                >
                  {message.role === 'assistant' && !message.isSystem ? (
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      <ReactMarkdown>{message.content || '…'}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 shadow-sm border border-blue-100 dark:border-blue-800/30">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="font-medium">Monty is analyzing...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="mt-4">
            <label htmlFor="monty-chat-input" className="sr-only">
              Ask Monty about this position
            </label>
            <textarea
              id="monty-chat-input"
              ref={inputRef}
              rows={3}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasActiveConversation
                  ? 'Ask a follow-up question about this position...'
                  : 'Ask Monty for a game plan (press Enter to send, Shift+Enter for a new line)'
              }
              disabled={isStreaming}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
            />
            <div className="mt-3 flex items-center justify-between">
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
              <button
                onClick={() => sendMessage()}
                disabled={isStreaming || !input.trim()}
                className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-105 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 dark:from-blue-500 dark:to-purple-500"
              >
                {sendButtonText}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1"
                >
                  <path d="M2.94 2.939a.75.75 0 0 1 .806-.182l13 5a.75.75 0 0 1 .008 1.392l-5.216 2.24a.25.25 0 0 0-.132.132l-2.24 5.215a.75.75 0 0 1-1.392-.007l-5-13a.75.75 0 0 1 .166-.79Zm2.738 2.25 3.639 3.64a1.75 1.75 0 0 0 .694.43l4.036 1.166-3.31 1.421a1.75 1.75 0 0 0-.926.925l-1.42 3.31-1.167-4.036a1.75 1.75 0 0 0-.43-.694l-3.64-3.64Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
