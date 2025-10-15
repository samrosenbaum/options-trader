/**
 * Reference Implementation: Opportunity Card with On-Demand Enhancements
 *
 * This component shows:
 * 1. All initial scan data (sentiment, volume, Greeks) - ALWAYS visible
 * 2. Enhancement buttons for on-demand analysis
 * 3. Expandable sections for backtest and historical results
 */

import { useState } from 'react'

interface Opportunity {
  // Basic Info
  symbol: string
  optionType: 'call' | 'put'
  strike: number
  expiration: string
  premium: number
  stockPrice: number
  score: number
  daysToExpiration: number

  // Sentiment Analysis (ALWAYS included)
  swingSignal?: {
    classification: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
    compositeScore: number
    factors: Array<{
      name: string
      score: number
      rationale: string
    }>
  }

  // Volume & Liquidity (ALWAYS included)
  volume: number
  openInterest: number
  volumeRatio: number
  impliedVolatility: number
  ivRank: number
  _dataQuality: {
    quality: 'HIGH' | 'GOOD' | 'ACCEPTABLE' | 'LOW' | 'REJECTED'
    score: number
  }

  // Greeks (ALWAYS included)
  greeks: {
    delta: number
    gamma: number
    theta: number
    vega: number
    rho?: number
  }

  // Probability & Risk (ALWAYS included)
  probabilityOfProfit: number
  riskLevel: 'low' | 'medium' | 'high' | 'extreme'
  potentialReturn: number
  maxReturn: number
  breakevenPrice: number
  breakevenMovePercent: number
  riskRewardRatio: number

  // Enhanced Analysis (if available)
  enhancedAnalysis?: {
    probabilityAnalysis: {
      probabilityOfProfit: number
      expectedValue: number
    }
    riskMetrics: {
      riskAdjustedScore: number
    }
  }

  // Position Sizing (ALWAYS included)
  positionSizing?: {
    recommendedFraction: number
    conservativeFraction: number
    aggressiveFraction: number
    kellyFraction: number
    riskBudgetTier: string
    capitalAllocationExamples: Array<{
      portfolio: number
      contracts: number
      capitalAtRisk: number
      allocationPercent: number
    }>
  }

  // Reasoning (ALWAYS included)
  reasoning: string[]
  catalysts: string[]
  patterns?: string[]
}

interface BacktestResult {
  winRate: number
  avgReturn: number
  maxDrawdown: number
  sharpeRatio: number
  similarTradesFound: number
  summary: string
  confidence: 'high' | 'medium' | 'low'
}

interface HistoricalResult {
  available: boolean
  requiredMove: number
  daysToExpiration: number
  direction: 'up' | 'down'
  historicalFrequency: number
  recentExamples: Array<{
    date: string
    move: number
    achieved: boolean
  }>
  summary: string
  confidence: 'high' | 'medium' | 'low'
}

