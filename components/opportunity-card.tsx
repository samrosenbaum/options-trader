import React from 'react'

import { formatDistanceToNowStrict } from 'date-fns'

import { Opportunity, SwingSignalNewsHeadline } from '../lib/types/opportunity'
import { DataQualityBadge } from './data-quality-badge'

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

type InvestmentScenario = {
  contractCost: number
  contractsToBuy: number
  totalCost: number
  remainingCapital: number
  requiredCapital: number
  shortfall: number
  displayCost: number
  basis: 'position' | 'perContract'
  potentialReturnAmount: number
  potentialReturnAmountPerContract: number
  maxReturnAmount: number
  maxReturnAmountPerContract: number
  maxLossAmount: number
  maxLossAmountPerContract: number
  scenarios: Array<{
    move: string
    return: number
    profit: number
    totalValue: number
  }>
}

const formatCurrency = (amount: number | null | undefined) => {
  if (!isFiniteNumber(amount)) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const formatPercent = (value: number | null | undefined, digits = 0) => {
  if (!isFiniteNumber(value)) {
    return '—'
  }

  return `${value.toFixed(digits)}%`
}

const safeToFixed = (value: number | null | undefined, digits = 1) => {
  if (!isFiniteNumber(value)) {
    return null
  }

  return value.toFixed(digits)
}

const formatRelativeDate = (value?: string | null) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  try {
    return formatDistanceToNowStrict(date, { addSuffix: true })
  } catch {
    return null
  }
}

const formatTradingDays = (value: number | null | undefined) => {
  if (!isFiniteNumber(value)) {
    return null
  }

  const rounded = Math.round(value)
  return `${rounded} trading day${rounded === 1 ? '' : 's'}`
}

