'use client'

import type { ReactNode } from 'react'
import { WatchlistProvider } from '@/components/watchlist-context'
import { InteractiveMontyChat } from '@/components/interactive-monty-chat'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WatchlistProvider>
      {children}
      <InteractiveMontyChat />
    </WatchlistProvider>
  )
}