export function OpportunityCard({ opportunity, portfolioSize = 10000 }: { opportunity: Opportunity, portfolioSize?: number }) {
  const [backtest, setBacktest] = useState<BacktestResult | null>(null)
  const [historical, setHistorical] = useState<HistoricalResult | null>(null)
  const [loadingBacktest, setLoadingBacktest] = useState(false)
  const [loadingHistorical, setLoadingHistorical] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    details: false,
    greeks: false,
    reasoning: false,
    backtest: false,
    historical: false
  })

  const runBacktest = async () => {
    setLoadingBacktest(true)
    try {
      const response = await fetch('/api/enhance/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: opportunity.symbol,
          optionType: opportunity.optionType,
          strike: opportunity.strike,
          stockPrice: opportunity.stockPrice,
          premium: opportunity.premium,
          daysToExpiration: opportunity.daysToExpiration,
          impliedVolatility: opportunity.impliedVolatility
        })
      })
      const data = await response.json()
      setBacktest(data.backtest)
      setExpandedSections(prev => ({ ...prev, backtest: true }))
    } catch (error) {
      console.error('Backtest failed:', error)
    } finally {
      setLoadingBacktest(false)
    }
  }

  const runHistoricalAnalysis = async () => {
    setLoadingHistorical(true)
    try {
      const response = await fetch('/api/enhance/historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: opportunity.symbol,
          optionType: opportunity.optionType,
          strike: opportunity.strike,
          stockPrice: opportunity.stockPrice,
          premium: opportunity.premium,
          expiration: opportunity.expiration
        })
      })
      const data = await response.json()
      setHistorical(data.historical)
      setExpandedSections(prev => ({ ...prev, historical: true }))
    } catch (error) {
      console.error('Historical analysis failed:', error)
    } finally {
      setLoadingHistorical(false)
    }
  }

  const getSentimentBadgeClass = () => {
    if (!opportunity.swingSignal) return 'bg-gray-100 text-gray-700'
    switch (opportunity.swingSignal.classification) {
      case 'BULLISH': return 'bg-green-100 text-green-800 border-green-300'
      case 'BEARISH': return 'bg-red-100 text-red-800 border-red-300'
      default: return 'bg-gray-100 text-gray-700 border-gray-300'
    }
  }

  const getQualityBadgeClass = () => {
    const quality = opportunity._dataQuality?.quality || 'UNKNOWN'
    switch (quality) {
      case 'HIGH': return 'bg-green-100 text-green-800'
      case 'GOOD': return 'bg-blue-100 text-blue-800'
      case 'ACCEPTABLE': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-red-100 text-red-800'
    }
  }

  const positionExample = opportunity.positionSizing?.capitalAllocationExamples?.find(
    ex => ex.portfolio === portfolioSize
  ) || opportunity.positionSizing?.capitalAllocationExamples?.[0]

  return (
    <div className="opportunity-card border border-gray-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">

      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-xl font-bold text-gray-900">
            {opportunity.symbol} ${opportunity.strike} {opportunity.optionType}
          </h3>
          <p className="text-sm text-gray-600">
            Expires {opportunity.expiration} ({opportunity.daysToExpiration} days)
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-600">{opportunity.score.toFixed(1)}</div>
          <div className="text-xs text-gray-500">Score</div>
        </div>
      </div>

      {/* Sentiment Badge - ALWAYS VISIBLE */}
      {opportunity.swingSignal && (
        <div className={`mb-3 p-3 rounded-lg border ${getSentimentBadgeClass()}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm uppercase">
              📈 {opportunity.swingSignal.classification} Signal
            </span>
            <span className="text-sm font-mono">
              {opportunity.swingSignal.compositeScore.toFixed(1)}/100
            </span>
          </div>
          {opportunity.swingSignal.factors.slice(0, 2).map((factor, i) => (
            <div key={i} className="text-xs mt-1">
              • {factor.rationale}
            </div>
          ))}
        </div>
      )}

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-xs text-gray-600">Premium</div>
          <div className="text-lg font-semibold">${opportunity.premium}</div>
        </div>
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-xs text-gray-600">Win Probability</div>
          <div className="text-lg font-semibold">
            {opportunity.probabilityOfProfit.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Volume & Quality - ALWAYS VISIBLE */}
      <div className="flex items-center gap-3 mb-3 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-gray-600">Volume:</span>
          <span className="font-semibold">{opportunity.volume.toLocaleString()}</span>
          {opportunity.volume >= 100 ? (
            <span className="text-green-600">✓</span>
          ) : (
            <span className="text-yellow-600">⚠</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-600">OI:</span>
          <span className="font-semibold">{opportunity.openInterest.toLocaleString()}</span>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${getQualityBadgeClass()}`}>
          {opportunity._dataQuality?.quality || 'UNKNOWN'}
        </div>
      </div>

      {/* Greeks Summary - ALWAYS VISIBLE */}
      <div className="mb-3 p-3 bg-blue-50 rounded-lg">
        <div className="text-xs font-semibold text-blue-900 mb-2">Greeks</div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div>
            <div className="text-gray-600">Delta</div>
            <div className="font-mono font-semibold">{opportunity.greeks.delta.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-gray-600">Gamma</div>
            <div className="font-mono font-semibold">{opportunity.greeks.gamma.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-gray-600">Theta</div>
            <div className="font-mono font-semibold">{opportunity.greeks.theta.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-gray-600">Vega</div>
            <div className="font-mono font-semibold">{opportunity.greeks.vega.toFixed(2)}</div>
          </div>
        </div>
        {expandedSections.greeks && (
          <div className="mt-2 pt-2 border-t border-blue-200 text-xs">
            <div className="text-gray-700">
              • Delta: {(Math.abs(opportunity.greeks.delta) * 100).toFixed(0)}% chance of expiring ITM
            </div>
            <div className="text-gray-700">
              • Theta: Loses ${Math.abs(opportunity.greeks.theta * 100).toFixed(2)}/day from time decay
            </div>
            <div className="text-gray-700">
              • Vega: Gains ${(opportunity.greeks.vega * 100).toFixed(2)} per 1% IV increase
            </div>
          </div>
        )}
        <button
          onClick={() => setExpandedSections(prev => ({ ...prev, greeks: !prev.greeks }))}
          className="text-xs text-blue-600 hover:text-blue-800 mt-2"
        >
          {expandedSections.greeks ? '▼ Show Less' : '▶ Show More'}
        </button>
      </div>

      {/* Risk Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-gray-600">Risk Level</div>
          <div className={`font-semibold capitalize ${
            opportunity.riskLevel === 'low' ? 'text-green-600' :
            opportunity.riskLevel === 'medium' ? 'text-yellow-600' :
            'text-red-600'
          }`}>
            {opportunity.riskLevel}
          </div>
        </div>
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-gray-600">R/R Ratio</div>
          <div className="font-semibold">{opportunity.riskRewardRatio?.toFixed(2)}x</div>
        </div>
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-gray-600">Breakeven</div>
          <div className="font-semibold">${opportunity.breakevenPrice.toFixed(2)}</div>
          <div className="text-gray-500">({opportunity.breakevenMovePercent.toFixed(1)}%)</div>
        </div>
      </div>

      {/* Position Sizing - if available */}
      {positionExample && (
        <div className="mb-3 p-3 bg-purple-50 rounded-lg">
          <div className="text-xs font-semibold text-purple-900 mb-1">
            Recommended Position Size
          </div>
          <div className="text-sm">
            <span className="font-bold">{positionExample.contracts}</span> contract
            {positionExample.contracts !== 1 ? 's' : ''}
            <span className="text-gray-600"> = </span>
            <span className="font-bold">${positionExample.capitalAtRisk}</span>
            <span className="text-gray-600"> ({positionExample.allocationPercent.toFixed(1)}% of ${portfolioSize.toLocaleString()})</span>
          </div>
          <div className="text-xs text-purple-700 mt-1">
            {opportunity.positionSizing?.riskBudgetTier} tier • Kelly: {((opportunity.positionSizing?.kellyFraction ?? 0) * 100).toFixed(1)}%
          </div>
        </div>
      )}

      {/* Reasoning - Expandable */}
      {opportunity.reasoning && opportunity.reasoning.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setExpandedSections(prev => ({ ...prev, reasoning: !prev.reasoning }))}
            className="text-sm font-semibold text-gray-700 hover:text-gray-900"
          >
            {expandedSections.reasoning ? '▼' : '▶'} Why This Trade?
          </button>
          {expandedSections.reasoning && (
            <div className="mt-2 space-y-1">
              {opportunity.reasoning.map((reason, i) => (
                <div key={i} className="text-xs text-gray-700">• {reason}</div>
              ))}
              {opportunity.catalysts?.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-gray-600">Catalysts:</div>
                  {opportunity.catalysts.map((catalyst, i) => (
                    <div key={i} className="text-xs text-gray-700">• {catalyst}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ENHANCEMENT BUTTONS */}
      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-semibold text-gray-600 mb-2">
          📊 Deep Dive Analysis (Optional)
        </div>

        <button
          onClick={runBacktest}
          disabled={loadingBacktest || backtest !== null}
          className={`w-full px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            backtest
              ? 'bg-green-100 text-green-800 cursor-default'
              : loadingBacktest
              ? 'bg-gray-100 text-gray-500 cursor-wait'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {loadingBacktest ? (
            <>⏳ Running 365-Day Backtest...</>
          ) : backtest ? (
            <>✅ Backtest Complete</>
          ) : (
            <>🔍 Backtest (365 Days)</>
          )}
        </button>

        <button
          onClick={runHistoricalAnalysis}
          disabled={loadingHistorical || historical !== null}
          className={`w-full px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            historical
              ? 'bg-green-100 text-green-800 cursor-default'
              : loadingHistorical
              ? 'bg-gray-100 text-gray-500 cursor-wait'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          }`}
        >
          {loadingHistorical ? (
            <>⏳ Analyzing Historical Patterns...</>
          ) : historical ? (
            <>✅ Historical Complete</>
          ) : (
            <>📊 Historical Patterns</>
          )}
        </button>
      </div>

      {/* BACKTEST RESULTS - Shown after clicking button */}
      {backtest && expandedSections.backtest && (
        <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-blue-900">📈 365-Day Backtest Results</h4>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              backtest.confidence === 'high' ? 'bg-green-100 text-green-800' :
              backtest.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {backtest.confidence.toUpperCase()} CONFIDENCE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-white p-3 rounded">
              <div className="text-xs text-gray-600">Win Rate</div>
              <div className={`text-2xl font-bold ${backtest.winRate >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                {backtest.winRate.toFixed(1)}%
              </div>
            </div>
            <div className="bg-white p-3 rounded">
              <div className="text-xs text-gray-600">Avg Return</div>
              <div className={`text-2xl font-bold ${backtest.avgReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {backtest.avgReturn.toFixed(1)}%
              </div>
            </div>
            <div className="bg-white p-3 rounded">
              <div className="text-xs text-gray-600">Sharpe Ratio</div>
              <div className="text-xl font-bold">{backtest.sharpeRatio.toFixed(2)}</div>
            </div>
            <div className="bg-white p-3 rounded">
              <div className="text-xs text-gray-600">Max Drawdown</div>
              <div className="text-xl font-bold text-red-600">{backtest.maxDrawdown.toFixed(1)}%</div>
            </div>
          </div>

          <div className="text-sm text-gray-700 bg-white p-3 rounded">
            {backtest.summary}
          </div>
          <div className="text-xs text-gray-600 mt-2">
            Based on {backtest.similarTradesFound} similar trades over the past year
          </div>
        </div>
      )}

      {/* HISTORICAL RESULTS - Shown after clicking button */}
      {historical && historical.available && expandedSections.historical && (
        <div className="mt-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-purple-900">📊 Historical Price Patterns</h4>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              historical.confidence === 'high' ? 'bg-green-100 text-green-800' :
              historical.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {historical.confidence.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-white p-3 rounded">
              <div className="text-xs text-gray-600">Required Move</div>
              <div className="text-xl font-bold">
                {historical.requiredMove.toFixed(1)}% {historical.direction}
              </div>
            </div>
            <div className="bg-white p-3 rounded">
              <div className="text-xs text-gray-600">Historical Frequency</div>
              <div className={`text-xl font-bold ${
                historical.historicalFrequency >= 30 ? 'text-green-600' : 'text-yellow-600'
              }`}>
                {historical.historicalFrequency.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="text-sm text-gray-700 bg-white p-3 rounded mb-3">
            {historical.summary}
          </div>

          {historical.recentExamples && historical.recentExamples.length > 0 && (
            <div className="bg-white p-3 rounded">
              <div className="text-xs font-semibold text-gray-700 mb-2">Recent Examples:</div>
              <div className="space-y-1">
                {historical.recentExamples.slice(0, 5).map((example, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-600">{example.date}</span>
                    <span className={example.achieved ? 'text-green-600' : 'text-gray-500'}>
                      {example.move.toFixed(1)}% {example.achieved ? '✓' : '✗'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
