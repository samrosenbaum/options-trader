import React from 'react'
import { TrendingUp, BarChart3, Target, AlertCircle } from 'lucide-react'

interface ProbabilityAnalysis {
  expectedValue: number
  probabilityDistribution: {
    move: number
    probability: number
    optionValue: number
  }[]
  confidenceIntervals: {
    level: number
    lower: number
    upper: number
  }[]
  scenarios: {
    scenario: string
    probability: number
    expectedReturn: number
    description: string
  }[]
  riskAdjustedScore: number
  probabilityModelUsed: string
}

interface EnhancedProbabilityDisplayProps {
  analysis: ProbabilityAnalysis
  symbol: string
  compact?: boolean
}

export function EnhancedProbabilityDisplay({ 
  analysis, 
  symbol, 
  compact = false 
}: EnhancedProbabilityDisplayProps) {
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`
  const formatCurrency = (value: number) => `$${value.toFixed(2)}`

  if (compact) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100">
              Enhanced Probability Analysis
            </h4>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              {analysis.probabilityModelUsed} • Risk Score: {analysis.riskAdjustedScore.toFixed(1)}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/70 dark:bg-slate-900/50 rounded-lg p-3">
            <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
              EXPECTED VALUE
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              {formatCurrency(analysis.expectedValue)}
            </div>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-900/50 rounded-lg p-3">
            <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
              90% CONFIDENCE
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              {formatCurrency(analysis.confidenceIntervals[0]?.lower ?? 0)} - {formatCurrency(analysis.confidenceIntervals[0]?.upper ?? 0)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <BarChart3 className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-blue-900 dark:text-blue-100 mb-2">
            Institutional Probability Analysis
          </h3>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Advanced statistical modeling using {analysis.probabilityModelUsed} with scenario analysis 
            and confidence intervals for {symbol} options pricing.
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-blue-600 dark:text-blue-400">Risk Score</div>
          <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
            {analysis.riskAdjustedScore.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Expected Value and Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
              Expected Value
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
            {formatCurrency(analysis.expectedValue)}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Probability-weighted outcome
          </div>
        </div>

        <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
              Best Scenario
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">
            {formatCurrency(Math.max(...analysis.scenarios.map(s => s.expectedReturn)))}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {formatPercent(analysis.scenarios.find(s => s.expectedReturn === Math.max(...analysis.scenarios.map(s => s.expectedReturn)))?.probability ?? 0)} probability
          </div>
        </div>

        <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
              Worst Scenario
            </div>
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400 mb-1">
            {formatCurrency(Math.min(...analysis.scenarios.map(s => s.expectedReturn)))}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {formatPercent(analysis.scenarios.find(s => s.expectedReturn === Math.min(...analysis.scenarios.map(s => s.expectedReturn)))?.probability ?? 0)} probability
          </div>
        </div>
      </div>

      {/* Confidence Intervals */}
      <div className="mb-6">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
          Confidence Intervals
        </h4>
        <div className="space-y-2">
          {analysis.confidenceIntervals.map((ci, index) => (
            <div key={index} className="flex items-center justify-between bg-white/70 dark:bg-slate-900/50 rounded-lg p-3 border border-blue-200/50 dark:border-blue-800/50">
              <div className="font-medium text-slate-900 dark:text-white">
                {ci.level}% Confidence
              </div>
              <div className="font-mono text-sm text-slate-700 dark:text-slate-300">
                {formatCurrency(ci.lower)} to {formatCurrency(ci.upper)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scenario Analysis */}
      <div className="mb-6">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
          Scenario Analysis
        </h4>
        <div className="space-y-3">
          {analysis.scenarios.map((scenario, index) => (
            <div key={index} className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-blue-200/50 dark:border-blue-800/50">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {scenario.scenario}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {scenario.description}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-slate-900 dark:text-white">
                    {formatCurrency(scenario.expectedReturn)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {formatPercent(scenario.probability)} chance
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Probability Distribution Visualization */}
      <div>
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
          Price Movement Distribution
        </h4>
        <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-blue-200/50 dark:border-blue-800/50">
          {analysis.probabilityDistribution.slice(0, 10).map((point, index) => {
            const maxProbability = Math.max(...analysis.probabilityDistribution.map(p => p.probability))
            const widthPercentage = (point.probability / maxProbability) * 100
            
            return (
              <div key={index} className="flex items-center justify-between py-2 border-b border-slate-200/50 dark:border-slate-700/50 last:border-b-0">
                <div className="flex items-center gap-3 flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-white min-w-[60px]">
                    {point.move > 0 ? '+' : ''}{formatPercent(point.move)}
                  </div>
                  <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${widthPercentage}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 min-w-[40px] text-right">
                    {formatPercent(point.probability)}
                  </div>
                </div>
                <div className="text-sm font-mono text-slate-700 dark:text-slate-300 min-w-[60px] text-right ml-4">
                  {formatCurrency(point.optionValue)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}