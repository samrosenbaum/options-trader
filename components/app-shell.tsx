import type { ReactNode } from 'react'

import Navigation from '@/components/navigation'
import { cn } from '@/lib/utils'

type AppShellProps = {
  children: ReactNode
  userEmail?: string
  wrapperClassName?: string
  mainClassName?: string
}

export default function AppShell({
  children,
  userEmail,
  wrapperClassName,
  mainClassName,
}: AppShellProps) {
  return (
    <div className={cn('flex min-h-screen bg-slate-50', wrapperClassName)}>
      <Navigation userEmail={userEmail} />
      <main className={cn('flex-1 overflow-y-auto', mainClassName)}>{children}</main>
    </div>
  )
}
