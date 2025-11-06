# Monty Analyst API Documentation

Monty's Analyst system provides four timed intelligence briefs + real-time UOA scanning to help you catch market moves BEFORE they happen.

## Overview

**The Analyst's Daily Schedule:**
- **10:00 AM** - Morning Brief (market open intelligence with fresh price action)
- **9:35 AM** - Market Open Update (entry signals + momentum confirmation)
- **8:00 PM** - Nightly Brief (tomorrow's battle plan)
- **Saturday** - Weekly Analysis (learn from your trades)
- **Real-time** - UOA Scanner (unusual options activity detection)

---

## API Endpoints

### 1. UOA Scanner (Unusual Options Activity)

**Endpoint:** `/api/scan-uoa`

**Purpose:** Detect smart money positioning BEFORE news breaks

**Methods:** `GET` (default watchlist) | `POST` (custom symbols)

#### POST Request

```typescript
const response = await fetch('/api/scan-uoa', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbols: ['COIN', 'TSLA', 'NVDA'],
    min_vol_oi_ratio: 2.0,  // Default: 2.0 (2x volume vs OI)
    min_volume: 500          // Default: 500 contracts
  })
})

const data = await response.json()
```

#### Response

```json
{
  "success": true,
  "timestamp": "2025-10-24T10:00:00Z",
  "signals": {
    "COIN": {
      "symbol": "COIN",
      "current_price": 350.75,
      "expiration": "2025-10-24",
      "call_signals": [
        {
          "type": "call",
          "strike": 345,
          "volume": 7581,
          "oi": 2171,
          "vol_oi_ratio": 3.49,
          "is_atm": true,
          "premium": 3.75
        }
      ],
      "put_signals": [],
      "bias": "bullish",
      "total_unusual_volume": 21919
    }
  },
  "symbols_scanned": 3,
  "signals_found": 1
}
```

#### What to Look For

- **vol_oi_ratio ≥ 3.0** - Very strong signal (high conviction)
- **is_atm: true** - ATM strikes show highest conviction
- **bias: "bullish"** - More call volume than put volume
- **High total_unusual_volume** - Institutional-size positioning

#### Real Example

COIN on 10/23 (day before JP Morgan upgrade):
- $345 calls: **3.49x vol/OI** (7,581 vol / 2,171 OI)
- ATM strike, bullish bias
- Next day: **+$25 (8%)** 🎯

---

### 2. Morning Brief (10:00 AM ET)

**Endpoint:** `/api/analyst/morning-brief`

**Purpose:** Market open intelligence with fresh price action to guide your trading day

**Methods:** `GET` (default watchlist) | `POST` (custom symbols + portfolio)

#### POST Request

```typescript
const response = await fetch('/api/analyst/morning-brief', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbols: ['AAPL', 'TSLA', 'NVDA', 'COIN'],
    user_portfolio: {  // Optional
      open_positions: [
        {
          symbol: 'AAPL',
          expiration: '2025-10-25',
          strike: 230,
          option_type: 'call'
        }
      ]
    }
  })
})

const data = await response.json()
```

#### Response

```json
{
  "success": true,
  "timestamp": "2025-10-24T07:00:00Z",
  "brief": {
    "timestamp": "2025-10-24T07:00:00",
    "uoa_signals": {
      "COIN": { /* UOA data */ }
    },
    "earnings_today": ["TSLA", "GOOGL"],
    "premarket_movers": {
      "COIN": {
        "gap_pct": 3.8,
        "gap_direction": "up",
        "premarket_price": 335,
        "previous_close": 322.76
      }
    },
    "watchlist": ["COIN", "TSLA", "AAPL"],
    "portfolio_alerts": [
      {
        "symbol": "AAPL",
        "alert_type": "expiration",
        "message": "AAPL expires in 1 day(s)",
        "urgency": "medium"
      }
    ],
    "market_conditions": {
      "SPY": {
        "price": 580.5,
        "ma20": 578.2,
        "trend": "bullish"
      }
    }
  },
  "formatted_text": "============================================================\n🌅 MORNING BRIEF\n..."
}
```

#### What You Get

1. **UOA Signals** - Smart money positioning from yesterday
2. **Earnings Today** - Stocks reporting earnings
3. **Pre-market Movers** - Gaps > 2%
4. **Watchlist** - Combined top opportunities
5. **Portfolio Alerts** - Expirations, UOA on your holdings
6. **Market Conditions** - SPY/QQQ trend

---

### 3. Market Open Update (9:35 AM)

**Endpoint:** `/api/analyst/market-open-update`

**Purpose:** Momentum confirmation + entry strategies

**Methods:** `GET` (test mode) | `POST` (watchlist from morning brief)

#### POST Request

```typescript
const response = await fetch('/api/analyst/market-open-update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    watchlist: ['COIN', 'TSLA', 'NVDA'],
    morning_brief_data: { /* optional context */ }
  })
})

const data = await response.json()
```

#### Response

```json
{
  "success": true,
  "timestamp": "2025-10-24T09:35:00Z",
  "update": {
    "movers": {
      "COIN": {
        "gap_pct": 3.8,
        "intraday_move_pct": 3.2,
        "total_move_pct": 7.0,
        "is_catchable": true,
        "confidence": "HIGH",
        "analysis": {
          "score": 85,
          "reasons": [
            "Strong volume (4.2x)",
            "Gap holding",
            "Strong uptrend"
          ],
          "open_price": 335,
          "current_price": 345,
          "vwap": 338.5,
          "volume_ratio": 4.2,
          "entry_strategy": [
            "Wait for dip to $337.80 (near VWAP)",
            "OR buy breakout above $346.00",
            "Stop Loss: $325.00 (gap fill)"
          ]
        }
      }
    },
    "entry_signals": [
      {
        "symbol": "COIN",
        "confidence": "HIGH",
        "current_price": 345,
        "entry_strategy": [...],
        "reasons": [...]
      }
    ],
    "avoid_list": ["TSLA"]
  },
  "formatted_text": "..."
}
```

#### Momentum Scoring

**Catchable (score ≥ 50):**
- Volume ≥ 1.5x average (confirmation)
- Gap holding (no fill)
- Higher highs (trending up)
- Moderate volatility (smooth move)

**Confidence Levels:**
- **HIGH (score ≥ 70)** - High probability entry
- **MEDIUM (score ≥ 50)** - Moderate probability
- **LOW (score < 50)** - Too risky, avoid

---

### 4. Nightly Brief (8:00 PM)

**Endpoint:** `/api/analyst/nightly-brief`

**Purpose:** Tomorrow's battle plan

**Methods:** `GET` (default watchlist) | `POST` (custom symbols + portfolio)

#### POST Request

```typescript
const response = await fetch('/api/analyst/nightly-brief', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbols: ['AAPL', 'TSLA', 'NVDA'],
    user_portfolio: {
      total_capital: 10000,
      open_positions: [...]
    }
  })
})

const data = await response.json()
```

#### Response

```json
{
  "success": true,
  "timestamp": "2025-10-24T20:00:00Z",
  "brief": {
    "tomorrows_watchlist": [
      {
        "symbol": "COIN",
        "reason": "UOA",
        "bias": "bullish",
        "current_price": 350.75,
        "key_level": 355,
        "setup": "Watch for continuation",
        "uoa_details": {
          "top_strike": 345,
          "vol_oi_ratio": 3.49,
          "type": "call"
        }
      }
    ],
    "earnings_tomorrow": [
      {
        "symbol": "TSLA",
        "current_price": 350,
        "ma20": 345,
        "trend": "bullish"
      }
    ],
    "market_levels": {
      "SPY": {
        "current_price": 580,
        "support": 575,
        "resistance": 585,
        "trend": "bullish"
      }
    },
    "portfolio_summary": {
      "total_positions": 3,
      "total_capital_at_risk": 2400,
      "risk_exposure_pct": 24,
      "expiring_soon": [...]
    },
    "key_setups": [
      {
        "symbol": "COIN",
        "conviction": "HIGH",
        "setup": "Watch for continuation",
        "bias": "bullish",
        "reason": "Strong UOA (3.5x vol/OI)"
      }
    ]
  },
  "formatted_text": "..."
}
```

#### What You Get

1. **Tomorrow's Watchlist** - UOA + Earnings + Key setups
2. **Key Setups** - Highest conviction plays
3. **Market Levels** - Support/resistance for SPY/QQQ
4. **Portfolio Check** - Expirations, risk exposure
5. **Actionable Plans** - What to watch, what to do

---

### 5. Weekly Analysis (Saturday)

**Endpoint:** `/api/analyst/weekly-analysis`

**Purpose:** Learn from this week's trades + identify patterns

**Methods:** `GET` (demo mode) | `POST` (real user data)

#### POST Request

```typescript
const response = await fetch('/api/analyst/weekly-analysis', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'user_123',  // Fetches positions from DB
    lookback_days: 7,
    // OR provide data directly:
    closed_positions: [...],
    uoa_history: [...]
  })
})

const data = await response.json()
```

#### Response

```json
{
  "success": true,
  "timestamp": "2025-10-25T10:00:00Z",
  "analysis": {
    "week_ending": "2025-10-25",
    "portfolio_performance": {
      "total_trades": 12,
      "winners": 8,
      "losers": 4,
      "win_rate": 66.7,
      "avg_return": 15.2,
      "total_pl": 1850,
      "best_trade": {
        "symbol": "COIN",
        "realized_pl": 750,
        "realized_pl_percent": 125
      },
      "holding_period_analysis": {
        "same_day": {
          "total": 5,
          "win_rate": 80,
          "avg_return": 25.5
        },
        "1-2_days": {
          "total": 7,
          "win_rate": 57.1,
          "avg_return": 10.2
        }
      },
      "option_type_analysis": {
        "calls": {
          "total": 9,
          "win_rate": 77.8
        },
        "puts": {
          "total": 3,
          "win_rate": 33.3
        }
      }
    },
    "uoa_performance": {
      "total_signals": 15,
      "successful": 11,
      "success_rate": 73.3,
      "avg_move_pct": 4.2,
      "best_performers": [
        {
          "symbol": "COIN",
          "bias": "bullish",
          "move_pct": 8.0,
          "vol_oi_ratio": 3.49
        }
      ],
      "patterns": {
        "high_ratio": {
          "total": 5,
          "successful": 5,
          "success_rate": 100
        }
      }
    },
    "learnings": [
      {
        "type": "success",
        "category": "Win Rate",
        "insight": "Strong win rate (66.7%)",
        "action": "Keep doing what you're doing. Consider scaling position sizes."
      },
      {
        "type": "insight",
        "category": "Holding Period",
        "insight": "Best performance with same day holds (80.0% win rate)",
        "action": "Favor same day holding periods in your strategy."
      },
      {
        "type": "success",
        "category": "UOA Scanner",
        "insight": "UOA signals showing 73.3% success rate",
        "action": "Trust the UOA scanner - it's working. Act quickly on signals."
      }
    ],
    "next_week_plan": [
      "Continue current strategy - it's working",
      "Act faster on UOA signals - they're reliable"
    ]
  },
  "formatted_text": "..."
}
```

#### What You Learn

1. **Win Rate Analysis** - Overall + by holding period + by option type
2. **Best/Worst Trades** - Learn from both
3. **UOA Effectiveness** - Did the signals work?
4. **Pattern Recognition** - High ratio signals, ATM plays
5. **Actionable Insights** - What to do differently next week

---

## Frontend Integration Examples

### Example 1: Morning Brief Dashboard

```typescript
'use client'

import { useState, useEffect } from 'react'

export default function MorningBriefWidget() {
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchBrief() {
      const response = await fetch('/api/analyst/morning-brief')
      const data = await response.json()

      if (data.success) {
        setBrief(data.brief)
      }
      setLoading(false)
    }

    fetchBrief()
  }, [])

  if (loading) return <div>Loading morning brief...</div>

  return (
    <div className="morning-brief">
      <h2>🌅 Morning Brief</h2>

      {/* UOA Signals */}
      <section>
        <h3>🔥 Unusual Options Activity</h3>
        {Object.entries(brief.uoa_signals).map(([symbol, data]) => (
          <div key={symbol} className="uoa-card">
            <h4>{symbol} - {data.bias.toUpperCase()}</h4>
            <p>Total Volume: {data.total_unusual_volume.toLocaleString()}</p>

            {data.call_signals.length > 0 && (
              <div>
                <strong>Top Call:</strong> $
                {data.call_signals[0].strike} (
                {data.call_signals[0].vol_oi_ratio.toFixed(1)}x vol/OI)
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Watchlist */}
      <section>
        <h3>🎯 Today's Watchlist</h3>
        <ul>
          {brief.watchlist.map(symbol => (
            <li key={symbol}>{symbol}</li>
          ))}
        </ul>
      </section>

      {/* Portfolio Alerts */}
      {brief.portfolio_alerts.length > 0 && (
        <section className="alerts">
          <h3>⚠️ Portfolio Alerts</h3>
          {brief.portfolio_alerts.map((alert, i) => (
            <div key={i} className={`alert ${alert.urgency}`}>
              {alert.message}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
```

### Example 2: Real-time UOA Scanner

```typescript
async function scanForUOA(symbols: string[]) {
  const response = await fetch('/api/scan-uoa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols,
      min_vol_oi_ratio: 3.0  // Only high-conviction signals
    })
  })

  const data = await response.json()

  if (data.success) {
    // Filter for ATM signals only
    const atmSignals = Object.entries(data.signals)
      .filter(([_, signal]) => {
        const hasATMCalls = signal.call_signals.some(s => s.is_atm)
        const hasATMPuts = signal.put_signals.some(s => s.is_atm)
        return hasATMCalls || hasATMPuts
      })

    // Sort by vol/OI ratio
    atmSignals.sort((a, b) => {
      const aMaxRatio = Math.max(
        ...a[1].call_signals.map(s => s.vol_oi_ratio),
        ...a[1].put_signals.map(s => s.vol_oi_ratio)
      )
      const bMaxRatio = Math.max(
        ...b[1].call_signals.map(s => s.vol_oi_ratio),
        ...b[1].put_signals.map(s => s.vol_oi_ratio)
      )
      return bMaxRatio - aMaxRatio
    })

    return atmSignals
  }
}
```

### Example 3: Market Open Entry Confirmation

```typescript
async function checkEntryOpportunity(watchlist: string[]) {
  const response = await fetch('/api/analyst/market-open-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watchlist })
  })

  const data = await response.json()

  if (data.success) {
    // Get HIGH confidence entries only
    const highConfidenceEntries = data.update.entry_signals
      .filter(signal => signal.confidence === 'HIGH')

    for (const entry of highConfidenceEntries) {
      console.log(`\n🟢 ${entry.symbol} - HIGH CONFIDENCE`)
      console.log(`Current: $${entry.current_price}`)
      console.log(`Strategy:`)
      entry.entry_strategy.forEach(step => console.log(`  ${step}`))
    }

    return highConfidenceEntries
  }
}
```

---

## Scheduling / Automation

### Option 1: Frontend Polling (Simple)

```typescript
// Run morning brief at 10:00 AM local time
useEffect(() => {
  function scheduleCheck() {
    const now = new Date()
    const target = new Date()
    target.setHours(10, 0, 0, 0)

    if (now > target) {
      target.setDate(target.getDate() + 1)
    }

    const delay = target.getTime() - now.getTime()

    setTimeout(async () => {
      const response = await fetch('/api/analyst/morning-brief')
      const data = await response.json()
      // Show notification, update UI, etc.

      scheduleCheck() // Schedule next day
    }, delay)
  }

  scheduleCheck()
}, [])
```

### Option 2: Vercel Cron Jobs (Recommended)

Create `/api/cron/morning-brief/route.ts`:

```typescript
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Generate brief
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/analyst/morning-brief`)
  const data = await response.json()

  // Send email/push notification to users
  // (integrate with SendGrid, Resend, etc.)

  return NextResponse.json({ success: true })
}
```

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/morning-brief",
      "schedule": "0 11 * * *"
    },
    {
      "path": "/api/cron/market-open-update",
      "schedule": "35 13 * * 1-5"
    },
    {
      "path": "/api/cron/nightly-brief",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/cron/weekly-analysis",
      "schedule": "0 14 * * 6"
    }
  ]
}
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "details": "Additional context",
  "market_closed": true  // For market-hours-only endpoints
}
```

Check for market hours:

```typescript
const response = await fetch('/api/analyst/market-open-update', ...)
const data = await response.json()

if (data.market_closed) {
  // Show "Market closed" message
  // Disable entry signals UI
}
```

---

## Performance Notes

- **Morning Brief:** ~30-60 seconds (scans UOA + earnings + gaps)
- **Market Open Update:** ~20-40 seconds (analyzes intraday momentum)
- **UOA Scanner:** ~10-20 seconds (per 10 symbols)
- **Nightly Brief:** ~30-60 seconds
- **Weekly Analysis:** ~20-40 seconds

All endpoints have generous timeouts (120-240 seconds) to handle yfinance API delays.

---

## Next Steps

1. **Email Integration** - Send briefs via email (Resend, SendGrid)
2. **Push Notifications** - Real-time alerts for UOA signals
3. **SMS Alerts** - Text high-confidence entry signals (Twilio)
4. **Slack/Discord** - Post briefs to trading channels
5. **UOA History Tracking** - Store UOA signals in database for weekly analysis

Happy trading! 🚀
