'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export interface WatchlistItem {
  id: string
  symbol: string
  optionType: string
  strike: number
  expiration: string
  premium: number
  score?: number | null
  riskLevel?: string | null
  daysToExpiration?: number | null
  tradeSummary?: string | null
  addedAt: string
}

interface WatchlistItemInput {
  id: string
  symbol: string
  optionType: string
  strike: number
  expiration: string
  premium: number
  score?: number | null
  riskLevel?: string | null
  daysToExpiration?: number | null
  tradeSummary?: string | null
}

interface WatchlistContextValue {
  items: WatchlistItem[]
  isReady: boolean
  addItem: (item: WatchlistItemInput) => void
  removeItem: (id: string) => void
  isOnWatchlist: (id: string) => boolean
}

const STORAGE_KEY = 'options-trader:watchlist'

const WatchlistContext = createContext<WatchlistContextValue | undefined>(undefined)

const parseStoredItems = (rawValue: string | null): WatchlistItem[] => {
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }

        const normalized: WatchlistItem = {
          id: String(item.id ?? ''),
          symbol: String(item.symbol ?? ''),
          optionType: String(item.optionType ?? ''),
          strike: Number(item.strike ?? 0),
          expiration: String(item.expiration ?? ''),
          premium: Number(item.premium ?? 0),
          score: typeof item.score === 'number' ? item.score : null,
          riskLevel: typeof item.riskLevel === 'string' ? item.riskLevel : null,
          daysToExpiration:
            typeof item.daysToExpiration === 'number' && Number.isFinite(item.daysToExpiration)
              ? item.daysToExpiration
              : null,
          tradeSummary: typeof item.tradeSummary === 'string' ? item.tradeSummary : null,
          addedAt: typeof item.addedAt === 'string' ? item.addedAt : new Date().toISOString(),
        }

        if (!normalized.id || !normalized.symbol || !normalized.expiration || !normalized.optionType) {
          return null
        }

        return normalized
      })
      .filter((item): item is WatchlistItem => Boolean(item))
  } catch (error) {
    console.warn('Failed to parse watchlist from storage', error)
    return []
  }
}

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const stored = window.localStorage.getItem(STORAGE_KEY)
    setItems(parseStoredItems(stored))
    setIsReady(true)

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) {
        return
      }
      setItems(parseStoredItems(event.newValue))
    }

    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  useEffect(() => {
    if (!isReady || typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch (error) {
      console.warn('Unable to persist watchlist to storage', error)
    }
  }, [items, isReady])

  const addItem = useCallback((item: WatchlistItemInput) => {
    setItems((prev) => {
      const existing = prev.find((entry) => entry.id === item.id)
      if (existing) {
        return prev.map((entry) =>
          entry.id === item.id
            ? {
                ...existing,
                ...item,
                addedAt: existing.addedAt,
              }
            : entry,
        )
      }

      return [
        ...prev,
        {
          ...item,
          addedAt: new Date().toISOString(),
        },
      ]
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const idSet = useMemo(() => new Set(items.map((item) => item.id)), [items])

  const isOnWatchlist = useCallback((id: string) => idSet.has(id), [idSet])

  const value = useMemo<WatchlistContextValue>(
    () => ({
      items,
      isReady,
      addItem,
      removeItem,
      isOnWatchlist,
    }),
    [items, isReady, addItem, removeItem, isOnWatchlist],
  )

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>
}

export function useWatchlist() {
  const context = useContext(WatchlistContext)
  if (!context) {
    throw new Error('useWatchlist must be used within a WatchlistProvider')
  }
  return context
}
