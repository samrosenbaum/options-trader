'use client'

interface TradingDeskBannerProps {
  deskName?: string
}

export function TradingDeskBanner({ deskName = 'My Trading Desk' }: TradingDeskBannerProps) {
  return (
    <div className="relative border-b border-emerald-500/10 bg-gradient-to-r from-slate-900/40 via-slate-900/30 to-slate-900/40 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Desk Name - Centered */}
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gradient-to-b from-emerald-400 to-emerald-600 rounded-full" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white font-display">
                {deskName}
              </h1>
              <p className="text-xs text-emerald-400/60 tracking-wide uppercase">
                Trading Desk
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle bottom gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
    </div>
  )
}
