import React from 'react'
import { Shield, TrendingUp, AlertTriangle, Award } from 'lucide-react'

interface RiskAdjustedScoring {
  sharpeRatio: number
  kellyFraction: number
  maxDrawdown: number
  volatilityAdjustedReturn: number
  riskScore: number
  returnScore: number
  compositeScore: number
  riskLevel: 'low' | 'medium' | 'high'
  recommendedPositionSize: number
  confidenceLevel: number
}

interface RiskAdjustedScoringProps {
  scoring: RiskAdjustedScoring
  symbol: string
  compact?: boolean
}

export function RiskAdjustedScoring({ 
  scoring, 
  symbol, 
  compact = false 
}: RiskAdjustedScoringProps) {
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`
  const formatRatio = (value: number) => value.toFixed(2)

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-600 dark:text-emerald-400'
    if (score >= 70) return 'text-blue-600 dark:text-blue-400'
    if (score >= 50) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'low': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/40'
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/40'
      case 'high': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/40'
      default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-200 dark:border-slate-500/40'
    }
  }

  const getSharpeRating = (sharpe: number) => {
    if (sharpe > 2) return { rating: 'Excellent', color: 'text-emerald-600 dark:text-emerald-400' }
    if (sharpe > 1) return { rating: 'Good', color: 'text-blue-600 dark:text-blue-400' }
    if (sharpe > 0.5) return { rating: 'Acceptable', color: 'text-amber-600 dark:text-amber-400' }
    return { rating: 'Poor', color: 'text-red-600 dark:text-red-400' }
  }

  const sharpeRating = getSharpeRating(scoring.sharpeRatio)

  if (compact) {
    return (
      <div className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950/30 dark:to-blue-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Award className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="font-semibold text-emerald-900 dark:text-emerald-100">
              Risk-Adjusted Score
            </h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              Sharpe: {formatRatio(scoring.sharpeRatio)} • Kelly: {formatPercent(scoring.kellyFraction)}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/70 dark:bg-slate-900/50 rounded-lg p-3">
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
              COMPOSITE SCORE
            </div>
            <div className={`text-lg font-bold ${getScoreColor(scoring.compositeScore)}`}>
              {scoring.compositeScore.toFixed(0)}
            </div>
          </div>
          
          <div className="bg-white/70 dark:bg-slate-900/50 rounded-lg p-3">
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
              POSITION SIZE
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              {formatPercent(scoring.recommendedPositionSize)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-950/30 dark:to-blue-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <Award className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mb-2">
            Risk-Adjusted Analysis
          </h3>
          <p className="text-sm text-emerald-800 dark:text-emerald-200">
            Institutional-grade scoring system incorporating Sharpe ratio, Kelly criterion, 
            and volatility-adjusted returns for {symbol} position sizing.
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Composite Score</div>
          <div className={`text-3xl font-bold ${getScoreColor(scoring.compositeScore)}`}>
            {scoring.compositeScore.toFixed(0)}
          </div>
          <div className={`px-2 py-1 rounded-lg text-xs font-medium border ${getRiskLevelColor(scoring.riskLevel)}`}>
            {scoring.riskLevel.toUpperCase()} RISK
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-emerald-200/50 dark:border-emerald-800/50">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
              Sharpe Ratio
            </div>
          </div>
          <div className={`text-2xl font-bold ${sharpeRating.color} mb-1`}>
            {formatRatio(scoring.sharpeRatio)}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {sharpeRating.rating} risk-adjusted return
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
            {scoring.sharpeRatio > 1 ? 'Outperforming risk-free rate' : 'Underperforming risk-free rate'}
          </div>
        </div>

        <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-emerald-200/50 dark:border-emerald-800/50">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
              Kelly Fraction
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
            {formatPercent(scoring.kellyFraction)}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Optimal position size
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
            {scoring.kellyFraction > 0.1 ? 'Aggressive sizing recommended' : 
             scoring.kellyFraction > 0.05 ? 'Moderate sizing recommended' : 'Conservative sizing recommended'}
          </div>
        </div>

        <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-emerald-200/50 dark:border-emerald-800/50">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
              Max Drawdown
            </div>
          </div>
          <div className={`text-2xl font-bold mb-1 ${scoring.maxDrawdown > 0.2 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
            {formatPercent(Math.abs(scoring.maxDrawdown))}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Worst-case scenario loss
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
            {Math.abs(scoring.maxDrawdown) > 0.2 ? 'High drawdown risk' : 
             Math.abs(scoring.maxDrawdown) > 0.1 ? 'Moderate drawdown risk' : 'Low drawdown risk'}
          </div>
        </div>
      </div>

      {/* Scoring Breakdown */}
      <div className="mb-6">
        <h4 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-4">
          Scoring Breakdown
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-emerald-200/50 dark:border-emerald-800/50">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Return Score
              </div>
              <div className={`text-lg font-bold ${getScoreColor(scoring.returnScore)}`}>
                {scoring.returnScore.toFixed(0)}
              </div>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-2">
              <div 
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(scoring.returnScore, 100)}%` }}
              />
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Vol-Adj Return: {formatPercent(scoring.volatilityAdjustedReturn)}
            </div>
          </div>

          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-emerald-200/50 dark:border-emerald-800/50">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Risk Score
              </div>
              <div className={`text-lg font-bold ${getScoreColor(100 - scoring.riskScore)}`}>
                {(100 - scoring.riskScore).toFixed(0)}
              </div>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-2">
              <div 
                className="bg-red-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(scoring.riskScore, 100)}%` }}
              />
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Lower is better (inverted for display)
            </div>
          </div>
        </div>
      </div>

      {/* Position Sizing Recommendations */}
      <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-emerald-200/50 dark:border-emerald-800/50">
        <h4 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-3">
          Position Sizing Recommendations
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
              Kelly Optimal
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              {formatPercent(scoring.kellyFraction)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              Theoretical maximum
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
              Recommended
            </div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {formatPercent(scoring.recommendedPositionSize)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              Risk-adjusted optimal
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
              Confidence Level
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              {formatPercent(scoring.confidenceLevel)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500">
              Statistical confidence
            </div>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-emerald-100/50 dark:bg-emerald-800/20 rounded-lg border border-emerald-200/50 dark:border-emerald-700/50">
          <div className="text-sm text-emerald-800 dark:text-emerald-200">
            <strong>Position Sizing Guidance:</strong> {' '}
            {scoring.recommendedPositionSize > 0.1 
              ? 'This trade shows strong risk-adjusted returns and can support aggressive position sizing.'
              : scoring.recommendedPositionSize > 0.05
                ? 'This trade offers moderate risk-adjusted returns suitable for standard position sizing.'
                : 'This trade requires conservative position sizing due to risk-return profile.'
            }
          </div>
        </div>
      </div>
    </div>
  )
}