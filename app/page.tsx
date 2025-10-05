'use client'

import { useState, useEffect } from 'react'

interface Opportunity {
  symbol: string
  optionType: string
  strike: number
  expiration: string
  premium: number
  score: number
  confidence: number
  reasoning: string[]
  patterns: string[]
  catalysts: string[]
  riskLevel: string
  potentialReturn: number
  maxReturn: number
  maxLoss: number
  breakeven: number
  ivRank: number
  volumeRatio: number
  greeks: {
    delta: number
    gamma: number
    theta: number
    vega: number
  }
  daysToExpiration: number
  returnsAnalysis: Array<{
    move: string
    return: number
  }>
  gammaSqueezeScore?: number
  unusualFlowScore?: number
  maxPainStrike?: number
  newsImpactScore?: number
  recentNews?: Array<{
    headline: string
    summary: string
    source: string
    category: string
    sentiment: {
      score: number
      label: string
    }
    impact_score: number
  }>
}

export default function HomePage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [investmentAmount, setInvestmentAmount] = useState(1000)

  const fetchOpportunities = async () => {
    try {
      const response = await fetch('/api/scan-python')
      const data = await response.json()
      if (data.success) {
        setOpportunities(data.opportunities || [])
        setLastUpdate(new Date())
      }
    } catch (error) {
      console.error('Error fetching opportunities:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const isMarketOpen = () => {
    const now = new Date()
    const day = now.getDay() // 0 = Sunday, 6 = Saturday
    const hour = now.getHours()
    const minute = now.getMinutes()
    
    // Market is closed on weekends
    if (day === 0 || day === 6) return false
    
    // Market hours: 9:30 AM - 4:00 PM ET (14:30 - 21:00 UTC)
    const marketOpen = 14.5 // 9:30 AM ET in decimal hours
    const marketClose = 21 // 4:00 PM ET in decimal hours
    const currentTime = hour + minute / 60
    
    return currentTime >= marketOpen && currentTime < marketClose
  }

  useEffect(() => {
    fetchOpportunities()
    
    if (autoRefresh && isMarketOpen()) {
      const interval = setInterval(() => {
        if (isMarketOpen()) {
          fetchOpportunities()
        }
      }, 60000) // Refresh every minute when market is open
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'medium': return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'high': return 'bg-red-50 text-red-700 border-red-200'
      default: return 'bg-slate-50 text-slate-700 border-slate-200'
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'bg-red-500 text-white'
    if (score >= 80) return 'bg-orange-500 text-white'
    if (score >= 70) return 'bg-amber-500 text-white'
    return 'bg-slate-400 text-white'
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const getTradeLogic = (opp: Opportunity) => {
    const isCall = opp.optionType === 'call'
    const daysToExp = opp.daysToExpiration
    const strikeVsPrice = opp.strike / opp.stockPrice
    const ivRank = opp.ivRank
    
    let logic = ""
    
    // Basic trade direction
    if (isCall) {
      logic += `This is a CALL option betting that ${opp.symbol} will go UP. `
    } else {
      logic += `This is a PUT option betting that ${opp.symbol} will go DOWN. `
    }
    
    // Strike analysis
    if (strikeVsPrice < 0.95) {
      logic += `The strike price is ${((1-strikeVsPrice)*100).toFixed(1)}% below the current stock price, making this an in-the-money option with built-in value. `
    } else if (strikeVsPrice > 1.05) {
      logic += `The strike price is ${((strikeVsPrice-1)*100).toFixed(1)}% above the current stock price, making this an out-of-the-money option that needs a significant move to be profitable. `
    } else {
      logic += `The strike price is very close to the current stock price, making this an at-the-money option that's highly sensitive to price movements. `
    }
    
    // Time analysis
    if (daysToExp <= 7) {
      logic += `With only ${daysToExp} days until expiration, this is a short-term trade that requires quick price movement. `
    } else if (daysToExp <= 30) {
      logic += `With ${daysToExp} days until expiration, this gives a reasonable timeframe for the expected move to play out. `
    } else {
      logic += `With ${daysToExp} days until expiration, this provides plenty of time for the trade thesis to develop. `
    }
    
    // IV analysis
    if (ivRank < 30) {
      logic += `The implied volatility is relatively low (${ivRank.toFixed(0)}% rank), meaning options are cheap and volatility could expand, boosting option prices. `
    } else if (ivRank > 70) {
      logic += `The implied volatility is high (${ivRank.toFixed(0)}% rank), meaning options are expensive but could benefit from volatility contraction. `
    } else {
      logic += `The implied volatility is moderate (${ivRank.toFixed(0)}% rank), providing a balanced environment for the trade. `
    }
    
    // Pattern-specific logic
    if (opp.gammaSqueezeScore && opp.gammaSqueezeScore > 0) {
      logic += `The high gamma squeeze score suggests potential for explosive upside if the stock breaks through key resistance levels. `
    }
    
    if (opp.unusualFlowScore && opp.unusualFlowScore > 0) {
      logic += `Unusual options activity indicates smart money positioning, potentially signaling an upcoming move. `
    }
    
    return logic
  }

  const getGreeksExplanation = (opp: Opportunity) => {
    const explanations = []
    const greeks = opp.greeks
    
    // Delta explanation
    const deltaPercent = (greeks.delta * 100).toFixed(1)
    if (Math.abs(greeks.delta) > 0.5) {
      explanations.push(`Delta of ${deltaPercent}% means this option will move significantly with stock price changes - expect big swings in option value.`)
    } else if (Math.abs(greeks.delta) > 0.3) {
      explanations.push(`Delta of ${deltaPercent}% provides good sensitivity to stock moves while maintaining reasonable premium cost.`)
    } else {
      explanations.push(`Delta of ${deltaPercent}% means the option is less sensitive to small stock moves but cheaper to own.`)
    }
    
    // Gamma explanation
    if (greeks.gamma > 0.02) {
      explanations.push(`High gamma of ${greeks.gamma.toFixed(3)} means the option's sensitivity to stock price changes will increase dramatically as the stock moves in your favor.`)
    } else if (greeks.gamma > 0.01) {
      explanations.push(`Moderate gamma of ${greeks.gamma.toFixed(3)} provides good acceleration as the stock moves in your direction.`)
    } else {
      explanations.push(`Lower gamma of ${greeks.gamma.toFixed(3)} means more linear price movement relative to the stock.`)
    }
    
    // Theta explanation (time decay)
    const thetaDaily = greeks.theta
    if (Math.abs(thetaDaily) > 0.5) {
      explanations.push(`High theta decay of ${thetaDaily.toFixed(2)} per day means this option loses significant value each day - time is working against you.`)
    } else if (Math.abs(thetaDaily) > 0.2) {
      explanations.push(`Moderate theta decay of ${thetaDaily.toFixed(2)} per day means reasonable time decay that won't destroy the trade quickly.`)
    } else {
      explanations.push(`Low theta decay of ${thetaDaily.toFixed(2)} per day means time decay is minimal, giving you more time for the trade to work.`)
    }
    
    // Vega explanation (volatility sensitivity)
    if (greeks.vega > 0.2) {
      explanations.push(`High vega of ${greeks.vega.toFixed(2)} means this option is very sensitive to volatility changes - a volatility spike could significantly boost option value.`)
    } else if (greeks.vega > 0.1) {
      explanations.push(`Moderate vega of ${greeks.vega.toFixed(2)} provides good exposure to volatility expansion while managing premium cost.`)
    } else {
      explanations.push(`Lower vega of ${greeks.vega.toFixed(2)} means the option is less affected by volatility changes, focusing more on directional moves.`)
    }
    
    return explanations
  }

  const getRiskRewardExplanation = (opp: Opportunity) => {
    const maxReturn = opp.maxReturn
    const maxLoss = opp.maxLoss
    const potentialReturn = opp.potentialReturn
    const daysToExp = opp.daysToExpiration
    
    let explanation = `This trade offers a potential return of ${potentialReturn.toFixed(1)}% on a 10% stock move, with a maximum possible return of ${maxReturn.toFixed(1)}%. `
    
    // Risk assessment
    if (maxLoss < 100) {
      explanation += `Your maximum loss is limited to ${maxLoss.toFixed(1)}% of your investment. `
    } else {
      explanation += `Your maximum loss is ${maxLoss.toFixed(1)}% of your investment. `
    }
    
    // Risk/Reward ratio
    const riskRewardRatio = potentialReturn / Math.abs(maxLoss)
    if (riskRewardRatio > 5) {
      explanation += `This creates an excellent risk/reward ratio of ${riskRewardRatio.toFixed(1)}:1, meaning you could make ${riskRewardRatio.toFixed(1)}x more than you could lose. `
    } else if (riskRewardRatio > 2) {
      explanation += `This creates a good risk/reward ratio of ${riskRewardRatio.toFixed(1)}:1, providing favorable odds. `
    } else {
      explanation += `This creates a risk/reward ratio of ${riskRewardRatio.toFixed(1)}:1. `
    }
    
    // Time considerations
    if (daysToExp <= 7) {
      explanation += `With only ${daysToExp} days left, this is a high-conviction trade that needs to work quickly. The short timeframe amplifies both profit potential and time decay risk.`
    } else if (daysToExp <= 30) {
      explanation += `With ${daysToExp} days until expiration, you have a reasonable timeframe for the trade to develop while managing time decay.`
    } else {
      explanation += `With ${daysToExp} days until expiration, you have plenty of time for the trade thesis to play out with lower time decay pressure.`
    }
    
    return explanation
  }

  const calculateInvestmentScenario = (opp: Opportunity, investmentAmount: number) => {
    const optionPrice = opp.premium
    const contractsToBuy = Math.floor(investmentAmount / (optionPrice * 100))
    const totalCost = contractsToBuy * optionPrice * 100
    
    const scenarios = [
      { move: '5%', return: opp.returnsAnalysis[0]?.return || 0 },
      { move: '10%', return: opp.returnsAnalysis[0]?.return || 0 },
      { move: '15%', return: opp.returnsAnalysis[1]?.return || 0 },
      { move: '20%', return: opp.returnsAnalysis[1]?.return || 0 },
      { move: '30%', return: opp.returnsAnalysis[2]?.return || 0 }
    ]
    
    return {
      contractsToBuy,
      totalCost,
      remainingCapital: investmentAmount - totalCost,
      scenarios: scenarios.map(scenario => ({
        ...scenario,
        profit: (totalCost * scenario.return / 100),
        totalValue: totalCost + (totalCost * scenario.return / 100)
      }))
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Header - Fabric-inspired clean design */}
      <div className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-6xl mx-auto px-8 py-12">
          <div className="flex items-center justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-900 dark:bg-white rounded-2xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white dark:text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">
                    Options Scanner
                  </h1>
                  <p className="text-lg text-slate-600 dark:text-slate-400 font-normal">
                    Your second brain for finding explosive trading opportunities
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Investment Amount:
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">$</span>
                  <input
                    type="number"
                    value={investmentAmount}
                    onChange={(e) => setInvestmentAmount(Number(e.target.value))}
                    className="w-24 px-2 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    min="100"
                    max="100000"
                    step="100"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Auto-refresh {isMarketOpen() ? '(every 60s)' : '(when market opens)'}
                </span>
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    autoRefresh ? 'bg-slate-900 dark:bg-white' : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white dark:bg-slate-900 transition-transform ${
                      autoRefresh ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              
              <button
                onClick={fetchOpportunities}
                disabled={isLoading}
                className="px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-medium shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-3 disabled:opacity-50 text-sm"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white dark:border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                    Scanning...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Scan Now
                  </>
                )}
              </button>
              </div>
            </div>

          <div className="mt-6 flex items-center gap-6 text-sm">
            {lastUpdate && (
              <div className="text-slate-500 dark:text-slate-400">
                Last updated: {lastUpdate.toLocaleString()}
              </div>
            )}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
              isMarketOpen() 
                ? 'bg-emerald-100 text-emerald-700' 
                : 'bg-slate-100 text-slate-600'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isMarketOpen() ? 'bg-emerald-500' : 'bg-slate-400'
              }`}></div>
              {isMarketOpen() ? 'Market Open' : 'Market Closed'}
            </div>
                </div>
                </div>
              </div>

      <div className="max-w-6xl mx-auto px-8 py-12">
        {/* Stats Cards - Fabric-inspired minimal design */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Opportunities</p>
              <p className="text-3xl font-semibold text-slate-900 dark:text-white">{opportunities.length}</p>
              <p className="text-xs text-slate-500 dark:text-slate-500">Live scan results</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">High Score (90+)</p>
              <p className="text-3xl font-semibold text-red-600">{opportunities.filter(o => o.score >= 90).length}</p>
              <p className="text-xs text-red-600">Explosive potential</p>
              </div>
              </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Gamma Squeezes</p>
              <p className="text-3xl font-semibold text-orange-600">{opportunities.filter(o => o.gammaSqueezeScore && o.gammaSqueezeScore > 0).length}</p>
              <p className="text-xs text-orange-600">Squeeze potential</p>
            </div>
                  </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Unusual Flow</p>
              <p className="text-3xl font-semibold text-blue-600">{opportunities.filter(o => o.unusualFlowScore && o.unusualFlowScore > 0).length}</p>
              <p className="text-xs text-blue-600">Smart money activity</p>
                  </div>
                </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">News Impact</p>
              <p className="text-3xl font-semibold text-purple-600">{opportunities.filter(o => o.newsImpactScore && o.newsImpactScore > 0).length}</p>
              <p className="text-xs text-purple-600">News catalysts</p>
                  </div>
                </div>
              </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-16">
            <div className="inline-flex items-center gap-3 text-slate-600 dark:text-slate-400">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-900 dark:border-slate-600 dark:border-t-white rounded-full animate-spin"></div>
              <span className="font-medium">Scanning for opportunities...</span>
            </div>
              </div>
        )}

        {/* Empty State */}
        {!isLoading && opportunities.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No opportunities found</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              The scanner is currently running but hasn't found any high-scoring opportunities yet.
            </p>
            <button
              onClick={fetchOpportunities}
              className="px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-medium hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Opportunities Grid - Fabric-inspired card design */}
        {!isLoading && opportunities.length > 0 && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                Trading Opportunities
              </h2>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {opportunities.length} opportunities found
              </span>
            </div>

            <div className="grid gap-6">
              {opportunities.map((opp, index) => (
                <div key={index} className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-colors">
                  <div className="flex items-start justify-between mb-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">
                          {opp.symbol}
                </div>
                        <div className={`px-3 py-1 rounded-xl text-sm font-medium ${getScoreColor(opp.score)}`}>
                          {opp.score}/100
                </div>
                        <div className="flex items-center gap-2">
                          {opp.gammaSqueezeScore && opp.gammaSqueezeScore > 0 && (
                            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-xl text-xs font-medium">
                              GAMMA: {opp.gammaSqueezeScore}
                            </span>
                          )}
                          {opp.unusualFlowScore && opp.unusualFlowScore > 0 && (
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-xl text-xs font-medium">
                              FLOW: {opp.unusualFlowScore}
                            </span>
                          )}
                          {opp.newsImpactScore && opp.newsImpactScore > 0 && (
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-xl text-xs font-medium">
                              NEWS: {opp.newsImpactScore}
                            </span>
                          )}
                </div>
              </div>
                      
                      <div className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
                        <span>{opp.optionType.toUpperCase()} ${opp.strike}</span>
                        <span>Expires {opp.expiration}</span>
                        <span>{opp.daysToExpiration} days</span>
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${getRiskColor(opp.riskLevel)}`}>
                          {opp.riskLevel.toUpperCase()} RISK
                        </span>
            </div>
          </div>

                    <div className="text-right space-y-1">
                      <div className="text-2xl font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(opp.premium)}
              </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        Premium
              </div>
            </div>
                  </div>

                  {/* Recent News */}
                  {opp.recentNews && opp.recentNews.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Recent News</h4>
                      <div className="space-y-3">
                        {opp.recentNews.map((news, i) => (
                          <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                            <div className="flex items-start justify-between mb-2">
                              <h5 className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2">
                                {news.headline}
                              </h5>
                              <span className={`px-2 py-1 rounded-lg text-xs font-medium ml-3 ${
                                news.category === 'political' ? 'bg-red-100 text-red-700' :
                                news.category === 'regulatory' ? 'bg-orange-100 text-orange-700' :
                                news.category === 'earnings' ? 'bg-blue-100 text-blue-700' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {news.category}
                              </span>
                  </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">
                              {news.summary}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500 dark:text-slate-500">
                                {news.source}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className={`text-xs font-medium ${
                                  news.sentiment.score > 0 ? 'text-emerald-600' : 
                                  news.sentiment.score < 0 ? 'text-red-600' : 'text-slate-600'
                                }`}>
                                  {news.sentiment.label}
                                </span>
                                <span className="text-xs text-slate-500">
                                  Impact: {news.impact_score}
                                </span>
                  </div>
                </div>
              </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Trade Logic & Analysis */}
                  <div className="mb-6">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Why This Trade Makes Sense</h4>
                    <div className="space-y-4">
                      {/* Trade Logic */}
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                        <h5 className="font-medium text-slate-900 dark:text-white mb-2">Trade Logic</h5>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                          {getTradeLogic(opp)}
                        </p>
                      </div>

                      {/* Greeks Explanation */}
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                        <h5 className="font-medium text-slate-900 dark:text-white mb-2">What the Greeks Tell Us</h5>
                        <div className="space-y-2">
                          {getGreeksExplanation(opp).map((explanation, i) => (
                            <p key={i} className="text-sm text-slate-700 dark:text-slate-300">
                              • {explanation}
                            </p>
                          ))}
                        </div>
                      </div>

                      {/* Risk Assessment */}
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                        <h5 className="font-medium text-slate-900 dark:text-white mb-2">Risk & Reward Profile</h5>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                          {getRiskRewardExplanation(opp)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Investment Calculator */}
                  <div className="mb-6">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Investment Calculator</h4>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6">
                      {(() => {
                        const scenario = calculateInvestmentScenario(opp, investmentAmount)
                        return (
                          <div className="space-y-4">
                            {/* Investment Summary */}
                            <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-700 rounded-xl">
                              <div>
                                <div className="text-sm font-medium text-slate-600 dark:text-slate-400">Your Investment</div>
                                <div className="text-lg font-semibold text-slate-900 dark:text-white">
                                  {formatCurrency(scenario.totalCost)} for {scenario.contractsToBuy} contracts
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium text-slate-600 dark:text-slate-400">Option Price</div>
                                <div className="text-lg font-semibold text-slate-900 dark:text-white">
                                  {formatCurrency(opp.premium)} per contract
                                </div>
                              </div>
                            </div>

                            {/* Profit Scenarios */}
                            <div>
                              <h5 className="font-medium text-slate-900 dark:text-white mb-3">Potential Profits</h5>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {scenario.scenarios.map((scenarioItem, i) => (
                                  <div key={i} className="bg-white dark:bg-slate-700 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                                        {scenarioItem.move} Stock Move
                                      </span>
                                      <span className="text-xs font-semibold text-emerald-600">
                                        +{scenarioItem.return.toFixed(1)}%
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">Profit:</span>
                                        <span className="font-semibold text-emerald-600">
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

                            {/* Risk Warning */}
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                              <div className="flex items-start gap-3">
                                <div className="w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center mt-0.5">
                                  <span className="text-xs text-white font-bold">!</span>
                                </div>
                                <div>
                                  <div className="font-medium text-amber-800 dark:text-amber-200 mb-1">Risk Warning</div>
                                  <div className="text-sm text-amber-700 dark:text-amber-300">
                                    Maximum loss: {formatCurrency(scenario.totalCost)} (100% of investment). 
                                    Options can expire worthless, and you could lose your entire investment.
                  </div>
                  </div>
                </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Potential Return</div>
                      <div className="text-lg font-semibold text-emerald-600">{opp.potentialReturn.toFixed(1)}%</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Max Return</div>
                      <div className="text-lg font-semibold text-emerald-600">{opp.maxReturn.toFixed(1)}%</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Max Loss</div>
                      <div className="text-lg font-semibold text-red-600">{opp.maxLoss.toFixed(1)}%</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Breakeven</div>
                      <div className="text-lg font-semibold text-slate-900 dark:text-white">${opp.breakeven.toFixed(2)}</div>
              </div>
            </div>

                  {/* Greeks */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Delta</div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{opp.greeks.delta.toFixed(3)}</div>
              </div>
                    <div className="text-center">
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Gamma</div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{opp.greeks.gamma.toFixed(3)}</div>
            </div>
                    <div className="text-center">
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Theta</div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{opp.greeks.theta.toFixed(3)}</div>
            </div>
                    <div className="text-center">
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Vega</div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{opp.greeks.vega.toFixed(3)}</div>
                </div>
                </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}