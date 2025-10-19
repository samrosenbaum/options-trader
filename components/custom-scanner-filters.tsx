'use client'

import { useState } from 'react'

// Tooltip component
function Tooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-block ml-1">
      <svg
        className="w-4 h-4 text-emerald-200/80 hover:text-emerald-100 cursor-help inline-block"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <div className="invisible group-hover:visible absolute left-0 top-6 z-50 w-64 p-3 bg-slate-900/95 backdrop-blur-xl text-white text-xs rounded-xl shadow-2xl shadow-emerald-500/20 border border-emerald-500/30">
        <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 border-l border-t border-emerald-500/30 transform rotate-45"></div>
        {text}
      </div>
    </div>
  )
}

export interface CustomFilterCriteria {
  // Volume & Liquidity
  minVolume?: number
  minOpenInterest?: number
  maxSpreadPercent?: number

  // Greeks
  minDelta?: number
  maxDelta?: number
  minGamma?: number
  maxGamma?: number
  minTheta?: number
  maxTheta?: number
  minVega?: number
  maxVega?: number

  // IV & Time
  minIV?: number
  maxIV?: number
  minDTE?: number
  maxDTE?: number

  // Option Type
  optionType?: 'call' | 'put' | 'both'

  // Strike & Price
  minStrike?: number
  maxStrike?: number
  minPremium?: number
  maxPremium?: number
}

interface CustomScannerFiltersProps {
  criteria: CustomFilterCriteria
  onChange: (criteria: CustomFilterCriteria) => void
  matchCount?: number
  totalCount?: number
}

