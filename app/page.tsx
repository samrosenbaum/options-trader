'use client'

import { useState, useEffect } from 'react'
import RealTimeProgress from '../components/real-time-progress'
import LiveTicker from '../components/live-ticker'
import OpportunityCard from '../components/opportunity-card'
import type { Opportunity, CryptoAlert } from '../lib/types/opportunity'

export default function HomePage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [investmentAmount, setInvestmentAmount] = useState(1000)
  const [activeTab, setActiveTab] = useState<'options' | 'crypto'>('options')
  const [cryptoAlerts, setCryptoAlerts] = useState<CryptoAlert[]>([])
  const [cryptoLoading, setCryptoLoading] = useState(false)

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

  const fetchCryptoAlerts = async () => {
    try {
      setCryptoLoading(true)
      const response = await fetch('/api/crypto-scan')
      const data = await response.json()
      if (data.success) {
        setCryptoAlerts(data.trading_alerts || [])
      }
    } catch (error) {
      console.error('Error fetching crypto alerts:', error)
    } finally {
      setCryptoLoading(false)
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
              {/* Tab Navigation */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-2xl p-1">
                <button
                  onClick={() => setActiveTab('options')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    activeTab === 'options'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Options
                </button>
                <button
                  onClick={() => setActiveTab('crypto')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    activeTab === 'crypto'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Crypto
                </button>
              </div>

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
                onClick={activeTab === 'options' ? fetchOpportunities : fetchCryptoAlerts}
                disabled={activeTab === 'options' ? isLoading : cryptoLoading}
                className="px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-medium shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-3 disabled:opacity-50 text-sm"
              >
                {(activeTab === 'options' ? isLoading : cryptoLoading) ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white dark:border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                    Scanning...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Scan {activeTab === 'options' ? 'Options' : 'Crypto'}
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

      {/* Live Ticker */}
      <div className="max-w-6xl mx-auto px-8">
        <LiveTicker />
      </div>

      <div className="max-w-6xl mx-auto px-8 py-12">
        {/* Scan Progress */}
        <RealTimeProgress 
          isScanning={isLoading || cryptoLoading} 
          scanType={activeTab}
          onScanComplete={(results) => {
            console.log('Scan completed with results:', results)
          }}
        />
        
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
                The scanner is currently running but hasn&apos;t found any high-scoring opportunities yet.
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
                <OpportunityCard
                  key={`${opp.symbol}-${opp.expiration}-${opp.optionType}-${index}`}
                  opportunity={opp}
                  investmentAmount={investmentAmount}
                />
              ))}
            </div>
          </div>
        )}

        {/* Crypto Section */}
        {activeTab === 'crypto' && (
          <div className="space-y-8">
            {/* Crypto Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Alerts</p>
                  <p className="text-3xl font-semibold text-slate-900 dark:text-white">{cryptoAlerts.length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500">Trading signals</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Buy Signals</p>
                  <p className="text-3xl font-semibold text-emerald-600">{cryptoAlerts.filter(a => a.action === 'BUY').length}</p>
                  <p className="text-xs text-emerald-600">Buy opportunities</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Sell Signals</p>
                  <p className="text-3xl font-semibold text-red-600">{cryptoAlerts.filter(a => a.action === 'SELL').length}</p>
                  <p className="text-xs text-red-600">Sell opportunities</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">High Urgency</p>
                  <p className="text-3xl font-semibold text-orange-600">{cryptoAlerts.filter(a => a.urgency >= 8).length}</p>
                  <p className="text-xs text-orange-600">Urgent alerts</p>
                </div>
              </div>
            </div>

            {/* Crypto Loading State */}
            {cryptoLoading && (
              <div className="text-center py-16">
                <div className="inline-flex items-center gap-3 text-slate-600 dark:text-slate-400">
                  <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-900 dark:border-slate-600 dark:border-t-white rounded-full animate-spin"></div>
                  <span className="font-medium">Scanning crypto markets...</span>
                </div>
              </div>
            )}

            {/* Crypto Empty State */}
            {!cryptoLoading && cryptoAlerts.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No crypto alerts found</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                  Click &quot;Scan Crypto&quot; to find coins with explosive potential based on volume, momentum, and fundamentals.
                </p>
                <button
                  onClick={fetchCryptoAlerts}
                  className="px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-medium hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
                >
                  Scan Crypto Markets
                </button>
              </div>
            )}

            {/* Crypto Alerts */}
            {!cryptoLoading && cryptoAlerts.length > 0 && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                    Crypto Trading Alerts
                  </h2>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {cryptoAlerts.length} alerts found
                  </span>
                </div>
                
                <div className="grid gap-6">
                  {cryptoAlerts.map((alert, index) => (
                    <div key={index} className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-colors">
                      <div className="flex items-start justify-between mb-6">
                        <div className="space-y-3">
                          <div className="flex items-center gap-4">
                            <div className="text-2xl font-bold text-slate-900 dark:text-white">
                              {alert.symbol}
                            </div>
                            <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                              alert.action === 'BUY' 
                                ? 'bg-emerald-500 text-white' 
                                : 'bg-red-500 text-white'
                            }`}>
                              {alert.action}
                            </div>
                            <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium">
                              {alert.confidence.toFixed(0)}% confidence
                            </div>
                            <div className={`px-3 py-1 rounded-xl text-xs font-medium ${
                              alert.urgency >= 8 ? 'bg-red-100 text-red-700' :
                              alert.urgency >= 6 ? 'bg-orange-100 text-orange-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              Urgency: {alert.urgency}/10
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
                            <span>{alert.name}</span>
                            <span>Market Cap: ${(alert.market_cap / 1_000_000).toFixed(1)}M</span>
                            <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${
                              alert.risk_level === 'low' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              alert.risk_level === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-red-50 text-red-700 border-red-200'
                            }`}>
                              {alert.risk_level.toUpperCase()} RISK
                            </span>
                          </div>
                        </div>
                        
                        <div className="text-right space-y-1">
                          <div className="text-2xl font-semibold text-slate-900 dark:text-white">
                            ${alert.current_price.toFixed(6)}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">
                            Current Price
                          </div>
                        </div>
                      </div>

                      {/* Trading Strategy */}
                      <div className="mb-6">
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Trading Strategy: {alert.strategy}</h4>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="text-center">
                              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Entry Price</div>
                              <div className="text-lg font-semibold text-slate-900 dark:text-white">
                                ${alert.entry_price.toFixed(6)}
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Target Price</div>
                              <div className="text-lg font-semibold text-emerald-600">
                                ${alert.target_price.toFixed(6)}
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Stop Loss</div>
                              <div className="text-lg font-semibold text-red-600">
                                ${alert.stop_loss.toFixed(6)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Position Sizing */}
                      <div className="mb-6">
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Position Sizing</h4>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {Object.entries(alert.position_size.position_amounts).map(([portfolio, data]) => (
                              <div key={portfolio} className="text-center">
                                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{portfolio}</div>
                                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                  ${data.amount}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-500">
                                  ({data.percentage}%)
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Reasons */}
                      <div className="mb-6">
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Why {alert.action}?</h4>
                        <div className="space-y-2">
                          {alert.reasons.slice(0, 5).map((reason, i) => (
                            <p key={i} className="text-sm text-slate-700 dark:text-slate-300">
                              • {reason}
                            </p>
                          ))}
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-4 border-t border-slate-200/60 dark:border-slate-700/60">
                        <span className="text-xs text-slate-500 dark:text-slate-500">
                          Alert generated: {new Date(alert.timestamp).toLocaleString()}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 dark:text-slate-500">Strategy:</span>
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{alert.strategy}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
