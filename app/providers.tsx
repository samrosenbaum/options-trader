'use client'

import type { ReactNode } from 'react'
import { WatchlistProvider } from '@/components/watchlist-context'
import { InteractiveMontyChat } from '@/components/interactive-monty-chat'
import { MontyChatProvider } from '@/contexts/monty-chat-context'
import { ScanProvider } from '@/contexts/scan-context'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <MontyChatProvider>
      <ScanProvider>
        <WatchlistProvider>
          {children}
          <InteractiveMontyChat />
        </WatchlistProvider>
      </ScanProvider>
    </MontyChatProvider>
  )
}
