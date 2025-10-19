'use client'

export type ScannerMode = 'smart' | 'custom'

interface ScannerModeToggleProps {
  mode: ScannerMode
  onChange: (mode: ScannerMode) => void
}

export function ScannerModeToggle({ mode, onChange }: ScannerModeToggleProps) {
  return (
    <div className="inline-flex items-center gap-3 p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg">
      <button
        onClick={() => onChange('smart')}
        className={`
          relative px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200
          ${
            mode === 'smart'
              ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }
        `}
      >
        <div className="flex items-center gap-2">
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
            <span className="ml-1 px-2 py-0.5 text-xs bg-white/20 rounded-full">PRO</span>
          )}
        </div>
      </button>

      <button
        onClick={() => onChange('custom')}
        className={`
          relative px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200
          ${
            mode === 'custom'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }
        `}
      >
        <div className="flex items-center gap-2">
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
            <span className="ml-1 px-2 py-0.5 text-xs bg-white/20 rounded-full">FREE</span>
          )}
        </div>
      </button>
    </div>
  )
}

export function ScannerModeDescription({ mode }: { mode: ScannerMode }) {
  return (
    <div className="mt-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
      {mode === 'smart' ? (
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-blue-600 dark:text-blue-400"
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
            <h4 className="font-semibold text-slate-900 dark:text-white mb-1">
              Institutional-Grade Analysis
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Our proprietary algorithm analyzes 7 scoring dimensions including unusual volume detection,
              gamma squeeze potential, IV anomalies, and event catalysts to surface the highest-probability trades.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-emerald-600 dark:text-emerald-400"
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
            <h4 className="font-semibold text-slate-900 dark:text-white mb-1">
              Your Rules, Your Way
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Set your own criteria - volume, greeks, IV, expiration, and more. Perfect for testing
              strategies, learning options mechanics, and finding trades that match your specific requirements.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
