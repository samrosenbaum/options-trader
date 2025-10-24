'use client'

import { useState, useEffect } from 'react'

export default function AnalystDemo() {
  const [morningBrief, setMorningBrief] = useState<any>(null)
  const [nightlyBrief, setNightlyBrief] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadBriefs() {
      try {
        const [morning, nightly] = await Promise.all([
          fetch('/api/analyst/morning-brief').then(r => r.json()),
          fetch('/api/analyst/nightly-brief').then(r => r.json())
        ])

        setMorningBrief(morning)
        setNightlyBrief(nightly)
      } catch (error) {
        console.error('Error loading briefs:', error)
      } finally {
        setLoading(false)
      }
    }

    loadBriefs()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading briefs...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">
            📊 Monty Analyst Demo
          </h1>
          <p className="text-xl text-purple-200">
            Real-time intelligence briefs from live market data
          </p>
        </div>

        {/* Morning Brief */}
        {morningBrief?.success && (
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6">
              <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                🌅 Morning Brief
              </h2>
              <p className="text-purple-100 mt-2">
                {new Date(morningBrief.brief.timestamp).toLocaleString()}
              </p>
            </div>

            <div className="p-8 space-y-8">
              {/* Market Conditions */}
              <div>
                <h3 className="text-xl font-bold text-slate-800 mb-4">📊 Market Conditions</h3>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(morningBrief.brief.market_conditions).map(([symbol, data]: [string, any]) => (
                    <div key={symbol} className="bg-slate-50 rounded-lg p-4">
                      <div className="text-sm font-semibold text-slate-600">{symbol}</div>
                      <div className="text-2xl font-bold text-slate-900">${data.price.toFixed(2)}</div>
                      <div className={`text-sm font-medium ${data.trend === 'bullish' ? 'text-green-600' : 'text-red-600'}`}>
                        {data.trend === 'bullish' ? '📈' : '📉'} {data.trend}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* UOA Signals */}
              {Object.keys(morningBrief.brief.uoa_signals).length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-800 mb-4">
                    🔥 Unusual Options Activity ({Object.keys(morningBrief.brief.uoa_signals).length} stocks)
                  </h3>
                  <div className="space-y-4">
                    {Object.entries(morningBrief.brief.uoa_signals).slice(0, 5).map(([symbol, signal]: [string, any]) => {
                      const topCall = signal.call_signals?.[0]
                      const topPut = signal.put_signals?.[0]

                      return (
                        <div key={symbol} className="bg-amber-50 border-l-4 border-amber-500 rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="text-xl font-bold text-slate-900">{symbol}</div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                              signal.bias === 'bullish'
                                ? 'bg-green-100 text-green-800'
                                : signal.bias === 'bearish'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {signal.bias.toUpperCase()}
                            </div>
                          </div>

                          <div className="text-sm text-slate-600 mb-3">
                            Current: <strong>${signal.current_price.toFixed(2)}</strong> |
                            Volume: <strong>{signal.total_unusual_volume.toLocaleString()}</strong>
                          </div>

                          {topCall && (
                            <div className="bg-white rounded p-3 mb-2 font-mono text-sm">
                              🔥 ${topCall.strike} CALL: {topCall.volume.toLocaleString()} vol / {topCall.oi.toLocaleString()} OI =
                              <span className="text-red-600 font-bold"> {topCall.vol_oi_ratio.toFixed(1)}x</span>
                              {topCall.is_atm && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">ATM</span>}
                            </div>
                          )}

                          {topPut && (
                            <div className="bg-white rounded p-3 font-mono text-sm">
                              📉 ${topPut.strike} PUT: {topPut.volume.toLocaleString()} vol / {topPut.oi.toLocaleString()} OI =
                              <span className="text-red-600 font-bold"> {topPut.vol_oi_ratio.toFixed(1)}x</span>
                              {topPut.is_atm && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">ATM</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Watchlist */}
              <div>
                <h3 className="text-xl font-bold text-slate-800 mb-4">
                  🎯 Today's Watchlist ({morningBrief.brief.watchlist.length} stocks)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {morningBrief.brief.watchlist.slice(0, 10).map((symbol: string) => (
                    <div key={symbol} className="bg-slate-100 px-4 py-2 rounded-lg font-semibold text-slate-700">
                      {symbol}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nightly Brief */}
        {nightlyBrief?.success && (
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6">
              <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                🌙 Nightly Brief
              </h2>
              <p className="text-purple-100 mt-2">Tomorrow's Battle Plan</p>
            </div>

            <div className="p-8 space-y-8">
              {/* Key Setups */}
              {nightlyBrief.brief.key_setups.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-800 mb-4">
                    🎯 Key Setups ({nightlyBrief.brief.key_setups.length} high-conviction plays)
                  </h3>
                  <div className="space-y-3">
                    {nightlyBrief.brief.key_setups.slice(0, 5).map((setup: any, idx: number) => (
                      <div key={idx} className="bg-purple-50 border-l-4 border-purple-500 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-lg font-bold text-slate-900">{setup.symbol}</div>
                          <div className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                            {setup.conviction} CONVICTION
                          </div>
                        </div>
                        <div className="text-sm text-slate-600 mb-2">{setup.setup}</div>
                        <div className="text-sm font-mono">
                          Key Level: <strong>${setup.key_level.toFixed(2)}</strong>
                        </div>
                        <div className="text-sm text-purple-700 mt-2">{setup.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Market Setup */}
              {Object.keys(nightlyBrief.brief.market_levels).length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-800 mb-4">📊 Market Setup</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(nightlyBrief.brief.market_levels).map(([symbol, data]: [string, any]) => (
                      <div key={symbol} className="bg-slate-50 rounded-lg p-4">
                        <div className="text-lg font-bold text-slate-900 mb-2">{symbol}</div>
                        <div className="text-2xl font-bold text-slate-800 mb-2">${data.current_price.toFixed(2)}</div>
                        <div className="text-sm space-y-1">
                          <div>Support: <strong className="text-green-600">${data.support.toFixed(2)}</strong></div>
                          <div>Resistance: <strong className="text-red-600">${data.resistance.toFixed(2)}</strong></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-purple-200 py-8">
          <p className="text-sm">
            All data is live from market sources. Refresh page to update.
          </p>
          <p className="text-xs mt-2 opacity-75">
            Generated by Monty - Your AI Options Analyst
          </p>
        </div>
      </div>
    </div>
  )
}
