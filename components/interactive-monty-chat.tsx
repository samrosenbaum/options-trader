'use client'

import { useState, useRef, useEffect } from 'react'
import type { KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send } from 'lucide-react'
import Image from 'next/image'
import { useMontyChat, type Message } from '@/contexts/monty-chat-context'
import { useScanContext } from '@/contexts/scan-context'

interface InteractiveMontyChatProps {
  initialMessage?: string
}

export function InteractiveMontyChat({ initialMessage }: InteractiveMontyChatProps) {
  const { opportunities, scanType } = useScanContext()
  const scanContext = opportunities.length > 0 ? { opportunities, scanType } : undefined
  const [isOpen, setIsOpen] = useState(false)
  const { messages, setMessages } = useMontyChat()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasNewMessage, setHasNewMessage] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevMessagesLengthRef = useRef(messages.length)

  useEffect(() => {
    if (initialMessage && messages.length === 0) {
      setMessages([
        {
          id: '1',
          role: 'assistant',
          content: initialMessage,
          timestamp: new Date(),
        },
      ])
    }
  }, [initialMessage, messages.length, setMessages])

  // Detect new messages and show notification
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current && !isOpen) {
      // New message arrived while chat is closed
      setHasNewMessage(true)
      // Auto-open the chat for new assistant messages
      const lastMessage = messages[messages.length - 1]
      if (lastMessage && lastMessage.role === 'assistant') {
        setIsOpen(true)
      }
    }
    prevMessagesLengthRef.current = messages.length
  }, [messages, isOpen])

  // Clear notification when chat is opened
  useEffect(() => {
    if (isOpen) {
      setHasNewMessage(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    const assistantId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const assistantPlaceholder: Message = {
      id: assistantId,
      role: 'assistant',
      content: '...',
      timestamp: new Date(),
    }

    const conversation = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userMessage.content },
    ]

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversation,
          scanContext: scanContext
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Failed to get response'
        try {
          const errorData = await response.json()
          if (errorData?.error) {
            errorMessage = errorData.error
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError)
        }
        throw new Error(errorMessage)
      }

      if (!response.body) {
        throw new Error('No response body received from chat API')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      let buffer = ''
      let done = false

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone

        if (value) {
          buffer += decoder.decode(value, { stream: !readerDone })
        }

        const segments = buffer.split('\n\n')
        buffer = segments.pop() ?? ''

        for (const segment of segments) {
          const line = segment.trim()
          if (!line.startsWith('data:')) continue

          const data = line.slice(5).trim()
          if (!data) continue

          if (data === '[DONE]') {
            done = true
            break
          }

          try {
            const parsed = JSON.parse(data) as { text?: string }
            if (parsed.text) {
              assistantContent += parsed.text
              const updatedContent = assistantContent
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: updatedContent, timestamp: new Date() }
                    : msg
                )
              )
            }
          } catch (chunkError) {
            console.error('Failed to parse chat chunk:', chunkError)
          }
        }
      }

      if (!assistantContent.trim()) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content:
                    'I apologize, I had trouble processing that. Could you try asking in a different way?',
                  timestamp: new Date(),
                }
              : msg
          )
        )
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: 'Sorry, I encountered an error. Please try again in a moment.',
                timestamp: new Date(),
              }
            : msg
        )
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Floating button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 260, damping: 20 }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-2xl transition-all hover:scale-110 hover:shadow-emerald-500/50 overflow-hidden"
      >
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="relative w-full h-full flex items-center justify-center"
        >
          {isOpen ? (
            <X className="h-6 w-6 text-emerald-600" />
          ) : (
            <Image
              src="/monty-avatar.png"
              alt="Monty"
              width={64}
              height={64}
              className="w-full h-full object-cover"
            />
          )}
        </motion.div>

        {/* Pulse animation */}
        {!isOpen && (
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full bg-emerald-400"
          />
        )}

        {/* New message notification badge */}
        {hasNewMessage && !isOpen && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold shadow-lg"
          >
            !
          </motion.div>
        )}
      </motion.button>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-28 right-6 z-50 flex h-[600px] w-[400px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-3xl border border-white/20 shadow-2xl backdrop-blur-2xl"
            style={{
              background: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(40px) saturate(180%)',
            }}
          >
            {/* Header */}
            <div
              className="relative flex items-center justify-between border-b border-white/20 px-6 py-4"
              style={{ background: 'rgba(255, 255, 255, 0.5)' }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg overflow-hidden">
                  <Image
                    src="/monty-avatar.png"
                    alt="Monty"
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Monty</div>
                  <div className="text-xs text-slate-600">Your Options Assistant</div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/50 text-slate-600 transition-colors hover:bg-white/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mb-4 flex justify-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white overflow-hidden">
                        <Image
                          src="/monty-avatar.png"
                          alt="Monty"
                          width={64}
                          height={64}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">Hey! I'm Monty</p>
                    <p className="mt-2 text-xs text-slate-600">
                      Ask me anything about options trading, your portfolio, or market insights.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className="flex max-w-[80%] flex-col gap-1">
                        {message.role === 'assistant' && (
                          <div className="flex items-center gap-2 px-1">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white overflow-hidden">
                              <Image
                                src="/monty-avatar.png"
                                alt="Monty"
                                width={24}
                                height={24}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="text-xs text-slate-500">Monty</span>
                          </div>
                        )}
                        <div
                          className={`rounded-[18px] px-4 py-3 shadow-sm ${
                            message.role === 'user'
                              ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                              : 'bg-white/60 text-slate-900 backdrop-blur-sm border border-white/40'
                          }`}
                        >
                          <p className="text-[15px] leading-[1.4] whitespace-pre-wrap">{message.content}</p>
                        </div>
                        <span className="px-1 text-[10px] text-slate-500">
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div
              className="border-t border-white/20 p-4"
              style={{ background: 'rgba(255, 255, 255, 0.5)' }}
            >
              <div className="flex items-end gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask Monty anything..."
                  disabled={isLoading}
                  className="flex-1 rounded-2xl border border-white/40 bg-white/60 px-4 py-3 text-sm text-slate-900 placeholder-slate-500 backdrop-blur-sm transition-all focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
