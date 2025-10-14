'use client'

import type { ReactNode } from 'react'
import { WatchlistProvider } from '@/components/watchlist-context'

export default function Providers({ children }: { children: ReactNode }) {
  return <WatchlistProvider>{children}</WatchlistProvider>
}
