'use client'

export type ScannerMode = 'smart' | 'custom'

interface ScannerModeToggleProps {
  mode: ScannerMode
  onChange: (mode: ScannerMode) => void
}

export function ScannerModeToggle({ mode, onChange }: ScannerModeToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/10 p-1 backdrop-blur-sm">
      <button
        onClick={() => onChange('smart')}
        className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-widest transition-all duration-200 ${
          mode === 'smart'
            ? 'bg-gradient-to-r from-sky-500 via-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/40'
            : 'text-emerald-100/70 hover:text-emerald-100'
        }`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <span>Smart Scanner</span>
        {mode === 'smart' && (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4em]">Pro</span>
        )}
      </button>

      <button
        onClick={() => onChange('custom')}
        className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-widest transition-all duration-200 ${
          mode === 'custom'
            ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 text-slate-950 shadow-lg shadow-emerald-500/40'
            : 'text-emerald-100/70 hover:text-emerald-100'
        }`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          />
        </svg>
        <span>Custom Scanner</span>
        {mode === 'custom' && (
          <span className="rounded-full bg-slate-950/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4em]">Free</span>
        )}
      </button>
    </div>
  )
}

export function ScannerModeDescription({ mode }: { mode: ScannerMode }) {
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
      {mode === 'smart' ? (
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-sky-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-1">
              Institutional-Grade Analysis
            </h4>
            <p className="text-sm text-emerald-100/70 leading-relaxed">
              Our proprietary algorithm analyzes 7 scoring dimensions including unusual volume detection,
              gamma squeeze potential, IV anomalies, and event catalysts to surface the highest-probability trades.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-1">
              Your Rules, Your Way
            </h4>
            <p className="text-sm text-emerald-100/70 leading-relaxed">
              Set your own criteria - volume, greeks, IV, expiration, and more. Perfect for testing
              strategies, learning options mechanics, and finding trades that match your specific requirements.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