export function CustomScannerFilters({
  criteria,
  onChange,
  matchCount,
  totalCount,
}: CustomScannerFiltersProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    volume: true,
    greeks: false,
    ivTime: false,
    other: false,
  })

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const updateCriteria = (updates: Partial<CustomFilterCriteria>) => {
    onChange({ ...criteria, ...updates })
  }

  const clearFilters = () => {
    onChange({})
  }

  const activeFilterCount = Object.keys(criteria).filter(
    (key) => criteria[key as keyof CustomFilterCriteria] !== undefined
  ).length

  return (
    <div className="space-y-4 p-6 border border-white/10 bg-white/5 backdrop-blur-xl rounded-2xl shadow-lg shadow-emerald-500/10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Custom Filters
          </h3>
          <p className="text-sm text-emerald-100/70 mt-1">
            {activeFilterCount > 0 ? (
              <>
                {matchCount !== undefined && totalCount !== undefined ? (
                  <span className="font-medium text-emerald-300">
                    {matchCount} of {totalCount} options match
                  </span>
                ) : (
                  <span>{activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active</span>
                )}
              </>
            ) : (
              'Set your criteria to find options'
            )}
          </p>
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-sm font-medium text-rose-200 hover:text-rose-100 hover:bg-rose-500/10 rounded-lg transition-colors border border-rose-400/30"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Workflow Callout */}
      {totalCount === 0 ? (
        <div className="mb-4 p-4 bg-sky-500/10 border border-sky-400/40 backdrop-blur-sm rounded-xl">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-sky-300 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="text-sm font-semibold text-white">
                How Custom Filters Work
              </p>
              <p className="text-sm text-sky-100/80 mt-1">
                Click the <strong>"Scan"</strong> button above to load options data first. Then use these filters to instantly narrow down the results to match your criteria.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-400/40 backdrop-blur-sm rounded-xl">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-emerald-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <p className="text-xs text-emerald-100">
              Filtering {totalCount} scanned options in real-time
            </p>
          </div>
        </div>
      )}

      {/* Volume & Liquidity Section */}
      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/10 backdrop-blur-sm">
        <button
          onClick={() => toggleSection('volume')}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
        >
          <span className="font-medium text-white">Volume & Liquidity</span>
          <span className="text-emerald-200/70">{expandedSections.volume ? '−' : '+'}</span>
        </button>
        {expandedSections.volume && (
          <div className="p-4 space-y-4 bg-white/5 border-t border-white/10">
            <div>
              <label className="block text-sm font-medium text-emerald-100/90 mb-2">
                Min Volume: {criteria.minVolume?.toLocaleString() || 'Any'}
                <Tooltip text="Number of option contracts traded today. Higher volume = easier to buy/sell quickly. Institutional traders typically look for 500+ volume." />
              </label>
              <input
                type="range"
                min="0"
                max="10000"
                step="100"
                value={criteria.minVolume || 0}
                onChange={(e) => updateCriteria({ minVolume: Number(e.target.value) || undefined })}
                className="w-full accent-emerald-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-emerald-100/90 mb-2">
                Min Open Interest: {criteria.minOpenInterest?.toLocaleString() || 'Any'}
                <Tooltip text="Total number of outstanding option contracts. Shows how popular this strike is. High OI (10,000+) = institutional interest. Low OI = illiquid, harder to exit." />
              </label>
              <input
                type="range"
                min="0"
                max="50000"
                step="500"
                value={criteria.minOpenInterest || 0}
                onChange={(e) => updateCriteria({ minOpenInterest: Number(e.target.value) || undefined })}
                className="w-full accent-emerald-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-emerald-100/90 mb-2">
                Max Spread: {criteria.maxSpreadPercent ? `${(criteria.maxSpreadPercent * 100).toFixed(1)}%` : 'Any'}
                <Tooltip text="Difference between bid and ask price. Tight spreads (<5%) = liquid markets, easy to trade. Wide spreads (>10%) = pay more to enter/exit trades." />
              </label>
              <input
                type="range"
                min="0"
                max="0.20"
                step="0.01"
                value={criteria.maxSpreadPercent || 0.20}
                onChange={(e) => updateCriteria({ maxSpreadPercent: Number(e.target.value) || undefined })}
                className="w-full accent-emerald-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* Greeks Section */}
      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/10 backdrop-blur-sm">
        <button
          onClick={() => toggleSection('greeks')}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
        >
          <span className="font-medium text-white">Greeks</span>
          <span className="text-emerald-200/70">{expandedSections.greeks ? '−' : '+'}</span>
        </button>
        {expandedSections.greeks && (
          <div className="p-4 space-y-4 bg-white/5 border-t border-white/10">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-emerald-100/90 mb-2">
                  Min Delta: {criteria.minDelta?.toFixed(2) || 'Any'}
                  <Tooltip text="How much the option price moves when stock moves $1. Delta 0.5 = option moves $0.50 per $1 stock move. High delta (0.7-0.9) = acts like stock. Low delta (0.2-0.4) = cheaper but slower to profit." />
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={criteria.minDelta || 0}
                  onChange={(e) => updateCriteria({ minDelta: Number(e.target.value) || undefined })}
                  className="w-full accent-green-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-emerald-100/90 mb-2">
                  Max Delta: {criteria.maxDelta?.toFixed(2) || 'Any'}
                  <Tooltip text="Set maximum delta to filter out options that are too far in-the-money. Lower max delta = more speculative plays." />
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={criteria.maxDelta || 1}
                  onChange={(e) => updateCriteria({ maxDelta: Number(e.target.value) || undefined })}
                  className="w-full accent-green-600"
                />
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-emerald-200/70 mt-2 bg-slate-100 dark:bg-slate-800/50 p-2 rounded">
              💡 <strong>Quick Guide:</strong> Delta 0.5 = 50% chance of expiring in-the-money. Higher delta = safer but more expensive. Lower delta = lottery ticket.
            </div>
          </div>
        )}
      </div>

      {/* IV & Time Section */}
      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/10 backdrop-blur-sm">
        <button
          onClick={() => toggleSection('ivTime')}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
        >
          <span className="font-medium text-white">IV & Expiration</span>
          <span className="text-emerald-200/70">{expandedSections.ivTime ? '−' : '+'}</span>
        </button>
        {expandedSections.ivTime && (
          <div className="p-4 space-y-4 bg-white/5 border-t border-white/10">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-emerald-100/90 mb-2">
                  Min IV: {criteria.minIV ? `${(criteria.minIV * 100).toFixed(0)}%` : 'Any'}
                  <Tooltip text="Implied Volatility - Market's expectation of future price movement. High IV (60%+) = expensive options, big moves expected. Low IV (20-40%) = cheap options, calm expected. Sell high IV, buy low IV." />
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={criteria.minIV || 0}
                  onChange={(e) => updateCriteria({ minIV: Number(e.target.value) || undefined })}
                  className="w-full accent-purple-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-emerald-100/90 mb-2">
                  Max IV: {criteria.maxIV ? `${(criteria.maxIV * 100).toFixed(0)}%` : 'Any'}
                  <Tooltip text="Filter out options with too high IV. Very high IV (100%+) often means earnings coming up or major news - risky!" />
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={criteria.maxIV || 2}
                  onChange={(e) => updateCriteria({ maxIV: Number(e.target.value) || undefined })}
                  className="w-full accent-purple-600"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-emerald-100/90 mb-2">
                  Min DTE: {criteria.minDTE || 'Any'}
                  <Tooltip text="Days To Expiration - How long until the option expires. 0-7 days = weekly plays, high risk/reward. 30-60 days = sweet spot for most strategies. 90+ days = LEAPS, lower theta decay." />
                </label>
                <input
                  type="range"
                  min="0"
                  max="365"
                  step="7"
                  value={criteria.minDTE || 0}
                  onChange={(e) => updateCriteria({ minDTE: Number(e.target.value) || undefined })}
                  className="w-full accent-orange-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-emerald-100/90 mb-2">
                  Max DTE: {criteria.maxDTE || 'Any'}
                  <Tooltip text="Set maximum days to expiration. Shorter DTE = faster gains/losses. Longer DTE = more time to be right, but ties up capital longer." />
                </label>
                <input
                  type="range"
                  min="0"
                  max="365"
                  step="7"
                  value={criteria.maxDTE || 365}
                  onChange={(e) => updateCriteria({ maxDTE: Number(e.target.value) || undefined })}
                  className="w-full accent-orange-600"
                />
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-emerald-200/70 mt-2 bg-slate-100 dark:bg-slate-800/50 p-2 rounded">
              💡 <strong>Pro Tip:</strong> High IV = good for selling options. Low IV = good for buying options. DTE 30-45 days is the "Goldilocks zone" for most traders.
            </div>
          </div>
        )}
      </div>

      {/* Other Filters Section */}
      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/10 backdrop-blur-sm">
        <button
          onClick={() => toggleSection('other')}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
        >
          <span className="font-medium text-white">Type & Price</span>
          <span className="text-emerald-200/70">{expandedSections.other ? '−' : '+'}</span>
        </button>
        {expandedSections.other && (
          <div className="p-4 space-y-4 bg-white/5 border-t border-white/10">
            <div>
              <label className="block text-sm font-medium text-emerald-100/90 mb-2">
                Option Type
                <Tooltip text="Calls profit when stock goes UP. Puts profit when stock goes DOWN. 'Both' shows all options." />
              </label>
              <div className="flex gap-2">
                {(['both', 'call', 'put'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => updateCriteria({ optionType: type === 'both' ? undefined : type })}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                      (criteria.optionType === type) || (type === 'both' && !criteria.optionType)
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white dark:bg-slate-700 text-emerald-100/90 hover:bg-slate-100 dark:hover:bg-slate-600'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-emerald-100/90 mb-2">
                  Min Premium: ${criteria.minPremium?.toFixed(2) || 'Any'}
                  <Tooltip text="Cost per share to buy the option (multiply by 100 for total cost). Low premium ($0.50-$2) = affordable but riskier. High premium ($5+) = expensive but safer/more likely to profit." />
                </label>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="0.5"
                  value={criteria.minPremium || 0}
                  onChange={(e) => updateCriteria({ minPremium: Number(e.target.value) || undefined })}
                  className="w-full accent-emerald-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-emerald-100/90 mb-2">
                  Max Premium: ${criteria.maxPremium?.toFixed(2) || 'Any'}
                  <Tooltip text="Filter out expensive options. Good for limiting risk - you can't lose more than the premium you paid!" />
                </label>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="0.5"
                  value={criteria.maxPremium || 50}
                  onChange={(e) => updateCriteria({ maxPremium: Number(e.target.value) || undefined })}
                  className="w-full accent-emerald-600"
                />
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-emerald-200/70 mt-2 bg-slate-100 dark:bg-slate-800/50 p-2 rounded">
              💡 <strong>Remember:</strong> Premium shown is per share. Total cost = Premium × 100. Example: $2.50 premium = $250 total risk per contract.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
