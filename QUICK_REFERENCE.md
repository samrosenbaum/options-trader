# Quick Reference: Bearish Signal UI/UX

## Absolute File Paths

### Core Bearish Signal Files
- `/home/user/options-trader/components/drop-risk-radar.tsx` - Main bearish signal component
- `/home/user/options-trader/lib/types/drop-alert.ts` - Type definitions
- `/home/user/options-trader/app/api/drop-risk/route.ts` - API endpoint
- `/home/user/options-trader/supabase/migrations/20251102_add_drop_risk_signals.sql` - Database schema

### Current Integration
- `/home/user/options-trader/app/portfolio/portfolio-client.tsx` - Uses DropRiskRadar (line ~1450)

### Related Components
- `/home/user/options-trader/components/signal-tape.tsx` - Sentiment signals display
- `/home/user/options-trader/components/opportunity-card.tsx` - Bullish opportunity display (reference for patterns)
- `/home/user/options-trader/components/position-alerts.tsx` - Alert component pattern

### Key Pages
- `/home/user/options-trader/app/dashboard-page.tsx` - Dashboard (line 1-200)
- `/home/user/options-trader/app/scanner-page.tsx` - Scanner page (line 1-250)
- `/home/user/options-trader/app/portfolio/page.tsx` - Portfolio route wrapper
- `/home/user/options-trader/app/sentiments/page.tsx` - Sentiment page (reference for gradient patterns)

### Context & Providers
- `/home/user/options-trader/app/providers.tsx` - Root context setup
- `/home/user/options-trader/contexts/scan-context.tsx` - Scanner state
- `/home/user/options-trader/contexts/monty-chat-context.tsx` - AI assistant context

### UI Components (Radix-based)
- `/home/user/options-trader/components/ui/badge.tsx`
- `/home/user/options-trader/components/ui/button.tsx`
- `/home/user/options-trader/components/ui/card.tsx`
- `/home/user/options-trader/components/ui/tooltip.tsx`

### Layout & Navigation
- `/home/user/options-trader/app/layout.tsx` - Root layout
- `/home/user/options-trader/components/navigation.tsx` - Main navigation bar
- `/home/user/options-trader/app/globals.css` - Global styles

## Color Values Quick Lookup

### Bearish Signal Alert Levels
```
Watch:    slate-500, slate-400
Elevated: amber-500, amber-400
High:     orange-500, orange-400
Extreme:  red-500, red-400
```

### Common Gradients
```
Bullish:  from-emerald-500 to-green-500
Bearish:  from-red-500 to-orange-500
Neutral:  from-slate-500 to-slate-400
```

### Icons Used
- AlertTriangle - Bearish signals
- TrendingDown - Downward moves
- TrendingUp - Upward moves
- RefreshCcw - Refresh button
- ArrowDown - Price decrease
- ChevronDown - Dropdown indicators

## Component Props Reference

### DropRiskRadar
```typescript
<DropRiskRadar
  limit={5}                           // Max signals (default: 5, max: 20)
  minScore={45}                       // Min score threshold (default: 45)
  filterSymbols={['AAPL', 'TSLA']}   // Only show these symbols
  symbolTags={{
    AAPL: 'portfolio',
    TSLA: 'watchlist'
  }}
/>
```

### SignalTape
```typescript
<SignalTape />  // No props - fetches from /api/sentiment-signals
```

## API Quick Reference

### Drop Risk Signals
```
GET /api/drop-risk?limit=20&minScore=50

Returns:
{
  success: boolean
  count: number
  generatedAt: string
  data: DropRiskSignal[]
  error?: string
}
```

### Sentiment Signals
```
GET /api/sentiment-signals

Returns:
{
  success: boolean
  signals: Array<{
    id: string
    label: string
    detail: string
    time: string
    direction: 'bullish' | 'bearish'
  }>
}
```

## Database Reference

### Drop Risk Signals Table
```sql
TABLE: drop_risk_signals

KEY COLUMNS:
- symbol TEXT                  -- Stock ticker
- drop_risk_score NUMERIC      -- 0-100+ score
- alert_level TEXT             -- watch/elevated/high/extreme
- confidence NUMERIC           -- 0-100%
- drivers JSONB                -- Reasons array
- signal_details JSONB         -- Component breakdown
- price_change_pct NUMERIC     -- Daily % change
- stock_price NUMERIC          -- Current stock price
- generated_at TIMESTAMPTZ     -- Signal creation time

INDEXES:
- drop_risk_signals_symbol_idx
- drop_risk_signals_generated_at_idx
```

