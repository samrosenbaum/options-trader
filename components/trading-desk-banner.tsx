'use client'

interface TradingDeskBannerProps {
  deskName?: string
}

export function TradingDeskBanner({ deskName = 'My Trading Desk' }: TradingDeskBannerProps) {
  return (
    <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="h-10 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600" />
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
              {deskName}
            </h1>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-500">
              Trading Desk
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

