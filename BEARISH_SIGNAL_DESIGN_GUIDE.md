# Bearish Signal Display Design Guide

## Executive Summary

The bearish signal detection framework is already displaying signals via the **DropRiskRadar** component in the Portfolio page. This guide outlines:

1. **Current Implementation**: Existing DropRiskRadar component
2. **Design Patterns to Follow**: When extending bearish signal displays
3. **Integration Points**: Where bearish signals appear in the UI
4. **Implementation Best Practices**: How to maintain consistency

## 1. Current Bearish Signal Display

### Location
**Page**: `/portfolio` (Portfolio Management)  
**Component**: `DropRiskRadar` (`/components/drop-risk-radar.tsx`)  
**Database**: `drop_risk_signals` table in Supabase

### Key Characteristics

#### Visual Design
- **Card-based layout** with vertical stacking
- **Color-coded alert levels**:
  - Watch: Slate colors
  - Elevated: Amber colors  
  - High: Orange colors
  - Extreme: Red colors
- **Score badge on right side** showing numeric risk (0-100+)
- **Portfolio items highlighted** with orange glow effect
- **Watchlist items tagged** with blue badges

#### Information Hierarchy
```
┌─ Header Section ─────────────────────────────────┐
│  [ICON] Title "Potential Drop Setups"            │
│  Subtitle explaining composite scoring           │
│  [Refresh Button]    [Update timestamp]          │
├─ Signal Cards (Vertical Stack) ──────────────────┤
│ ┌─ Card Per Symbol ────────────────────────────┐ │
│ │ Symbol [TAG] [ALERT LEVEL]                   │ │
│ │ Confidence XX% | Δ Score ±X.X | Price move  │ │
│ │ • Driver reason 1                             │ │
│ │ • Driver reason 2                             │ │
│ │ • Driver reason 3                       [SCORE]│ │
│ │                                        $XXX.XX │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

#### Features
- **Refresh Capability**: Manual refresh button
- **Filtering**: Auto-filters to portfolio/watchlist symbols
- **Loading States**: Skeleton cards during load
- **Empty States**: Clear message when no signals
- **Error Handling**: Graceful error display with retry information

### Type Definition
```typescript
// From /lib/types/drop-alert.ts
export interface DropRiskSignal {
  id: string
  symbol: string
  score: number              // 0-100+ composite score
  biasScore: number
  confidence: number         // 0-100%
  stockPrice: number | null
  priceChangePct: number | null
  alertLevel: DropRiskAlertLevel  // 'watch' | 'elevated' | 'high' | 'extreme'
  scoreChange: number | null
  generatedAt: string
  drivers: string[]          // Array of reason strings
  signalDetails: Record<string, unknown>
}
```

## 2. Design Patterns to Follow

### Pattern 1: Alert Level Color Coding

```typescript
const alertStyles: Record<DropRiskAlertLevel, {
  badge: string      // Badge styling
  border: string     // Card border color
  glow: string       // Shadow effect
  text: string       // Text color
}> = {
  watch: {
    badge: 'bg-slate-500/15 text-slate-200 border-slate-400/40',
    border: 'border-slate-400/30',
    glow: 'shadow-[0_10px_30px_rgba(148,163,184,0.15)]',
    text: 'text-slate-200',
  },
  elevated: {
    badge: 'bg-amber-500/15 text-amber-200 border-amber-400/40',
    border: 'border-amber-400/40',
    glow: 'shadow-[0_15px_45px_rgba(217,119,6,0.2)]',
    text: 'text-amber-100',
  },
  high: {
    badge: 'bg-orange-500/15 text-orange-200 border-orange-400/40',
    border: 'border-orange-400/40',
    glow: 'shadow-[0_15px_45px_rgba(249,115,22,0.25)]',
    text: 'text-orange-100',
  },
  extreme: {
    badge: 'bg-red-500/15 text-red-200 border-red-400/40',
    border: 'border-red-400/40',
    glow: 'shadow-[0_18px_55px_rgba(248,113,113,0.28)]',
    text: 'text-red-100',
  },
}
```

### Pattern 2: Score Visualization

```typescript
// Score determines gradient color
const scoreColor = (score: number) => {
  if (score >= 80) return 'from-red-500/90 via-red-400/70 to-red-500/40'
  if (score >= 65) return 'from-orange-500/90 via-orange-400/70 to-orange-500/40'
  if (score >= 50) return 'from-amber-500/90 via-amber-400/70 to-amber-500/40'
  return 'from-slate-500/80 via-slate-400/60 to-slate-500/40'
}

