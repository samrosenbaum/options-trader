import React from 'react'
import { Calculator, TrendingUp, Clock, Zap, Activity } from 'lucide-react'

interface AdvancedGreeks {
  // Standard Greeks
  delta: number
  gamma: number
  theta: number
  vega: number
  rho: number
  
  // Advanced Greeks
  charm: number    // Delta decay
  color: number    // Gamma decay
  speed: number    // Gamma of gamma
  zomma: number    // Color of vega
  ultima: number   // Vega of vega
  
  // Risk metrics
  totalRisk: number
  timeDecayRisk: number
  volatilityRisk: number
  pinRisk: number
}

interface AdvancedGreeksDisplayProps {
  greeks: AdvancedGreeks
  symbol: string
  spotPrice: number
  strike: number
  timeToExpiry: number
  compact?: boolean
}

export function AdvancedGreeksDisplay({
  greeks,
  symbol,
  spotPrice,
  strike,
  timeToExpiry,
  compact = false 
}: AdvancedGreeksDisplayProps) {
  const formatGreek = (value: number, decimals: number = 3) => {
    return Math.abs(value) < 0.001 ? '0.000' : value.toFixed(decimals)
  }

  const getRiskLevel = (value: number, thresholds: [number, number, number]): string => {
    const absValue = Math.abs(value)
    if (absValue >= thresholds[2]) return 'high'
    if (absValue >= thresholds[1]) return 'medium'
    return 'low'
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-600 dark:text-red-400'
      case 'medium': return 'text-amber-600 dark:text-amber-400'
      case 'low': return 'text-emerald-600 dark:text-emerald-400'
      default: return 'text-slate-600 dark:text-slate-400'
    }
  }

  // Risk assessments
  const deltaRisk = getRiskLevel(greeks.delta, [0.3, 0.6, 0.8])
  const gammaRisk = getRiskLevel(greeks.gamma, [0.01, 0.03, 0.05])
  const thetaRisk = getRiskLevel(greeks.theta, [0.1, 0.3, 0.5])
  const vegaRisk = getRiskLevel(greeks.vega, [0.1, 0.2, 0.4])

  if (compact) {
    return (
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
            <Calculator className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="font-semibold text-purple-900 dark:text-purple-100">
              Advanced Greeks
            </h4>
            <p className="text-xs text-purple-700 dark:text-purple-300">
              Risk Score: {greeks.totalRisk.toFixed(1)}
            </p>
            <p className="text-[11px] text-purple-600 dark:text-purple-400">
              Spot ${spotPrice.toFixed(2)} · Strike ${strike.toFixed(2)}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className="text-xs font-semibold text-purple-600 dark:text-purple-400">Δ</div>
            <div className={`text-sm font-bold ${getRiskColor(deltaRisk)}`}>
              {formatGreek(greeks.delta)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-purple-600 dark:text-purple-400">Γ</div>
            <div className={`text-sm font-bold ${getRiskColor(gammaRisk)}`}>
              {formatGreek(greeks.gamma)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-purple-600 dark:text-purple-400">Θ</div>
            <div className={`text-sm font-bold ${getRiskColor(thetaRisk)}`}>
              {formatGreek(greeks.theta)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs font-semibold text-purple-600 dark:text-purple-400">ν</div>
            <div className={`text-sm font-bold ${getRiskColor(vegaRisk)}`}>
              {formatGreek(greeks.vega)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200 dark:border-purple-800 rounded-2xl p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <Calculator className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-purple-900 dark:text-purple-100 mb-2">
            Advanced Greeks Analysis
          </h3>
          <p className="text-sm text-purple-800 dark:text-purple-200">
            Comprehensive sensitivity analysis including second and third-order Greeks for {symbol}
            ${strike} options with {timeToExpiry.toFixed(1)} days to expiry.
          </p>
          <div className="mt-2 inline-flex flex-wrap items-center gap-2 text-xs text-purple-700 dark:text-purple-300">
            <span className="rounded-full bg-purple-100 px-2 py-1 font-medium uppercase tracking-wide dark:bg-purple-900/40">
              Spot {spotPrice.toFixed(2)}
            </span>
            <span className="rounded-full bg-purple-100 px-2 py-1 font-medium uppercase tracking-wide dark:bg-purple-900/40">
              Strike {strike.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-purple-600 dark:text-purple-400">Total Risk</div>
          <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
            {greeks.totalRisk.toFixed(1)}
          </div>
        </div>
      </div>

      {/* First-Order Greeks */}
      <div className="mb-6">
        <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          First-Order Greeks (Price Sensitivities)
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-purple-200/50 dark:border-purple-800/50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                Delta (Δ)
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getRiskColor(deltaRisk)} bg-slate-100 dark:bg-slate-800`}>
                {deltaRisk.toUpperCase()}
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              {formatGreek(greeks.delta)}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              ${(Math.abs(greeks.delta) * 1).toFixed(2)} per $1 stock move
            </div>
          </div>

          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-purple-200/50 dark:border-purple-800/50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                Theta (Θ)
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getRiskColor(thetaRisk)} bg-slate-100 dark:bg-slate-800`}>
                {thetaRisk.toUpperCase()}
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              {formatGreek(greeks.theta)}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              ${Math.abs(greeks.theta).toFixed(2)} daily decay
            </div>
          </div>

          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-purple-200/50 dark:border-purple-800/50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                Vega (ν)
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getRiskColor(vegaRisk)} bg-slate-100 dark:bg-slate-800`}>
                {vegaRisk.toUpperCase()}
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              {formatGreek(greeks.vega)}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              ${(Math.abs(greeks.vega) * 1).toFixed(2)} per 1% IV change
            </div>
          </div>

          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-purple-200/50 dark:border-purple-800/50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                Rho (ρ)
              </div>
              <span className="px-2 py-1 rounded text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                LOW
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              {formatGreek(greeks.rho)}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              ${(Math.abs(greeks.rho) * 1).toFixed(2)} per 1% rate change
            </div>
          </div>
        </div>
      </div>

      {/* Second-Order Greeks */}
      <div className="mb-6">
        <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Second-Order Greeks (Acceleration)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-purple-200/50 dark:border-purple-800/50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                Gamma (Γ)
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getRiskColor(gammaRisk)} bg-slate-100 dark:bg-slate-800`}>
                {gammaRisk.toUpperCase()}
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              {formatGreek(greeks.gamma)}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
              Delta changes by {Math.abs(greeks.gamma).toFixed(3)} per $1 move
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              {Math.abs(greeks.gamma) > 0.02 ? 'High acceleration potential' : 
               Math.abs(greeks.gamma) > 0.01 ? 'Moderate acceleration' : 'Low acceleration'}
            </div>
          </div>

          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-purple-200/50 dark:border-purple-800/50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                Charm
              </div>
              <span className="px-2 py-1 rounded text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                ADVANCED
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              {formatGreek(greeks.charm)}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
              Delta decays by {Math.abs(greeks.charm).toFixed(3)} daily
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              {Math.abs(greeks.charm) > 0.01 ? 'Significant delta decay' : 'Minimal delta decay'}
            </div>
          </div>
        </div>
      </div>

      {/* Third-Order Greeks */}
      <div className="mb-6">
        <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Third-Order Greeks (Advanced Risk)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-purple-200/50 dark:border-purple-800/50">
            <div className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-2">
              Speed
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {formatGreek(greeks.speed, 4)}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Gamma of gamma - measures gamma acceleration
            </div>
          </div>

          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-purple-200/50 dark:border-purple-800/50">
            <div className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-2">
              Color
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {formatGreek(greeks.color, 4)}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Gamma decay over time
            </div>
          </div>

          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-purple-200/50 dark:border-purple-800/50">
            <div className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-2">
              Zomma
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {formatGreek(greeks.zomma, 4)}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Color sensitivity to volatility
            </div>
          </div>
        </div>
      </div>

      {/* Risk Summary */}
      <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-purple-200/50 dark:border-purple-800/50">
        <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Risk Assessment Summary
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
              Time Decay Risk
            </div>
            <div className={`text-lg font-bold ${getRiskColor(thetaRisk)}`}>
              {greeks.timeDecayRisk.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              {thetaRisk.toUpperCase()}
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
              Volatility Risk
            </div>
            <div className={`text-lg font-bold ${getRiskColor(vegaRisk)}`}>
              {greeks.volatilityRisk.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              {vegaRisk.toUpperCase()}
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
              Pin Risk
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              {greeks.pinRisk.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              @ ${strike}
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
              Overall Risk
            </div>
            <div className="text-lg font-bold text-purple-900 dark:text-purple-100">
              {greeks.totalRisk.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              COMPOSITE
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}