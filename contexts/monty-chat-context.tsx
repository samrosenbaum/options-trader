'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface MontyChatContextType {
  messages: Message[]
  addMessage: (content: string, role?: 'user' | 'assistant') => void
  clearMessages: () => void
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
}

const MontyChatContext = createContext<MontyChatContextType | undefined>(undefined)

export function MontyChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([])

  const addMessage = useCallback((content: string, role: 'user' | 'assistant' = 'assistant') => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, newMessage])
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return (
    <MontyChatContext.Provider value={{ messages, addMessage, clearMessages, setMessages }}>
      {children}
    </MontyChatContext.Provider>
  )
}

export function useMontyChat() {
  const context = useContext(MontyChatContext)
  if (!context) {
    throw new Error('useMontyChat must be used within a MontyChatProvider')
  }
  return context
}