// Display as large badge with gradient
<div className={`rounded-2xl border bg-gradient-to-br ${scoreBadge} 
               px-6 py-4 text-white shadow-lg`}>
  <div className="text-xs uppercase tracking-[0.3em]">Drop Risk</div>
  <div className="text-3xl font-semibold">{score.toFixed(1)}</div>
</div>
```

### Pattern 3: Context-Aware Tagging

```typescript
// Tag portfolio vs watchlist items differently
const tag = symbolTags?.[signal.symbol.toUpperCase()]
const isPortfolio = tag === 'portfolio'

<span className={`rounded-full border px-2 py-0.5 text-xs font-semibold 
    uppercase tracking-wider ${
      isPortfolio
        ? 'bg-orange-500/20 text-orange-700 border-orange-400/50'
        : 'bg-blue-500/20 text-blue-700 border-blue-400/50'
    }`}>
  {tag}
</span>

// Apply special styling to portfolio items
{isPortfolio && (
  <div className="border-orange-500/60 shadow-[0_0_20px_rgba(249,115,22,0.3)]" />
)}
```

### Pattern 4: Driver/Reason Display

```typescript
// List out factor explanations
{signal.drivers.length > 0 && (
  <ul className="mt-4 space-y-2 text-sm text-slate-700">
    {signal.drivers.map((driver, idx) => (
      <li key={idx} className="flex gap-2">
        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
        <span>{driver}</span>
      </li>
    ))}
  </ul>
)}
```

### Pattern 5: Dynamic Headers with Context

```typescript
// Header subtitle changes based on state
const headerSubtitle = useMemo(() => {
  if (loading) return 'Scanning skew, flow, regime, and sentiment stacks...'
  if (error) return 'We could not refresh the bearish radar. Try again shortly.'
  if (!signals.length) return 'No elevated drop setups detected right now.'
  return 'Composite bearish score across options skew, smart flow, regime, and sentiment.'
}, [loading, error, signals.length])
```

## 3. Integration Points for Bearish Signals

### Current Integration
1. **Portfolio Page** (`/portfolio`)
   - Component: `DropRiskRadar`
   - Position: Below open positions list
   - Purpose: Monitor bearish risks in held positions
   - Filtering: Auto-filters to portfolio and watchlist symbols

### Possible Additional Integration Points

#### A. Dashboard Widget
Add a "Bearish Alerts" card to the main dashboard:
```typescript
// /app/dashboard-page.tsx
<DropRiskRadar
  limit={3}
  minScore={60}
  filterSymbols={watchedSymbols}
/>
```

#### B. Scanner Results Enhancement
Show bearish signals alongside bullish opportunities:
```typescript
// /app/scanner-page.tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
  <div>
    <h2>Bullish Opportunities</h2>
    {/* OpportunityCard components */}
  </div>
  <div>
    <h2>Bearish Signals</h2>
    <DropRiskRadar limit={5} />
  </div>
</div>
```

#### C. Market Movers Section
Create a new "Bearish Radar" page under Market Movers:
```typescript
// /app/bearish-radar/page.tsx
// Full-page view with detailed bearish signal analysis
```

#### D. Alert Dashboard
Add to a potential alerts/watchlist dashboard:
```typescript
// Monitor symbols that have elevated bearish signals
<DropRiskRadar limit={20} filterSymbols={userWatchlist} />
```

## 4. API Design

### Get Drop Risk Signals
```http
GET /api/drop-risk?limit=20&minScore=45

Response: {
  success: true
  count: 5
  generatedAt: "2025-11-07T14:30:00Z"
  data: DropRiskSignal[]
}
```

### Query Parameters
- `limit`: Maximum number of signals (default: 5, max: 20)
- `minScore`: Minimum drop risk score to return (default: 0)

### Database Query Pattern
```typescript
// From /app/api/drop-risk/route.ts
const { data, error } = await supabase
  .from('drop_risk_signals')
  .select('id, symbol, drop_risk_score, alert_level, drivers, ...')
  .order('generated_at', { ascending: false })
  .limit(fetchSize)

