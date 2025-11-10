'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type WatchlistRow = Database['public']['Tables']['watchlist']['Row']

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

// Convert Supabase row to WatchlistItem format
const rowToItem = (row: WatchlistRow): WatchlistItem => ({
  id: row.id,
  symbol: row.symbol,
  optionType: row.option_type,
  strike: row.strike,
  expiration: row.expiration,
  premium: row.premium,
  score: row.score,
  riskLevel: row.risk_level,
  daysToExpiration: row.days_to_expiration,
  tradeSummary: row.trade_summary,
  addedAt: row.added_at,
})

// Convert WatchlistItem to Supabase insert format
const itemToInsert = (item: WatchlistItemInput, userId: string): Database['public']['Tables']['watchlist']['Insert'] => ({
  id: item.id,
  user_id: userId,
  symbol: item.symbol,
  option_type: item.optionType as 'call' | 'put',
  strike: item.strike,
  expiration: item.expiration,
  premium: item.premium,
  score: item.score ?? null,
  risk_level: item.riskLevel ?? null,
  days_to_expiration: item.daysToExpiration ?? null,
  trade_summary: item.tradeSummary ?? null,
  added_at: new Date().toISOString(),
})

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
      .filter((item: WatchlistItem | null): item is WatchlistItem => Boolean(item))
  } catch (error) {
    console.warn('Failed to parse watchlist from storage', error)
    return []
  }
}

export function WatchlistProvider({ children }: { children: React.ReactNode}) {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [isReady, setIsReady] = useState(false)
  const supabase = createClient()

  // Load watchlist from Supabase on mount
  useEffect(() => {
    const loadWatchlist = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          // Not logged in - use localStorage fallback
          if (typeof window !== 'undefined') {
            const stored = window.localStorage.getItem(STORAGE_KEY)
            setItems(parseStoredItems(stored))
          }
          setIsReady(true)
          return
        }

        // Logged in - fetch from Supabase
        const { data, error } = await supabase
          .from('watchlist')
          .select('*')
          .eq('user_id', user.id)
          .order('added_at', { ascending: false })

        if (error) {
          console.error('Failed to load watchlist from Supabase:', error)
          // Fallback to localStorage
          if (typeof window !== 'undefined') {
            const stored = window.localStorage.getItem(STORAGE_KEY)
            setItems(parseStoredItems(stored))
          }
        } else {
          const loadedItems = (data || []).map(rowToItem)
          setItems(loadedItems)

          // Also update localStorage cache for offline access
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loadedItems))
          }
        }
      } catch (error) {
        console.error('Error loading watchlist:', error)
        // Fallback to localStorage
        if (typeof window !== 'undefined') {
          const stored = window.localStorage.getItem(STORAGE_KEY)
          setItems(parseStoredItems(stored))
        }
      } finally {
        setIsReady(true)
      }
    }

    loadWatchlist()
  }, [supabase])

  // Update localStorage cache when items change
  useEffect(() => {
    if (!isReady || typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch (error) {
      console.warn('Unable to persist watchlist to localStorage cache', error)
    }
  }, [items, isReady])

  const addItem = useCallback(async (item: WatchlistItemInput) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Not logged in - use localStorage only
        setItems((prev) => {
          const existing = prev.find((entry) => entry.id === item.id)
          if (existing) {
            return prev.map((entry) =>
              entry.id === item.id
                ? { ...existing, ...item, addedAt: existing.addedAt }
                : entry
            )
          }
          return [...prev, { ...item, addedAt: new Date().toISOString() }]
        })
        return
      }

      // Logged in - save to Supabase
      const existing = items.find((entry) => entry.id === item.id)

      if (existing) {
        // Update existing item
        const { error } = await supabase
          .from('watchlist')
          .update({
            symbol: item.symbol,
            option_type: item.optionType as 'call' | 'put',
            strike: item.strike,
            expiration: item.expiration,
            premium: item.premium,
            score: item.score ?? null,
            risk_level: item.riskLevel ?? null,
            days_to_expiration: item.daysToExpiration ?? null,
            trade_summary: item.tradeSummary ?? null,
          })
          .eq('id', item.id)
          .eq('user_id', user.id)

        if (error) {
          console.error('Failed to update watchlist item in Supabase:', error)
          return
        }

        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? { ...existing, ...item, addedAt: existing.addedAt }
              : entry
          )
        )
      } else {
        // Insert new item
        const insertData = itemToInsert(item, user.id)
        const { error } = await supabase
          .from('watchlist')
          .insert(insertData)

        if (error) {
          console.error('Failed to add watchlist item to Supabase:', error)
          return
        }

        setItems((prev) => [
          ...prev,
          { ...item, addedAt: insertData.added_at || new Date().toISOString() },
        ])
      }
    } catch (error) {
      console.error('Error adding watchlist item:', error)
    }
  }, [supabase, items])

  const removeItem = useCallback(async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Not logged in - remove from localStorage only
        setItems((prev) => prev.filter((item) => item.id !== id))
        return
      }

      // Logged in - remove from Supabase
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        console.error('Failed to remove watchlist item from Supabase:', error)
        return
      }

      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch (error) {
      console.error('Error removing watchlist item:', error)
    }
  }, [supabase])

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
