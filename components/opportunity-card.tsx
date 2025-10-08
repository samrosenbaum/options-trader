import { Opportunity } from '../lib/types/opportunity'
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
  const catalysts = (opp.catalysts || []).filter(Boolean)
  const patterns = (opp.patterns || []).filter(Boolean)
  const moveAnalysis = opp.moveAnalysis
  const tradeLogic = getTradeLogic(opp)

  return (
    <div className="space-y-4">
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

      {(catalysts.length > 0 || patterns.length > 0) && (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
          <h5 className="font-medium text-slate-900 dark:text-white mb-2">Supporting Signals</h5>
          <div className="flex flex-wrap gap-2">
            {patterns.map((pattern, index) => (
              <span key={`pattern-${index}`} className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-xs font-medium rounded-xl">
                {pattern}
              </span>
            ))}
            {catalysts.map((catalyst, index) => (
              <span key={`catalyst-${index}`} className="px-3 py-1 bg-emerald-200/80 dark:bg-emerald-900/40 text-xs font-medium text-emerald-900 dark:text-emerald-100 rounded-xl">
                {catalyst}
              </span>
            ))}
          </div>
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
  const contractCost = Math.max(optionPrice * 100, 0)
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

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{opportunity.symbol}</div>
            <div className={`px-3 py-1 rounded-xl text-sm font-medium ${getScoreColor(opportunity.score)}`}>
              {opportunity.score}/100
            </div>
            <div className="flex items-center gap-2">
              {opportunity.gammaSqueezeScore && opportunity.gammaSqueezeScore > 0 && (
                <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-xl text-xs font-medium">
                  GAMMA: {opportunity.gammaSqueezeScore}
                </span>
              )}
              {opportunity.unusualFlowScore && opportunity.unusualFlowScore > 0 && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-xl text-xs font-medium">
                  FLOW: {opportunity.unusualFlowScore}
                </span>
              )}
              {opportunity.newsImpactScore && opportunity.newsImpactScore > 0 && (
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-xl text-xs font-medium">
                  NEWS: {opportunity.newsImpactScore}
                </span>
              )}
              {showAsymmetricEdge && (
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-semibold">
                  ASYM EDGE {riskRewardRatioLabel}x
                </span>
              )}
              {opportunity.probabilityOfProfit !== null && opportunity.probabilityOfProfit >= 55 && (
                <span className="px-3 py-1 bg-sky-100 text-sky-700 rounded-xl text-xs font-semibold">
                  WIN RATE {opportunity.probabilityOfProfit.toFixed(0)}%
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
            <span>
              {opportunity.optionType.toUpperCase()} ${opportunity.strike}
            </span>
            <span>Expires {opportunity.expiration}</span>
            <span>{opportunity.daysToExpiration} days</span>
            <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${getRiskColor(opportunity.riskLevel)}`}>
              {opportunity.riskLevel.toUpperCase()} RISK
            </span>
          </div>
        </div>

        <div className="text-right space-y-1">
          <div className="text-2xl font-semibold text-slate-900 dark:text-white">
            {formatCurrency(opportunity.premium)}
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Premium</div>
        </div>
      </div>

      {/* Data Quality Badge */}
      {opportunity._dataQuality && (
        <div className="mb-6">
          <DataQualityBadge quality={opportunity._dataQuality} />
        </div>
      )}

      {opportunity.recentNews && opportunity.recentNews.length > 0 && (
        <div className="mb-6">
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

      <div className="space-y-6 mb-6">
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
                  {formatCurrency(opportunity.premium)} per share
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {formatCurrency(scenario.contractCost)} per contract
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
  )
}

export default OpportunityCard
