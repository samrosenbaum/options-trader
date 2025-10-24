'use client'

import { useState } from 'react'

export default function AnalystEmailTest() {
  const [sending, setSending] = useState<string | null>(null)
  const [results, setResults] = useState<any[]>([])

  async function sendEmail(type: 'morning' | 'nightly') {
    setSending(type)
    try {
      const response = await fetch(`/api/analyst/send-${type}-brief`, {
        method: 'POST'
      })

      const data = await response.json()
      setResults(prev => [...prev, { type, timestamp: new Date().toISOString(), data }])
    } catch (error) {
      setResults(prev => [...prev, {
        type,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }])
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">
            Email Brief Tester
          </h1>
          <p className="text-xl text-purple-200">
            Manually send analyst briefs to your email
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Send Briefs</h2>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => sendEmail('morning')}
              disabled={sending !== null}
              className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-lg font-bold text-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {sending === 'morning' ? 'Sending...' : 'Send Morning Brief'}
            </button>

            <button
              onClick={() => sendEmail('nightly')}
              disabled={sending !== null}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-lg font-bold text-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {sending === 'nightly' ? 'Sending...' : 'Send Nightly Brief'}
            </button>
          </div>
        </div>

        {results.length > 0 && (
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Results</h2>

            <div className="space-y-4">
              {results.map((result, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border-l-4 ${
                    result.error
                      ? 'bg-red-50 border-red-500'
                      : 'bg-green-50 border-green-500'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-bold text-slate-900 capitalize">
                      {result.type} Brief
                    </div>
                    <div className="text-sm text-slate-600">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </div>
                  </div>

                  {result.error ? (
                    <div className="text-red-600 font-mono text-sm">
                      Error: {result.error}
                    </div>
                  ) : (
                    <div className="text-green-600 font-semibold">
                      ✓ {result.data.message}
                      {result.data.emailId && (
                        <div className="text-sm text-slate-600 mt-1">
                          Email ID: {result.data.emailId}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-lg">
          <h3 className="font-bold text-yellow-900 mb-2">Setup Instructions:</h3>
          <ol className="text-sm text-yellow-800 space-y-2">
            <li>1. Add your Resend API key to .env.local: RESEND_API_KEY=re_...</li>
            <li>2. Add your email to .env.local: ANALYST_EMAIL_RECIPIENT=you@example.com</li>
            <li>3. Restart the dev server (npm run dev)</li>
            <li>4. Click the buttons above to test!</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