const formatSwingClassification = (classification?: string | null) => {
  if (!classification) {
    return null
  }

  const normalized = classification.toLowerCase()
  const mapping: Record<string, string> = {
    elevated_swing_risk: 'Elevated swing risk',
    watchlist: 'On watchlist',
    calm: 'Calm regime',
  }

  if (mapping[normalized]) {
    return mapping[normalized]
  }

  return classification
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

const getSwingBadgeClass = (classification?: string | null) => {
  switch (classification) {
    case 'elevated_swing_risk':
      return 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/40'
    case 'watchlist':
      return 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/40'
    case 'calm':
      return 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/40'
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/40 dark:text-slate-200 dark:border-slate-600/50'
  }
}

const formatFractionAsPercent = (value: number | null | undefined, digits = 1) => {
  if (!isFiniteNumber(value)) {
    return '—'
  }

  return `${(value * 100).toFixed(digits)}%`
}

const getRiskBudgetMeta = (tier?: string | null) => {
  switch (tier) {
    case 'aggressive':
      return {
        label: 'Aggressive Risk Budget',
        className:
          'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/40',
      }
    case 'balanced':
      return {
        label: 'Balanced Risk Budget',
        className:
          'bg-sky-100 text-sky-700 border border-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:border-sky-500/40',
      }
    case 'conservative':
      return {
        label: 'Conservative Risk Budget',
        className:
          'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/40',
      }
    case 'capital_preservation':
      return {
        label: 'Capital Preservation',
        className:
          'bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800/50 dark:text-slate-200 dark:border-slate-700/50',
      }
    default:
      return {
        label: 'Risk Budget',
        className:
          'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/40 dark:text-slate-200 dark:border-slate-600/50',
      }
  }
}

const formatDetailValue = (value: unknown): string => {
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return value.toLocaleString()
    }
    if (Math.abs(value) >= 100) {
      return value.toFixed(1)
    }
    if (Math.abs(value) >= 1) {
      return value.toFixed(2)
    }
    return value.toFixed(3)
  }

  if (typeof value === 'string') {
    return value.replace(/_/g, ' ')
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => formatDetailValue(item))
      .filter(Boolean)
      .join(', ')
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key}: ${formatDetailValue(val)}`)
      .join(', ')
  }

  return ''
}

const renderSwingInsights = (opp: Opportunity) => {
  const swingSignal = opp.swingSignal
  const swingSignalError = opp.swingSignalError

  if (!swingSignal && !swingSignalError) {
    return null
  }

  const classificationLabel = formatSwingClassification(swingSignal?.classification)
  const compositeScore = typeof swingSignal?.compositeScore === 'number' ? swingSignal.compositeScore : null

  const metadata = swingSignal?.metadata ?? {}
  const atrRatio = typeof metadata.atr_ratio === 'number' ? metadata.atr_ratio : null
  const momentumZ = typeof metadata.momentum_zscore === 'number' ? metadata.momentum_zscore : null
  const volumeZ = typeof metadata.volume_zscore === 'number' ? metadata.volume_zscore : null

  const metrics: Array<{ label: string; value: string } | null> = [
    {
      label: 'Composite Score',
      value: compositeScore !== null ? compositeScore.toFixed(1) : '—',
    },
    atrRatio !== null
      ? {
          label: 'ATR Expansion',
          value: `${atrRatio.toFixed(2)}x baseline`,
        }
      : { label: 'ATR Expansion', value: '—' },
    momentumZ !== null
      ? {
          label: 'Momentum Z-Score',
          value: `${momentumZ.toFixed(2)}σ`,
        }
      : { label: 'Momentum Z-Score', value: '—' },
    volumeZ !== null
      ? {
          label: 'Volume Z-Score',
          value: `${volumeZ.toFixed(2)}σ`,
        }
      : { label: 'Volume Z-Score', value: '—' },
  ]

  if (metadata.market_context && typeof metadata.market_context === 'object') {
    const context = metadata.market_context as Record<string, unknown>
    const vixRatio = typeof context.vix_ratio === 'number' ? context.vix_ratio : null
    const spyReturn = typeof context.spy_return_5d === 'number' ? context.spy_return_5d : null
    if (vixRatio !== null) {
      metrics.push({ label: 'VIX vs 20d', value: `${(vixRatio * 100).toFixed(0)}%` })
    }
    if (spyReturn !== null) {
      metrics.push({ label: 'SPY 5d', value: `${(spyReturn * 100).toFixed(1)}%` })
    }
  }

  const factors = swingSignal?.factors ?? []
  const sortedFactors = [...factors].sort((a, b) => {
    const scoreA = typeof a.score === 'number' ? a.score : -Infinity
    const scoreB = typeof b.score === 'number' ? b.score : -Infinity
    return scoreB - scoreA
  })

  const newsSample: SwingSignalNewsHeadline[] = []
  if (Array.isArray(metadata.news_sample)) {
    metadata.news_sample.forEach((headline) => {
      newsSample.push(headline)
    })
  }

  return (
    <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h5 className="font-medium text-indigo-900 dark:text-indigo-100">Multi-Factor Swing Signal</h5>
          <p className="text-xs text-indigo-700/80 dark:text-indigo-200/80">
            Blends volatility, momentum, volume, news sentiment, and market regime to gauge move potential.
          </p>
        </div>
        {classificationLabel && (
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getSwingBadgeClass(swingSignal?.classification)}`}>
            {classificationLabel}
          </span>
        )}
      </div>

      {swingSignalError && !swingSignal && (
        <div className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
          Unable to compute swing signal: {swingSignalError}
        </div>
      )}

      {swingSignal && (
        <>
          {/* Plain-English Summary */}
          {swingSignal.metadata?.summary && (
            <div className="mb-4 bg-white/70 dark:bg-slate-900/60 border border-indigo-100/60 dark:border-indigo-900/40 rounded-xl px-4 py-3">
              <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                {swingSignal.metadata.summary}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {metrics
              .filter(Boolean)
              .map((metric) => (
                <div key={metric!.label} className="bg-white/60 dark:bg-slate-900/60 rounded-xl px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-indigo-600 dark:text-indigo-300 font-semibold">
                    {metric!.label}
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{metric!.value}</div>
                </div>
              ))}
          </div>

          <div className="space-y-3">
            {sortedFactors.map((factor) => {
              const detailEntries = Object.entries(factor.details ?? {}).filter(([label, value]) =>
                label !== 'headlines' && value !== null && value !== undefined && formatDetailValue(value) !== ''
              )
              return (
                <div
                  key={factor.name}
                  className="bg-white/70 dark:bg-slate-900/60 border border-indigo-100/60 dark:border-indigo-900/40 rounded-xl px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{factor.name}</div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{factor.rationale}</p>
                    </div>
                    <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-200 bg-indigo-100/80 dark:bg-indigo-800/50 rounded-full px-2 py-1">
                      {safeToFixed(factor.score, 1) ?? '—'}
                    </span>
                  </div>
                  {detailEntries.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {detailEntries.map(([label, value]) => (
                        <span
                          key={label}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-100/70 dark:bg-indigo-800/40 text-[11px] text-indigo-700 dark:text-indigo-200 px-2 py-1"
                        >
                          <span className="font-medium">{label.replace(/_/g, ' ')}:</span>
                          <span>{formatDetailValue(value)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {newsSample.length > 0 && (
            <div className="bg-white/70 dark:bg-slate-900/60 border border-indigo-100/60 dark:border-indigo-900/40 rounded-xl px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-indigo-600 dark:text-indigo-300 font-semibold mb-2">
                Recent catalysts sampled
              </div>
              <div className="space-y-2">
                {newsSample.slice(0, 3).map((headline, index) => (
                  <div key={index} className="text-xs text-slate-700 dark:text-slate-200">
                    <div className="font-medium text-slate-900 dark:text-white">{headline?.title || 'Headline unavailable'}</div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {headline?.publisher && <span>{headline.publisher}</span>}
                      {typeof headline?.sentiment_label === 'string' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100/70 dark:bg-indigo-800/40 text-indigo-700 dark:text-indigo-200">
                          Sentiment: {headline.sentiment_label.replace(/_/g, ' ')}
                          {typeof headline?.sentiment_score === 'number' && (
                            <span>({headline.sentiment_score.toFixed(2)})</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const getRiskColor = (riskLevel: string) => {
  switch (riskLevel) {
    case 'low':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'medium':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'high':
      return 'bg-red-50 text-red-700 border-red-200'
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200'
  }
}

const getScoreColor = (score: number) => {
  if (score >= 90) return 'bg-red-500 text-white'
  if (score >= 80) return 'bg-orange-500 text-white'
  if (score >= 70) return 'bg-amber-500 text-white'
  return 'bg-slate-400 text-white'
}

const getTradeLogic = (opp: Opportunity) => {
  const isCall = opp.optionType === 'call'
  const daysToExp = opp.daysToExpiration
  const ivRank = opp.ivRank
  const eventIntel = opp.eventIntel || {}

  let logic = ''

  if (isCall) {
    logic += `This is a CALL option betting that ${opp.symbol} will go UP. `
  } else {
    logic += `This is a PUT option betting that ${opp.symbol} will go DOWN. `
  }

  const price = Math.max(opp.stockPrice, 0)
  const strike = opp.strike
  const relativeDiff = price > 0 ? Math.abs(price - strike) / price : 0

  if (relativeDiff < 0.01) {
    logic += 'The strike price is essentially at-the-money, so even small moves in the underlying can swing this trade. '
  } else if (isCall) {
    const diffPct = price > 0 ? ((price - strike) / price) * 100 : 0
    if (diffPct > 0) {
      logic += `The strike is ${Math.abs(diffPct).toFixed(1)}% below the stock price, giving this call intrinsic value from the start. `
    } else {
      const neededMove = Math.abs(diffPct)
      logic += `The strike is ${neededMove.toFixed(1)}% above the stock price, so the shares need roughly a ${neededMove.toFixed(1)}% rally to move in-the-money. `
    }
  } else {
    const diffPct = price > 0 ? ((strike - price) / price) * 100 : 0
    if (diffPct > 0) {
      logic += `The strike is ${Math.abs(diffPct).toFixed(1)}% above the stock price, meaning this put already carries intrinsic value from the recent downside move. `
    } else {
      const neededDrop = Math.abs(diffPct)
      logic += `The strike is ${neededDrop.toFixed(1)}% below the stock price, so the underlying would need to drop about ${neededDrop.toFixed(1)}% for the put to move in-the-money. `
    }
  }

  if (daysToExp <= 7) {
    logic += `With only ${daysToExp} days until expiration, this is a short-term trade that requires quick price movement. `
  } else if (daysToExp <= 30) {
    logic += `With ${daysToExp} days until expiration, this gives a reasonable timeframe for the expected move to play out. `
  } else {
    logic += `With ${daysToExp} days until expiration, this provides plenty of time for the trade thesis to develop. `
  }

  if (ivRank < 30) {
    logic += `The implied volatility is relatively low (${ivRank.toFixed(0)}% rank), meaning options are cheap and volatility could expand, boosting option prices. `
  } else if (ivRank > 70) {
    logic += `The implied volatility is high (${ivRank.toFixed(0)}% rank), meaning options are expensive but could benefit from volatility contraction. `
  } else {
    logic += `The implied volatility is moderate (${ivRank.toFixed(0)}% rank), providing a balanced environment for the trade. `
  }

  if (opp.gammaSqueezeScore && opp.gammaSqueezeScore > 0) {
    logic += `The high gamma squeeze score suggests potential for explosive upside if the stock breaks through key resistance levels. `
  }

  if (opp.unusualFlowScore && opp.unusualFlowScore > 0) {
    logic += `Unusual options activity indicates smart money positioning, potentially signaling an upcoming move. `
  }

  if (typeof eventIntel.earnings_in_days === 'number') {
    if (eventIntel.earnings_in_days >= 0) {
      logic += `Upcoming earnings in ${Math.round(eventIntel.earnings_in_days)} days could be a key catalyst for volatility. `
    } else if (eventIntel.earnings_in_days < 0 && eventIntel.earnings_in_days > -7) {
      logic += `The stock is still reacting to a fresh earnings release from ${Math.abs(Math.round(eventIntel.earnings_in_days))} days ago. `
    }
  }

  if (typeof eventIntel.news_sentiment_label === 'string') {
    const sentimentLabel = String(eventIntel.news_sentiment_label).replace('_', ' ')
    if (['bullish', 'very bullish', 'bearish', 'very bearish'].includes(sentimentLabel.toLowerCase())) {
      logic += `News flow is ${sentimentLabel.toLowerCase()}, reinforcing the directional bias behind this trade. `
    }
  }

  const drivers = opp.moveAnalysis?.drivers?.length
    ? opp.moveAnalysis.drivers
    : Array.isArray(eventIntel.unique_drivers)
      ? eventIntel.unique_drivers
      : []

  if (drivers.length > 0) {
    logic += `Primary drivers include ${drivers.join(', ')}. `
  }

  return logic
}

const getGreeksExplanation = (opp: Opportunity) => {
  const explanations: string[] = []
  const greeks = opp.greeks

  const deltaPercent = (greeks.delta * 100).toFixed(1)
  if (Math.abs(greeks.delta) > 0.5) {
    explanations.push(`Delta of ${deltaPercent}% means this option will move significantly with stock price changes - expect big swings in option value.`)
  } else if (Math.abs(greeks.delta) > 0.3) {
    explanations.push(`Delta of ${deltaPercent}% provides good sensitivity to stock moves while maintaining reasonable premium cost.`)
  } else {
    explanations.push(`Delta of ${deltaPercent}% means the option is less sensitive to small stock moves but cheaper to own.`)
  }

  if (greeks.gamma > 0.02) {
    explanations.push(`High gamma of ${greeks.gamma.toFixed(3)} means the option's sensitivity to stock price changes will increase dramatically as the stock moves in your favor.`)
  } else if (greeks.gamma > 0.01) {
    explanations.push(`Moderate gamma of ${greeks.gamma.toFixed(3)} provides good acceleration as the stock moves in your direction.`)
  } else {
    explanations.push(`Lower gamma of ${greeks.gamma.toFixed(3)} means more linear price movement relative to the stock.`)
  }

  const thetaDaily = greeks.theta
  if (Math.abs(thetaDaily) > 0.5) {
    explanations.push(`High theta decay of ${thetaDaily.toFixed(2)} per day means this option loses significant value each day - time is working against you.`)
  } else if (Math.abs(thetaDaily) > 0.2) {
    explanations.push(`Moderate theta decay of ${thetaDaily.toFixed(2)} per day means reasonable time decay that won't destroy the trade quickly.`)
  } else {
    explanations.push(`Low theta decay of ${thetaDaily.toFixed(2)} per day means time decay is minimal, giving you more time for the trade to work.`)
  }

  if (greeks.vega > 0.2) {
    explanations.push(`High vega of ${greeks.vega.toFixed(2)} means this option is very sensitive to volatility changes - a volatility spike could significantly boost option value.`)
  } else if (greeks.vega > 0.1) {
    explanations.push(`Moderate vega of ${greeks.vega.toFixed(2)} provides good exposure to volatility expansion while managing premium cost.`)
  } else {
    explanations.push(`Lower vega of ${greeks.vega.toFixed(2)} means the option is less affected by volatility changes, focusing more on directional moves.`)
  }

  return explanations
}

const formatBreakevenRequirement = (opp: Opportunity) => {
  const move = opp.breakevenMovePercent
  if (!isFiniteNumber(move)) {
    return null
  }

  if (move <= 0) {
    return 'Already beyond breakeven'
  }

  const direction = opp.optionType === 'put' ? 'drop' : 'gain'
  return `Needs ${Math.abs(move).toFixed(1)}% ${direction} to breakeven`
}

const renderMoveThesis = (opp: Opportunity) => {
  const thesisPoints = (opp.reasoning || []).filter(Boolean)
  const moveAnalysis = opp.moveAnalysis
  const tradeLogic = getTradeLogic(opp)

  const swingInsights = renderSwingInsights(opp)

  return (
    <div className="space-y-4">
      {swingInsights}

      {tradeLogic && (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <h5 className="font-medium text-slate-900 dark:text-white mb-2">Trade Logic</h5>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{tradeLogic}</p>
        </div>
      )}

      {thesisPoints.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <h5 className="font-medium text-slate-900 dark:text-white mb-2">Why This Setup Works</h5>
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 list-disc list-inside">
            {thesisPoints.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      {moveAnalysis && (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <h5 className="font-medium text-slate-900 dark:text-white mb-3">Expected Move Analysis</h5>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Expected Move</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {formatPercent(moveAnalysis.expectedMovePercent, 1)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Implied Volatility</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {formatPercent(moveAnalysis.impliedVol, 1)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Days to Expiration</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {moveAnalysis.daysToExpiration ?? opp.daysToExpiration}
              </div>
            </div>
          </div>

          {moveAnalysis.thresholds?.length ? (
            <div className="space-y-2">
              {moveAnalysis.thresholds.map((threshold, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl bg-white/60 dark:bg-slate-900/60 px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{threshold.threshold}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">{threshold.summary}</div>
                  </div>
                  <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                    {threshold.baseProbability !== null && (
                      <div>Base: {formatPercent(threshold.baseProbability, 1)}</div>
                    )}
                    {threshold.conviction !== null && (
                      <div>Conviction: {threshold.conviction.toFixed(1)} / 5</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

    </div>
  )
}

const getRiskRewardExplanation = (opp: Opportunity) => {
  const maxReturn = Number.isFinite(opp.maxReturn) ? opp.maxReturn : null
  const maxLossPercent = Number.isFinite(opp.maxLossPercent) ? opp.maxLossPercent : null
  const maxLossAmount = Number.isFinite(opp.maxLossAmount) ? opp.maxLossAmount : null
  const potentialReturn = Number.isFinite(opp.potentialReturn) ? opp.potentialReturn : null
  const daysToExp = Number.isFinite(opp.daysToExpiration) ? opp.daysToExpiration : null

  const explanationParts: string[] = []

  if (potentialReturn !== null && maxReturn !== null) {
    explanationParts.push(
      `This trade offers a potential return of ${potentialReturn.toFixed(1)}% on a 10% stock move, with a maximum possible return of ${maxReturn.toFixed(1)}%.`
    )
  } else {
    explanationParts.push('This trade highlights an asymmetric payoff profile, but some return metrics are unavailable.')
  }

  if (maxLossPercent !== null && maxLossAmount !== null) {
    if (maxLossPercent < 100) {
      explanationParts.push(
        `Your maximum loss is limited to ${maxLossPercent.toFixed(1)}% of your investment (${formatCurrency(maxLossAmount)} per contract).`
      )
    } else {
      explanationParts.push(
        `Your maximum loss is ${maxLossPercent.toFixed(1)}% of your investment (${formatCurrency(maxLossAmount)} per contract).`
      )
    }
  } else if (maxLossPercent !== null) {
    explanationParts.push(`Your maximum loss is approximately ${maxLossPercent.toFixed(1)}% of your investment.`)
  } else if (maxLossAmount !== null) {
    explanationParts.push(`Your maximum loss per contract is approximately ${formatCurrency(maxLossAmount)}.`)
  } else {
    explanationParts.push('Review the option chain to understand the maximum loss profile for this trade.')
  }

  const lossBasis = maxLossPercent !== null ? Math.max(Math.abs(maxLossPercent), 1) : null
  const shortTermRatio = (() => {
    if (Number.isFinite(opp.shortTermRiskRewardRatio)) {
      return opp.shortTermRiskRewardRatio as number
    }
    if (potentialReturn !== null && lossBasis !== null) {
      return potentialReturn / lossBasis
    }
    return null
  })()
  const asymmetryRatio = (() => {
    if (Number.isFinite(opp.riskRewardRatio)) {
      return opp.riskRewardRatio as number
    }
    if (maxReturn !== null && lossBasis !== null) {
      return maxReturn / lossBasis
    }
    return null
  })()

  if (shortTermRatio !== null) {
    if (shortTermRatio > 5) {
      explanationParts.push(
        `This creates an excellent near-term risk/reward ratio of ${shortTermRatio.toFixed(1)}:1 on a 10% move, meaning you could make ${shortTermRatio.toFixed(1)}x more than you could lose.`
      )
    } else if (shortTermRatio > 2) {
      explanationParts.push(
        `This creates a good risk/reward ratio of ${shortTermRatio.toFixed(1)}:1, providing favorable odds even on a modest move.`
      )
    } else {
      explanationParts.push(
        `This creates a risk/reward ratio of ${shortTermRatio.toFixed(1)}:1 on the first 10% move.`
      )
    }
  }

  if (asymmetryRatio !== null) {
    if (asymmetryRatio >= 3) {
      explanationParts.push(
        `The max payoff is ${asymmetryRatio.toFixed(1)}x larger than the capital at risk, giving this setup major asymmetric upside if the stock really runs.`
      )
    } else if (asymmetryRatio >= 1.5) {
      explanationParts.push(
        `There's still ${asymmetryRatio.toFixed(1)}x more upside than downside if the bigger move plays out.`
      )
    }
  }

  if (daysToExp !== null) {
    if (daysToExp <= 7) {
      explanationParts.push(
        `With only ${daysToExp} days left, this is a high-conviction trade that needs to work quickly. The short timeframe amplifies both profit potential and time decay risk.`
      )
    } else if (daysToExp <= 30) {
      explanationParts.push(
        `With ${daysToExp} days until expiration, you have a reasonable timeframe for the trade to develop while managing time decay.`
      )
    } else {
      explanationParts.push(
        `With ${daysToExp} days until expiration, you have plenty of time for the trade thesis to play out with lower time decay pressure.`
      )
    }
  }

  return explanationParts.join(' ')
}

const calculateInvestmentScenario = (opp: Opportunity, amount: number): InvestmentScenario => {
  const optionPrice = opp.premium || 0
  // premium is already per-contract (multiplied by 100 in Python scanner)
  const contractCost = Math.max(optionPrice, 0)
  const perContractPotentialReturn = opp.potentialReturnAmount || ((opp.potentialReturn / 100) * contractCost)
  const perContractMaxReturn = opp.maxReturnAmount || ((opp.maxReturn / 100) * contractCost)
  const perContractMaxLoss = opp.maxLossAmount || contractCost

  if (contractCost <= 0) {
    return {
      contractCost: 0,
      contractsToBuy: 0,
      totalCost: 0,
      remainingCapital: amount,
      requiredCapital: 0,
      shortfall: 0,
      displayCost: 0,
      basis: 'perContract',
      potentialReturnAmount: 0,
      potentialReturnAmountPerContract: 0,
      maxReturnAmount: 0,
      maxReturnAmountPerContract: 0,
      maxLossAmount: 0,
      maxLossAmountPerContract: 0,
      scenarios: [],
    }
  }

  const contractsToBuy = Math.max(Math.floor(amount / contractCost), 0)
  const totalCost = contractsToBuy * contractCost
  const remainingCapital = Math.max(amount - totalCost, 0)
  const basis: InvestmentScenario['basis'] = contractsToBuy > 0 ? 'position' : 'perContract'
  const displayCost = contractsToBuy > 0 ? totalCost : contractCost
  const requiredCapital = contractCost
  const shortfall = contractsToBuy > 0 ? 0 : Math.max(requiredCapital - amount, 0)

  const potentialReturnAmount = basis === 'position'
    ? perContractPotentialReturn * contractsToBuy
    : perContractPotentialReturn

  const maxReturnAmount = basis === 'position'
    ? perContractMaxReturn * contractsToBuy
    : perContractMaxReturn

  const maxLossAmount = basis === 'position'
    ? perContractMaxLoss * contractsToBuy
    : perContractMaxLoss

  const scenarioBase = basis === 'position' ? totalCost : contractCost

  const scenarios = (opp.returnsAnalysis || []).map((scenario) => {
    const percentReturn = scenario?.return || 0
    const profit = scenarioBase * (percentReturn / 100)
    return {
      move: scenario?.move || '',
      return: percentReturn,
      profit,
      totalValue: scenarioBase + profit,
    }
  })

  return {
    contractCost,
    contractsToBuy,
    totalCost,
    remainingCapital,
    requiredCapital,
    shortfall,
    displayCost,
    basis,
    potentialReturnAmount,
    potentialReturnAmountPerContract: perContractPotentialReturn,
    maxReturnAmount,
    maxReturnAmountPerContract: perContractMaxReturn,
    maxLossAmount,
    maxLossAmountPerContract: perContractMaxLoss,
    scenarios,
  }
}

interface OpportunityCardProps {
  opportunity: Opportunity
  investmentAmount: number
}

const OpportunityCard = ({ opportunity, investmentAmount }: OpportunityCardProps) => {
  const [isExpanded, setIsExpanded] = React.useState(false)
  const scenario = calculateInvestmentScenario(opportunity, investmentAmount)
  const isPerContractView = scenario.basis === 'perContract'

  const potentialReturnDisplay = isPerContractView
    ? scenario.potentialReturnAmountPerContract
    : scenario.potentialReturnAmount
  const maxReturnDisplay = isPerContractView
    ? scenario.maxReturnAmountPerContract
    : scenario.maxReturnAmount
  const maxLossDisplay = isPerContractView
    ? scenario.maxLossAmountPerContract
    : scenario.maxLossAmount
  const riskRewardRatioRaw = isFiniteNumber(opportunity.riskRewardRatio)
    ? (opportunity.riskRewardRatio as number)
    : null
  const riskRewardRatioLabel = riskRewardRatioRaw !== null ? riskRewardRatioRaw.toFixed(1) : null
  const showAsymmetricEdge = riskRewardRatioRaw !== null && riskRewardRatioRaw >= 3
  const maxLossPercentLabel = safeToFixed(opportunity.maxLossPercent, 1)
  const maxLossWarning = `Maximum loss: ${formatCurrency(opportunity.maxLossAmount)}${maxLossPercentLabel ? ` (${maxLossPercentLabel}% of investment)` : ''}. Options can expire worthless, and you could lose your entire investment.`

  const positionSizing = opportunity.positionSizing ?? null
  const riskBudgetMeta = getRiskBudgetMeta(positionSizing?.riskBudgetTier)
  const sizingRationales = positionSizing?.rationale ?? []
  const capitalExamples = positionSizing?.capitalAllocationExamples ?? []
  const hasPositionSizing = Boolean(positionSizing)
  const recommendedFractionDisplay = formatFractionAsPercent(positionSizing?.recommendedFraction ?? null)
  const conservativeFractionDisplay = formatFractionAsPercent(positionSizing?.conservativeFraction ?? null)
  const aggressiveFractionDisplay = formatFractionAsPercent(positionSizing?.aggressiveFraction ?? null)
  const kellyFractionDisplay = formatFractionAsPercent(positionSizing?.kellyFraction ?? null)
  const expectedLogGrowthDisplay = formatFractionAsPercent(positionSizing?.expectedLogGrowth ?? null, 2)
  const expectedEdgeDisplay = formatFractionAsPercent(positionSizing?.expectedEdge ?? null, 1)
  const maxPerTradeDisplay = formatFractionAsPercent(positionSizing?.limits?.maxPerTrade ?? null)
  const maxDrawdownDisplay = formatFractionAsPercent(positionSizing?.limits?.maxDrawdown95 ?? null, 1)
  const losingStreak95 = positionSizing?.limits?.losingStreak95 ?? null

  const historical = opportunity.historicalContext
  const touchProbabilitySource = historical?.touchProbability
  const fallbackTouchProbability = historical?.empiricalProbability
  const touchProbability = isFiniteNumber(touchProbabilitySource)
    ? touchProbabilitySource
    : isFiniteNumber(fallbackTouchProbability)
      ? fallbackTouchProbability
      : null
  const finishProbabilitySource = historical?.finishProbability
  const finishProbability = isFiniteNumber(finishProbabilitySource) ? finishProbabilitySource : null
  const comparisonProbability = isFiniteNumber(finishProbability)
    ? finishProbability
    : touchProbability
  const formatConfidenceRange = (range?: { lower: number; upper: number } | null) => {
    if (!range || !isFiniteNumber(range.lower) || !isFiniteNumber(range.upper)) {
      return null
    }

    return `${range.lower.toFixed(0)}-${range.upper.toFixed(0)}%`
  }

  const touchConfidenceText = formatConfidenceRange(historical?.touchConfidence ?? historical?.raw?.touchConfidenceInterval)
  const finishConfidenceText = formatConfidenceRange(
    historical?.finishConfidence ?? historical?.raw?.closeConfidenceInterval,
  )
  const sampleSize =
    typeof historical?.totalPeriods === 'number'
      ? historical.totalPeriods
      : typeof historical?.raw?.totalPeriods === 'number'
        ? historical.raw.totalPeriods
        : null
  const qualityScore =
    typeof historical?.qualityScore === 'number'
      ? historical.qualityScore
      : typeof historical?.raw?.qualityScore === 'number'
        ? historical.raw.qualityScore
        : null
  const qualityLabel = historical?.qualityLabel ?? historical?.raw?.qualityLabel ?? null
  const moveRequirement = historical?.moveRequirement
  const movePercentRaw = isFiniteNumber(moveRequirement?.percent)
    ? Math.abs(moveRequirement.percent as number)
    : isFiniteNumber(historical?.raw?.targetMovePct)
      ? Math.abs(historical.raw.targetMovePct)
      : null
  const movePercentText = movePercentRaw !== null ? `${movePercentRaw.toFixed(1)}%` : null
  const moveAmountRaw = isFiniteNumber(moveRequirement?.amount)
    ? Math.abs(moveRequirement.amount as number)
    : isFiniteNumber(historical?.raw?.targetMoveAmount)
      ? Math.abs(historical.raw.targetMoveAmount as number)
      : null
  const moveAmountTextRaw = moveAmountRaw !== null ? formatCurrency(moveAmountRaw) : null
  const moveAmountText = moveAmountTextRaw && moveAmountTextRaw !== '—' ? moveAmountTextRaw : null
  const moveRequirementHeadline =
    moveAmountText && movePercentText
      ? `${moveAmountText} (${movePercentText})`
      : moveAmountText ?? movePercentText ?? '—'
  const moveTimeframe =
    typeof moveRequirement?.timeframeDays === 'number'
      ? moveRequirement.timeframeDays
      : typeof historical?.raw?.timeframeDays === 'number'
        ? historical.raw.timeframeDays
        : null
  const moveDirectionWord = moveRequirement?.direction === 'down' ? 'drop' : 'gain'
  const moveRequirementSubtextParts: string[] = []
  if (moveDirectionWord) {
    moveRequirementSubtextParts.push(`Needs a ${moveDirectionWord}`)
  }
  if (moveTimeframe !== null) {
    moveRequirementSubtextParts.push(`within ${moveTimeframe} trading days`)
  }
  const moveRequirementSubtext =
    moveRequirementSubtextParts.length > 0
      ? `${moveRequirementSubtextParts.join(' ')} to breakeven`
      : 'Breakeven move requirement'
  const frequency = historical?.historicalFrequency
  const touchesCount =
    typeof frequency?.occurrences === 'number'
      ? frequency.occurrences
      : typeof historical?.occurrences === 'number'
        ? historical.occurrences
        : typeof historical?.raw?.occurrences === 'number'
          ? historical.raw.occurrences
          : null
  const totalPeriodsCount =
    typeof frequency?.totalPeriods === 'number'
      ? frequency.totalPeriods
      : sampleSize
  const touchProbabilityPct = isFiniteNumber(frequency?.touchProbability)
    ? (frequency?.touchProbability as number)
    : touchProbability
  const touchProbabilityLabel =
    isFiniteNumber(touchProbabilityPct) ? `${Math.round(touchProbabilityPct as number)}% touch odds` : null
  const avgDaysToTouch = isFiniteNumber(historical?.avgDaysToTarget)
    ? (historical?.avgDaysToTarget as number)
    : isFiniteNumber(historical?.raw?.avgDaysToTarget)
      ? (historical?.raw?.avgDaysToTarget as number)
      : null
  const avgDaysLabel =
    isFiniteNumber(avgDaysToTouch)
      ? `${avgDaysToTouch.toFixed(1)} trading day${avgDaysToTouch === 1 ? '' : 's'} avg`
      : null
  const historicalHitHeadline =
    typeof touchesCount === 'number' && typeof totalPeriodsCount === 'number'
      ? `${touchesCount.toLocaleString()}/${totalPeriodsCount.toLocaleString()}`
      : typeof touchesCount === 'number'
        ? touchesCount.toLocaleString()
        : '—'
  const historicalHitSubtextParts = [touchProbabilityLabel, avgDaysLabel].filter(Boolean) as string[]
  const historicalHitSubtext = historicalHitSubtextParts.length > 0 ? historicalHitSubtextParts.join(' • ') : null
  const historicalHitContext =
    typeof totalPeriodsCount === 'number'
      ? moveTimeframe !== null
        ? `Across ${totalPeriodsCount.toLocaleString()} rolling ${moveTimeframe}d windows`
        : `Across ${totalPeriodsCount.toLocaleString()} rolling windows`
      : null
  const touchesObserved = typeof touchesCount === 'number' && touchesCount > 0
  const lastTouchData = historical?.lastTouch
  const rawLastOccurrence = historical?.lastOccurrence ?? historical?.raw?.lastOccurrence ?? null
  const lastTouchDate = lastTouchData?.date ?? rawLastOccurrence
  const lastTouchRelative = formatRelativeDate(lastTouchDate)
  const lastTouchDaysRaw = isFiniteNumber(lastTouchData?.daysToTarget)
    ? (lastTouchData?.daysToTarget as number)
    : isFiniteNumber(historical?.raw?.lastOccurrenceDaysToTarget)
      ? (historical?.raw?.lastOccurrenceDaysToTarget as number)
      : null
  const lastTouchDurationLabel = formatTradingDays(lastTouchDaysRaw)
  const recentTouchesSource =
    Array.isArray(historical?.recentTouches) && historical.recentTouches.length > 0
      ? historical.recentTouches
      : Array.isArray(historical?.raw?.recentOccurrences)
        ? historical.raw.recentOccurrences
        : []
  const recentTouchSummaries = recentTouchesSource
    .slice(0, 3)
    .map((touch) => {
      const relative = formatRelativeDate(touch?.date ?? null)
      const duration = formatTradingDays(touch?.daysToTarget)
      if (!relative && !duration) {
        return null
      }
      if (relative && duration) {
        return `${relative} (${duration})`
      }
      return relative ?? duration
    })
    .filter(Boolean) as string[]
  const recentTouchesText = recentTouchSummaries.length > 0 ? recentTouchSummaries.join(' • ') : null
  const lastTouchHeadline = touchesObserved
    ? lastTouchRelative ?? 'Date unavailable'
    : 'No touches in sample'
  const lastTouchSubtext = touchesObserved
    ? lastTouchDurationLabel ?? 'Time-to-target unavailable'
    : 'Never reached breakeven in lookback window'
  const lastTouchAdditional = touchesObserved && recentTouchesText ? `Recent touches: ${recentTouchesText}` : null
  const comparisonSourceLabel = finishProbability !== null ? 'finish odds' : 'touch odds'

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 hover:shadow-lg transition-all">
      {/* Header - Always Visible */}
      <div className="flex items-start justify-between mb-5">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{opportunity.symbol}</div>
            <div className={`px-4 py-1.5 rounded-lg text-base font-bold ${getScoreColor(opportunity.score)}`}>
              {opportunity.score}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {opportunity.gammaSqueezeScore && opportunity.gammaSqueezeScore > 0 && (
                <span className="px-3 py-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg text-sm font-semibold">
                  GAMMA {opportunity.gammaSqueezeScore}
                </span>
              )}
              {opportunity.unusualFlowScore && opportunity.unusualFlowScore > 0 && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-sm font-semibold">
                  FLOW {opportunity.unusualFlowScore}
                </span>
              )}
              {opportunity.newsImpactScore && opportunity.newsImpactScore > 0 && (
                <span className="px-3 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-lg text-sm font-semibold">
                  NEWS {opportunity.newsImpactScore}
                </span>
              )}
              {showAsymmetricEdge && (
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg text-sm font-bold">
                  {riskRewardRatioLabel}x EDGE
                </span>
              )}
              {opportunity.probabilityOfProfit !== null && opportunity.probabilityOfProfit >= 55 && (
                <span className="px-3 py-1 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 rounded-lg text-sm font-bold">
                  {opportunity.probabilityOfProfit.toFixed(0)}% WIN
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-5 text-base text-slate-600 dark:text-slate-400 flex-wrap">
            <span className="font-semibold">
              {opportunity.optionType.toUpperCase()} ${opportunity.strike}
            </span>
            <span>Exp: {opportunity.expiration}</span>
            <span className="font-medium">{opportunity.daysToExpiration}d</span>
            <span className={`px-3 py-1 rounded-lg text-sm font-bold border ${getRiskColor(opportunity.riskLevel)}`}>
              {opportunity.riskLevel.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="text-right space-y-1 ml-4">
          <div className="text-3xl font-bold text-slate-900 dark:text-white">
            {formatCurrency(opportunity.premium)}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">Contract Price</div>
        </div>
      </div>

      {/* Trade Summary - Always Visible */}
      {opportunity.tradeSummary ? (
        <div className="mb-5 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-5">
          <div className="text-base font-medium text-slate-900 dark:text-white leading-relaxed">
            {opportunity.tradeSummary}
          </div>
        </div>
      ) : null}

      {hasPositionSizing && (
        <div className="mb-6 bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950/30 dark:to-blue-950/30 border border-emerald-200/60 dark:border-emerald-800/60 rounded-xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <h4 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
                Institutional Position Sizing
              </h4>
              <p className="text-sm text-emerald-800/80 dark:text-emerald-200/80">
                Kelly sizing blended with volatility and drawdown controls to protect the fund while maximizing edge.
              </p>
            </div>
            <div className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wide ${riskBudgetMeta.className}`}>
              {riskBudgetMeta.label}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="bg-white/70 dark:bg-slate-900/60 rounded-lg p-4 border border-emerald-200/60 dark:border-emerald-800/50">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-300 uppercase tracking-wide mb-1">
                Recommended Allocation
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{recommendedFractionDisplay}</div>
              {expectedLogGrowthDisplay !== '—' && (
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Expected log growth {expectedLogGrowthDisplay}
                </div>
              )}
            </div>

            <div className="bg-white/70 dark:bg-slate-900/60 rounded-lg p-4 border border-emerald-200/60 dark:border-emerald-800/50">
              <div className="text-xs font-semibold text-sky-600 dark:text-sky-300 uppercase tracking-wide mb-1">
                Conservative Risk-Off
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{conservativeFractionDisplay}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Use during elevated volatility or headline risk
              </div>
            </div>

            <div className="bg-white/70 dark:bg-slate-900/60 rounded-lg p-4 border border-emerald-200/60 dark:border-emerald-800/50">
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-300 uppercase tracking-wide mb-1">
                Aggressive Upside
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{aggressiveFractionDisplay}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Hard cap {maxPerTradeDisplay}
              </div>
            </div>

            <div className="bg-white/70 dark:bg-slate-900/60 rounded-lg p-4 border border-emerald-200/60 dark:border-emerald-800/50">
              <div className="text-xs font-semibold text-purple-600 dark:text-purple-300 uppercase tracking-wide mb-1">
                Raw Kelly Fraction
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{kellyFractionDisplay}</div>
              {expectedEdgeDisplay !== '—' && (
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Net edge {expectedEdgeDisplay}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-xs font-medium text-slate-600 dark:text-slate-400 mb-4">
            <span>Per-trade cap {maxPerTradeDisplay}</span>
            {maxDrawdownDisplay !== '—' && <span>95% drawdown limit {maxDrawdownDisplay}</span>}
            {typeof losingStreak95 === 'number' && Number.isFinite(losingStreak95) && (
              <span>Designed to survive {losingStreak95}-trade losing streak</span>
            )}
          </div>

          {capitalExamples.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                Portfolio Impact Examples
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                {capitalExamples.map((example) => (
                  <div
                    key={example.portfolio}
                    className="bg-white/60 dark:bg-slate-900/40 border border-emerald-200/40 dark:border-emerald-800/40 rounded-lg p-3"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      ${example.portfolio.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">Portfolio size</div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-300 mt-1">
                      {formatFractionAsPercent(example.allocationPercent)}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      ≈ {example.contracts} contract{example.contracts === 1 ? '' : 's'} at
                      {' '}
                      {formatCurrency(example.capitalAtRisk)} risk
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sizingRationales.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
              {sizingRationales.map((reason, index) => (
                <li key={`${reason}-${index}`} className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-300 flex-shrink-0" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Historical Move Analysis - Always Visible (MOST VALUABLE!) */}
      {historical?.available && (
        <div className="mb-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-2 border-blue-300 dark:border-blue-700 rounded-2xl p-5 shadow-lg">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h5 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-2">📊 Historical Probability Check</h5>
              {historical.analysis ? (
                <p className="text-base text-blue-800 dark:text-blue-200 leading-relaxed font-medium">
                  {historical.analysis}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wide">
                Required Move
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{moveRequirementHeadline}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{moveRequirementSubtext}</div>
            </div>

            <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wide">
                Historical Hits
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{historicalHitHeadline}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {historicalHitSubtext ?? (touchesObserved ? 'Historical hit data available' : 'No touches recorded in sample')}
              </div>
              {historicalHitContext && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">{historicalHitContext}</div>
              )}
            </div>

            <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wide">
                Last Time It Moved
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{lastTouchHeadline}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{lastTouchSubtext}</div>
              {lastTouchAdditional && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">{lastTouchAdditional}</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wide">Market Expects</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {opportunity.probabilityOfProfit?.toFixed(0) || '—'}%
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Based on IV pricing</div>
            </div>

            <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wide">History Touches</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {touchProbability !== null ? touchProbability.toFixed(0) : '—'}%
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Breakeven tagged before expiry
              </div>
              {touchConfidenceText && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">95% CI {touchConfidenceText}</div>
              )}
            </div>

            <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wide">History Finishes</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {finishProbability !== null ? finishProbability.toFixed(0) : '—'}%
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Closed beyond breakeven by expiry
              </div>
              {finishConfidenceText && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">95% CI {finishConfidenceText}</div>
              )}
            </div>
          </div>

          {(sampleSize !== null || qualityLabel || qualityScore !== null) && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              {sampleSize !== null && (
                <span className="px-3 py-1 bg-white/60 dark:bg-slate-900/40 border border-blue-200 dark:border-blue-800 rounded-lg">
                  Sample Size: {sampleSize.toLocaleString()} periods
                </span>
              )}
              {qualityLabel && (
                <span className="px-3 py-1 bg-white/60 dark:bg-slate-900/40 border border-blue-200 dark:border-blue-800 rounded-lg">
                  Data Quality: {qualityLabel.toUpperCase()}
                  {qualityScore !== null ? ` (${qualityScore.toFixed(0)})` : ''}
                </span>
              )}
            </div>
          )}

          {comparisonProbability !== null && opportunity.probabilityOfProfit !== null && (
            <div className="mt-4 p-3 bg-white/70 dark:bg-slate-900/50 rounded-xl border border-blue-200 dark:border-blue-800">
              {comparisonProbability > opportunity.probabilityOfProfit + 10 ? (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">✓ Potentially Underpriced</span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    — Historical {comparisonSourceLabel} {(comparisonProbability - opportunity.probabilityOfProfit).toFixed(0)}% better than market pricing!
                  </span>
                </div>
              ) : comparisonProbability < opportunity.probabilityOfProfit - 10 ? (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-amber-600 dark:text-amber-400">⚠ Potentially Overpriced</span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    — Market pricing {(opportunity.probabilityOfProfit - comparisonProbability).toFixed(0)}% higher than historical {comparisonSourceLabel}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">↔️ Well Calibrated</span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">— Market pricing aligns with historical {comparisonSourceLabel}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expand/Collapse Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full mb-5 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all duration-200 flex items-center justify-center gap-2"
      >
        <span>{isExpanded ? 'Hide Details' : 'Show Full Analysis'}</span>
        <svg
          className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="space-y-6">
          {/* Data Quality Badge */}
          {opportunity._dataQuality && (
            <div>
              <DataQualityBadge quality={opportunity._dataQuality} />
            </div>
          )}

          {opportunity.recentNews && opportunity.recentNews.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Recent News</h4>
              <div className="space-y-3">
                {opportunity.recentNews.map((news, i) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h5 className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2">
                        {news.headline}
                      </h5>
                      <span
                        className={`px-2 py-1 rounded-lg text-xs font-medium ml-3 ${
                          news.category === 'political'
                            ? 'bg-red-100 text-red-700'
                            : news.category === 'regulatory'
                              ? 'bg-orange-100 text-orange-700'
                              : news.category === 'earnings'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {news.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">{news.summary}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-slate-500">{news.source}</span>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs font-medium ${
                            news.sentiment.score > 0
                              ? 'text-emerald-600'
                              : news.sentiment.score < 0
                                ? 'text-red-600'
                                : 'text-slate-600'
                          }`}
                        >
                          {news.sentiment.label}
                        </span>
                        <span className="text-xs text-slate-500">Impact: {news.impact_score}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-6">
        {renderMoveThesis(opportunity)}

        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <h5 className="font-medium text-slate-900 dark:text-white mb-2">Risk &amp; Reward Profile</h5>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {getRiskRewardExplanation(opportunity)}
          </p>
        </div>

        {opportunity.probabilityOfProfit !== null && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center justify-between mb-3">
              <h5 className="font-medium text-emerald-900 dark:text-emerald-100">Likelihood of Profit</h5>
              <span className="text-lg font-semibold text-emerald-700 dark:text-emerald-200">
                {opportunity.probabilityOfProfit.toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${Math.max(0, Math.min(opportunity.probabilityOfProfit, 100)).toFixed(1)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-200 mb-3">
              {(() => {
                const breakevenText = formatBreakevenRequirement(opportunity)
                return breakevenText ? <span>{breakevenText}</span> : <span>Breakeven move unavailable</span>
              })()}
              {opportunity.breakevenPrice !== null && <span>Breakeven ${opportunity.breakevenPrice.toFixed(2)}</span>}
            </div>
            <p className="text-sm text-emerald-900 dark:text-emerald-100 leading-relaxed">
              {opportunity.profitProbabilityExplanation || 'Probability estimate unavailable for this contract.'}
            </p>
          </div>
        )}
      </div>

      <div className="mb-6">
        <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Investment Calculator</h4>
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6">
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 bg-white dark:bg-slate-700 rounded-xl">
              <div>
                <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  {scenario.basis === 'position' ? 'Your Position' : 'Per-Contract Preview'}
                </div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">
                  {scenario.basis === 'position'
                    ? `${formatCurrency(scenario.totalCost)} for ${scenario.contractsToBuy} contract${scenario.contractsToBuy !== 1 ? 's' : ''}`
                    : `${formatCurrency(scenario.displayCost)} per contract`}
                </div>
                {scenario.basis === 'position' ? (
                  <div className="text-xs text-slate-500 dark:text-slate-300 mt-1">
                    Remaining capital: {formatCurrency(scenario.remainingCapital)}
                  </div>
                ) : scenario.requiredCapital > 0 ? (
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Add {formatCurrency(scenario.shortfall)} more to control one contract (requires {formatCurrency(scenario.requiredCapital)}).
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 dark:text-slate-300 mt-1">
                    Waiting for pricing data to size this trade.
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-slate-600 dark:text-slate-400">Option Price</div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(opportunity.premium / 100)} per share
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {formatCurrency(opportunity.premium)} per contract
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h5 className="font-medium text-slate-900 dark:text-white">Potential Profits</h5>
                {isPerContractView && (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-300">
                    Showing per-contract economics
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {scenario.scenarios.map((scenarioItem, i) => (
                  <div key={i} className="bg-white dark:bg-slate-700 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        {scenarioItem.move || `${scenarioItem.return.toFixed(0)}%`} Stock Move
                      </span>
                      <span
                        className={`text-xs font-semibold ${scenarioItem.return >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                      >
                        {scenarioItem.return >= 0
                          ? `+${scenarioItem.return.toFixed(1)}%`
                          : `${scenarioItem.return.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Profit:</span>
                        <span
                          className={`font-semibold ${scenarioItem.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                        >
                          {formatCurrency(scenarioItem.profit)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Total Value:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {formatCurrency(scenarioItem.totalValue)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center mt-0.5">
                  <span className="text-xs text-white font-bold">!</span>
                </div>
                <div>
                  <div className="font-medium text-amber-800 dark:text-amber-200 mb-1">Risk Warning</div>
                  <div className="text-sm text-amber-700 dark:text-amber-300">{maxLossWarning}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Potential Return</div>
          <div className="text-lg font-semibold text-emerald-600">{formatPercent(opportunity.potentialReturn, 1)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">≈ {formatCurrency(potentialReturnDisplay)}</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Max Return</div>
          <div className="text-lg font-semibold text-emerald-600">{formatPercent(opportunity.maxReturn, 1)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">≈ {formatCurrency(maxReturnDisplay)}</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Max Loss</div>
          <div className="text-lg font-semibold text-red-600">{formatPercent(opportunity.maxLossPercent, 1)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">≈ {formatCurrency(maxLossDisplay)}</div>
          {showAsymmetricEdge && (
            <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {riskRewardRatioLabel}x upside vs risk
            </div>
          )}
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Profit Probability</div>
          <div className="text-lg font-semibold text-slate-900 dark:text-white">
            {opportunity.probabilityOfProfit !== null ? `${opportunity.probabilityOfProfit.toFixed(1)}%` : '—'}
          </div>
          {(() => {
            const breakevenText = formatBreakevenRequirement(opportunity)
            return breakevenText ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">{breakevenText}</div>
            ) : null
          })()}
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Reward-to-Risk</div>
          <div className={`text-lg font-semibold ${showAsymmetricEdge ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>
            {riskRewardRatioLabel ? `${riskRewardRatioLabel}x` : '—'}
          </div>
          {showAsymmetricEdge && (
            <div className="text-xs text-emerald-600">Asymmetric payoff</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Delta</div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">{opportunity.greeks.delta.toFixed(3)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Gamma</div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">{opportunity.greeks.gamma.toFixed(3)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Theta</div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">{opportunity.greeks.theta.toFixed(3)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Vega</div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">{opportunity.greeks.vega.toFixed(3)}</div>
        </div>
      </div>
          <div className="mt-4 space-y-2">
            {getGreeksExplanation(opportunity).map((explanation, index) => (
              <p key={index} className="text-xs text-slate-600 dark:text-slate-400">
                {explanation}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default OpportunityCard