## CSS Classes Commonly Used

### Typography
- `text-xs` - 10px (labels, tiny text)
- `text-sm` - 14px (body copy, descriptions)
- `text-base` - 16px (default)
- `text-lg` - 18px (card titles)
- `text-xl` - 20px (section titles)
- `text-2xl` - 24px (page titles)
- `text-3xl` - 30px (large scores/numbers)

### Spacing
- `gap-2` - 8px
- `gap-3` - 12px
- `gap-4` - 16px
- `p-4` - 16px padding
- `p-6` - 24px padding
- `mt-4` - 16px margin-top
- `mb-8` - 32px margin-bottom

### Borders & Shadows
- `rounded-xl` - 8px border radius
- `rounded-2xl` - 12px border radius
- `rounded-3xl` - 16px border radius
- `border` - 1px solid
- `shadow-lg` - Large shadow
- `shadow-xl` - Extra large shadow

### Dark Mode
- `dark:bg-slate-950` - Dark background
- `dark:text-white` - Dark text
- `dark:border-white/10` - Dark borders with opacity

## State Management

### Loading State
```typescript
{loading && (
  <div className="space-y-3">
    {Array.from({ length: 3 }).map((_, idx) => (
      <div key={idx} className="animate-pulse rounded-2xl 
           bg-slate-100 h-24" />
    ))}
  </div>
)}
```

### Empty State
```typescript
{!loading && signals.length === 0 && (
  <div className="rounded-2xl border border-emerald-300 
       bg-emerald-50 p-4 text-emerald-800">
    All clear for now — none of the tracked names show elevated downside risk.
  </div>
)}
```

### Error State
```typescript
{error && (
  <div className="rounded-2xl border border-red-300 
       bg-red-50 p-4 text-red-800">
    {error}
  </div>
)}
```

## Next.js / React Patterns Used

### Hooks
- `useState()` - State management
- `useEffect()` - Side effects, data fetching
- `useCallback()` - Memoize functions
- `useRef()` - Direct DOM access (rare)
- `useMemo()` - Compute expensive values

### Client Components
```typescript
'use client'  // Enable client-side features
```

### Data Fetching
```typescript
const response = await fetch('/api/drop-risk')
const data = await response.json()
```

### Conditional Rendering
```typescript
{condition && <Component />}
{condition ? <ComponentA /> : <ComponentB />}
```

### Event Handlers
```typescript
onClick={() => refreshSignals()}
disabled={loading}
className={loading ? 'opacity-50' : ''}
```

## Performance Considerations

1. **Memoization**: Use `useCallback()` for expensive functions
2. **Conditional Rendering**: Only render visible components
3. **Loading States**: Show skeletons instead of spinners
4. **Caching**: Data refresh controlled by buttons, not intervals
5. **Image Optimization**: Use Next.js Image component
6. **Code Splitting**: Components lazy-loaded at route level

## Dark Mode Testing

Test with:
```html
<html lang="en" className="dark">
```

All components include `dark:` prefixed classes for dark theme.

## Useful Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Lint code
npm run lint

# View types for Supabase
# Check /lib/types/database.types.ts
```

## Quick Debugging

### Check API Response
```typescript
const response = await fetch('/api/drop-risk?limit=5')
const data = await response.json()
console.log('Drop Risk Data:', data)
```

### Check Component Props
```typescript
useEffect(() => {
  console.log('Current Props:', { limit, minScore, filterSymbols })
}, [limit, minScore, filterSymbols])
```

### Check State
```typescript
useEffect(() => {
  console.log('Signals:', signals)
  console.log('Loading:', loading)
  console.log('Error:', error)
}, [signals, loading, error])
```

## File Size Notes
- `opportunity-card.tsx`: 130KB (very complex - use as reference only)
- `scanner-page.tsx`: 198KB (large page component)
- `portfolio-client.tsx`: Large but modular

Most other components are 5-15KB.