// Post-process to filter and transform
const transformed: DropRiskSignal[] = data
  .filter(row => !seen.has(row.symbol) && row.drop_risk_score >= minScore)
  .map(row => ({...transform row...}))
```

## 5. Implementation Best Practices

### When Adding New Bearish Signal Displays:

1. **Always Use Alert Levels**
   - Map signal strength to watch/elevated/high/extreme
   - Use consistent color mapping

2. **Show Score + Confidence**
   - Display numeric risk score (0-100+)
   - Include confidence percentage
   - Show confidence intervals if available

3. **Explain the Signal**
   - Include drivers/factors list
   - Use clear, trader-friendly language
   - Link to more detailed analysis

4. **Provide Context**
   - Show stock price and daily change
   - Include alert level changes
   - Indicate portfolio vs watchlist items

5. **Enable Action**
   - Provide refresh capability
   - Allow filtering by alert level
   - Support sorting by score, confidence, or symbol

6. **Handle States Properly**
   - Loading: Show skeleton cards
   - Empty: Clear message explaining why no signals
   - Error: Actionable error message with retry

7. **Maintain Dark Mode**
   - All color choices should work in dark theme
   - Use `dark:` prefix for dark-mode variants
   - Test with eye comfort in mind

8. **Follow Spacing & Typography**
   - Use Tailwind spacing scale (gap-2, p-4, etc.)
   - Use font sizes: xs (10px), sm (14px), base (16px), lg (18px)
   - Maintain consistent tracking (letter-spacing)

## 6. Component Composition Example

```typescript
'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RefreshCcw } from 'lucide-react'
import type { DropRiskSignal, DropRiskAlertLevel } from '@/lib/types/drop-alert'

interface DropRiskRadarProps {
  limit?: number
  minScore?: number
  filterSymbols?: string[]
  symbolTags?: Record<string, 'portfolio' | 'watchlist'>
}

export function DropRiskRadar({ 
  limit = 5, 
  minScore = 45, 
  filterSymbols, 
  symbolTags 
}: DropRiskRadarProps) {
  const [signals, setSignals] = useState<DropRiskSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 1. Fetch data
  const fetchSignals = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (minScore > 0) params.set('minScore', String(minScore))
    
    const response = await fetch(`/api/drop-risk?${params}`)
    return response.json()
  }, [limit, minScore])

  // 2. Process and filter data
  const applyPayload = useCallback((payload) => {
    if (payload.success && payload.data) {
      let filteredData = payload.data
      if (filterSymbols?.length > 0) {
        const symbolSet = new Set(filterSymbols.map(s => s.toUpperCase()))
        filteredData = payload.data.filter(s => symbolSet.has(s.symbol))
      }
      setSignals(filteredData)
    } else {
      setError(payload.error ?? 'Unable to load signals')
    }
  }, [filterSymbols])

  // 3. Load on mount
  useEffect(() => {
    const run = async () => {
      try {
        const payload = await fetchSignals()
        applyPayload(payload)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [applyPayload, fetchSignals])

  // 4. Render UI
  return (
    <div className="rounded-2xl border bg-white p-6 dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Potential Drop Setups</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {loading ? 'Scanning...' : `${signals.length} signals detected`}
          </p>
        </div>
        <button onClick={() => fetchSignals()}>
          <RefreshCcw className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {loading && <LoadingSkeleton />}
        {error && <ErrorCard message={error} />}
        {!loading && signals.length === 0 && <EmptyState />}
        {signals.map(signal => <SignalCard key={signal.id} signal={signal} />)}
      </div>
    </div>
  )
}
```

## 7. File Paths Summary

### Key Files to Reference

| File | Purpose |
|------|---------|
| `/components/drop-risk-radar.tsx` | Main bearish signal component |
| `/lib/types/drop-alert.ts` | Type definitions for drop alerts |
| `/app/api/drop-risk/route.ts` | API endpoint for bearish signals |
| `/supabase/migrations/20251102_add_drop_risk_signals.sql` | Database schema |
| `/app/portfolio/portfolio-client.tsx` | Integration example |

### Files to Create/Modify for Extensions

- Create `/app/bearish-radar/page.tsx` for dedicated page
- Modify `/app/dashboard-page.tsx` to add widget
- Modify `/app/scanner-page.tsx` to add comparison view
- Create custom hook `/lib/hooks/useDropRiskSignals.ts` for reusability

