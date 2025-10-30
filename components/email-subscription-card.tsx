'use client'

import { useState, useEffect } from 'react'

interface SubscriptionPreferences {
  morning_brief: boolean
  nightly_brief: boolean
  market_open_update: boolean
  weekly_analysis: boolean
}

export default function EmailSubscriptionCard() {
  const [preferences, setPreferences] = useState<SubscriptionPreferences>({
    morning_brief: true,
    nightly_brief: true,
    market_open_update: false,
    weekly_analysis: true
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchPreferences()
  }, [])

  async function fetchPreferences() {
    try {
      const response = await fetch('/api/subscriptions')
      if (response.ok) {
        const data = await response.json()
        setPreferences(data)
      }
    } catch (error) {
      console.error('Failed to fetch preferences:', error)
    } finally {
      setLoading(false)
    }
  }

  async function savePreferences() {
    setSaving(true)
    setMessage('')

    try {
      const response = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences)
      })

      if (response.ok) {
        setMessage('Preferences saved successfully!')
        setTimeout(() => setMessage(''), 3000)
      } else {
        setMessage('Failed to save preferences')
      }
    } catch {
      setMessage('Error saving preferences')
    } finally {
      setSaving(false)
    }
  }

  async function togglePreference(key: keyof SubscriptionPreferences) {
    const newPreferences = { ...preferences, [key]: !preferences[key] }
    setPreferences(newPreferences)

    // Auto-save on toggle
    setSaving(true)
    try {
      const response = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPreferences)
      })

      if (response.ok) {
        setMessage('✓ Saved')
        setTimeout(() => setMessage(''), 2000)
      } else {
        setMessage('Failed to save')
        // Revert on failure
        setPreferences(preferences)
      }
    } catch {
      setMessage('Error saving')
      // Revert on failure
      setPreferences(preferences)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Email Analyst Briefs</h3>
          <p className="text-sm text-gray-600 mt-1">
            Get Monty&apos;s market intelligence delivered to your inbox
          </p>
        </div>
        <div className="text-3xl">📧</div>
      </div>

      <div className="space-y-4">
        <label className="flex items-start space-x-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={preferences.morning_brief}
            onChange={() => togglePreference('morning_brief')}
            className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div className="flex-1">
            <div className="font-semibold text-gray-900 group-hover:text-blue-600">
              Morning Brief (7:00 AM)
            </div>
            <div className="text-sm text-gray-600">
              Pre-market intelligence, UOA signals, and today&apos;s watchlist
            </div>
          </div>
        </label>

        <label className="flex items-start space-x-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={preferences.nightly_brief}
            onChange={() => togglePreference('nightly_brief')}
            className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div className="flex-1">
            <div className="font-semibold text-gray-900 group-hover:text-blue-600">
              Nightly Brief (8:00 PM)
            </div>
            <div className="text-sm text-gray-600">
              Tomorrow&apos;s battle plan with high-conviction setups
            </div>
          </div>
        </label>

        <label className="flex items-start space-x-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={preferences.market_open_update}
            onChange={() => togglePreference('market_open_update')}
            className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div className="flex-1">
            <div className="font-semibold text-gray-900 group-hover:text-blue-600">
              Market Open Update (9:35 AM)
            </div>
            <div className="text-sm text-gray-600">
              Entry signals with confidence ratings (only on trading days)
            </div>
          </div>
        </label>

        <label className="flex items-start space-x-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={preferences.weekly_analysis}
            onChange={() => togglePreference('weekly_analysis')}
            className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div className="flex-1">
            <div className="font-semibold text-gray-900 group-hover:text-blue-600">
              Weekly Analysis (Sundays)
            </div>
            <div className="text-sm text-gray-600">
              Performance review, learnings, and next week&apos;s plan
            </div>
          </div>
        </label>
      </div>

      {message && (
        <div className="mt-4 text-center">
          <div className={`text-sm font-medium ${message.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>
            {message}
          </div>
        </div>
      )}

      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="text-sm text-blue-900">
          <strong>Note:</strong> Briefs are sent based on market hours (Eastern Time).
          Your preferences are saved automatically.
        </div>
      </div>
    </div>
  )
}
