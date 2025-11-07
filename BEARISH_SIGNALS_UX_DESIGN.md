# Bearish Signals UX Design
## Thoughtful Integration Guide

This document outlines how the new bearish signal detection (unusual options activity) will be displayed throughout the app, building on the existing DropRiskRadar component.

---

## 🎯 Design Philosophy

### Core Principles

1. **Actionable, Not Just Informational**
   - Users should know WHAT to do, not just WHAT is happening
   - Every signal includes recommended strikes and position sizes
   - Clear entry/exit criteria

2. **Progressive Disclosure**
   - Quick scan → Signal card → Detailed analysis → Trade execution
   - Don't overwhelm with data upfront
   - Expand on demand for power users

3. **Visual Hierarchy**
   - Score/alert level most prominent (decision driver)
   - Supporting data secondary (validation)
   - Technical details tertiary (for analysis)

4. **Confidence Communication**
   - Always show confidence level and signal strength
   - Distinguish between "watch" and "act now" signals
   - Explain WHY the system is recommending this

---

## 📍 Integration Points

### 1. Scanner Page - Main Discovery View

**Location**: `/app/scanner/page.tsx`

**Purpose**: Primary location for discovering new bearish opportunities across all 120+ symbols

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 Options Scanner                                         │
│  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Bullish (45)    │  │ Bearish (12) 🔴│  [Filters ▼]    │
│  └─────────────────┘  └─────────────────┘                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🚨 HIGH CONFIDENCE BEARISH SETUPS (Score ≥ 12)             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐│
│  │ HOOD                                   [⭐ Add to Watch]││
│  │ 🔴 EXTREME • Score 28/27               Confidence 94%   ││
│  │                                                          ││
│  │ ┌─────────────────┐  ┌──────────────────────────────┐ ││
│  │ │  BEARISH SCORE  │  │ 💡 RECOMMENDED ACTION        │ ││
│  │ │      28         │  │                               │ ││
│  │ │   out of 27     │  │ BUY: $35 Put @ $1.50         │ ││
│  │ │                 │  │ Exp: Dec 15 (7 days)         │ ││
│  │ │ [View Details]  │  │ Expected ROI: 120-180%       │ ││
│  │ └─────────────────┘  │                               │ ││
│  │                      │ Position: 2-3% portfolio      │ ││
│  │  🔹 P/C Ratio: 2.04  │                               │ ││
│  │  🔹 Vol/OI: 3.11x    │ [📊 Analyze] [🛒 Trade Now]  │ ││
│  │  🔹 Premium: $525k   │                               │ ││
│  │  🔹 IV Skew: 25pts   │                               │ ││
│  │  🔹 Time: 87% near   └──────────────────────────────┘ ││
│  │                                                          ││
│  │  Last updated: 2:45 PM • Next scan: 3:00 PM             ││
│  └────────────────────────────────────────────────────────┘│
│                                                              │
│  ⚠️ MODERATE BEARISH SETUPS (Score 8-11)                   │
│  [Show 8 more signals...]                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Component Structure

```tsx
<BearishSignalsScanner>
  <TabNavigation>
    <Tab active>Bearish Signals ({count})</Tab>
    <Tab>Bullish Signals</Tab>
    <Tab>All Opportunities</Tab>
  </TabNavigation>

  <HighConfidenceSection>
    {signals.filter(s => s.total_score >= 12).map(signal => (
      <BearishSignalCard
        signal={signal}
        variant="expanded"
        showRecommendation={true}
        actions={['analyze', 'trade', 'watch']}
      />
    ))}
  </HighConfidenceSection>

  <ModerateSection collapsible>
    {/* Moderate signals 8-11 */}
  </ModerateSection>

  <WeakSection collapsible>
    {/* Weak signals 5-7 */}
  </WeakSection>
</BearishSignalsScanner>
```

#### Visual Specifications

**Card Colors by Score:**
```css
/* Score 22-27: Extreme */
border: 2px solid rgb(239, 68, 68, 0.6)  /* red-500 */
shadow: 0 18px 55px rgba(248, 113, 113, 0.28)
glow: inset border with red-500/20 background

/* Score 16-21: High */
border: 2px solid rgb(249, 115, 22, 0.6)  /* orange-500 */
shadow: 0 15px 45px rgba(249, 115, 22, 0.25)

/* Score 9-15: Moderate */
border: 1px solid rgb(217, 119, 6, 0.4)  /* amber-500 */
shadow: 0 15px 45px rgba(217, 119, 6, 0.2)

/* Score 5-8: Watch */
border: 1px solid rgb(148, 163, 184, 0.3)  /* slate-400 */
shadow: 0 10px 30px rgba(148, 163, 184, 0.15)
```

---

### 2. Portfolio Page - Risk Monitoring

**Location**: `/app/portfolio/page.tsx`

**Purpose**: Alert users to bearish signals on stocks they OWN (portfolio protection)

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Your Portfolio                    $125,450 (+2.3% today)│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🚨 BEARISH RISK ALERTS                      [Refresh ↻]    │
│  Protect your holdings with these bearish signals           │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐│
│  │ 🔴 AAPL - EXTREME RISK                                  ││
│  │ 🏷️ PORTFOLIO POSITION                                   ││
│  │                                                          ││
│  │ Your position: 100 shares @ $180.50                     ││
│  │ Current value: $18,050                                  ││
│  │ Unrealized P&L: +$2,450 (+15.7%)                        ││
│  │                                                          ││
│  │ Bearish Score: 24/27 • Confidence: 89%                  ││
│  │ Expected drop: 10-15% within 2 weeks                    ││
│  │                                                          ││
│  │ 💡 PROTECTIVE PUT RECOMMENDATION:                        ││
│  │ Buy 1x $180 Put @ $3.20 (Dec 15)                        ││
│  │ Cost: $320 (1.77% of position)                          ││
│  │ Protection: Limits loss to $370 if AAPL drops to $165   ││
│  │                                                          ││
│  │ [🛡️ Buy Protection] [📊 Analyze] [✕ Dismiss]           ││
│  └────────────────────────────────────────────────────────┘│
│                                                              │
│  ⚠️  2 more positions at risk: MSFT, NVDA                   │
│  [View All Risk Alerts]                                     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  YOUR POSITIONS                                             │
│  [Rest of portfolio table...]                               │
└─────────────────────────────────────────────────────────────┘
```

#### Key UX Decision: Portfolio vs Watchlist

**Portfolio signals are PRIORITIZED:**
- Bright orange border + glow (not just red)
- "PORTFOLIO POSITION" badge
- Shows current position details
- Recommendation framed as "protection" not "speculation"
- More conservative position sizing (1-2% of position value, not portfolio)

**Watchlist signals are SECONDARY:**
- Standard color scheme
- "WATCHLIST" badge in blue
- Framed as "opportunity" not "protection"
- Standard 1-3% portfolio position sizing

---

### 3. Detailed Signal View - Deep Dive

**Location**: Modal or `/app/signals/[symbol]`

**Purpose**: Full analysis for users who want to understand WHY before acting

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Scanner           HOOD Bearish Signal            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  HOOD - Robinhood Markets                   $35.50 -0.85%   │
│  Score: 28/27 🔴 EXTREME • Confidence: 94%                  │
│  Generated: Nov 6, 2025 2:45 PM • Valid for: 24 hours      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐│
│  │  SIGNAL BREAKDOWN                                       ││
│  │                                                          ││
│  │  ┌──────────────────────────────────────────────────┐  ││
│  │  │  🎯 SCORE COMPOSITION                             │  ││
│  │  │                                                    │  ││
│  │  │  ████████████░░░░░░░░ Put/Call Ratio (3 pts)     │  ││
│  │  │  2.04 ratio • 99th percentile for HOOD           │  ││
│  │  │                                                    │  ││
│  │  │  █████████████████░░░ Unusual Put Vol (9 pts)    │  ││
│  │  │  3.11x Vol/OI on $34 puts • 3 strikes affected   │  ││
│  │  │                                                    │  ││
│  │  │  ████████████████████ Large Flows (15 pts)       │  ││
│  │  │  $525k on $35 puts • $308k on $34 puts           │  ││
│  │  │  6 institutional-size trades in 3 hours          │  ││
│  │  │                                                    │  ││
│  │  │  ███░░░░░░░░░░░░░░░░░ IV Skew (0 pts)            │  ││
│  │  │  15pt skew • Below threshold (need 20+)          │  ││
│  │  │                                                    │  ││
│  │  │  ████████░░░░░░░░░░░░ Time Concentration (2 pts) │  ││
│  │  │  87% volume in Dec 15 exp (7 days out)           │  ││
│  │  │                                                    │  ││
│  │  └──────────────────────────────────────────────────┘  ││
│  │                                                          ││
│  │  KEY INSIGHTS:                                           ││
│  │  • Extreme institutional put buying (top 1% for HOOD)   ││
│  │  • Multiple large trades = coordinated positioning      ││
│  │  • Near-term concentration = expect move within week    ││
│  │  • No news/earnings = potential informed trading        ││
│  └────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌────────────────────────────────────────────────────────┐│
│  │  💰 TRADE RECOMMENDATIONS                               ││
│  │                                                          ││
│  │  PRIMARY: $35 Put @ $1.50 (Dec 15)                      ││
│  │  ├─ ROI on 10% drop: 103%                               ││
│  │  ├─ Break-even: $33.50 (5.6% drop)                      ││
│  │  ├─ Max loss: $150 per contract                         ││
│  │  └─ Liquidity: 3,500 volume, 1,200 OI ✅                ││
│  │                                                          ││
│  │  ALTERNATIVE: $34 Put @ $1.10 (Dec 15)                  ││
│  │  ├─ ROI on 10% drop: 86%                                ││
│  │  ├─ Break-even: $32.90 (7.3% drop)                      ││
│  │  ├─ Max loss: $110 per contract                         ││
│  │  └─ Liquidity: 2,800 volume, 900 OI ✅                  ││
│  │                                                          ││
│  │  POSITION SIZING (based on $50k portfolio):             ││
│  │  • Conservative (1%): 3 contracts = $450 risk           ││
│  │  • Moderate (2%): 6 contracts = $900 risk               ││
│  │  • Aggressive (3%): 10 contracts = $1,500 risk          ││
│  │                                                          ││
│  │  STOP LOSS: Exit if HOOD rallies above $37.30 (+5%)     ││
│  │  TIME STOP: Close position if no move by Dec 10         ││
│  │                                                          ││
│  │  [🛒 Create Trade] [📋 Copy to Clipboard]              ││
│  └────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌────────────────────────────────────────────────────────┐│
│  │  📊 HISTORICAL PERFORMANCE                              ││
│  │                                                          ││
│  │  Similar signals for HOOD (last 12 months):             ││
│  │  • 4 signals triggered (score ≥ 20)                     ││
│  │  • 3 successful (5%+ drop within 2 weeks) = 75%         ││
│  │  • Average ROI: +94% on successful trades               ││
│  │  • Average loss: -45% on failed trades                  ││
│  │  • Risk-adjusted return: +2.1x                          ││
│  │                                                          ││
│  │  [View All Historical Signals]                          ││
│  └────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌────────────────────────────────────────────────────────┐│
│  │  📰 CONTEXT & CATALYSTS                                 ││
│  │                                                          ││
│  │  • No earnings scheduled (next: Feb 12, 2026)           ││
│  │  • No major news in past 24 hours                       ││
│  │  • Sector (Fintech): Neutral sentiment                  ││
│  │  • Short interest: 12% of float (moderate)              ││
│  │  • Insider activity: None in past 30 days               ││
│  │                                                          ││
│  │  ⚠️ Signal quality: HIGH (no known catalyst = informed) ││
│  └────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Interactive Elements

**Score Breakdown Bars:**
- Clickable to expand and show raw data
- Color-coded: Green (not triggered) → Yellow (moderate) → Red (strong)
- Shows threshold line for "signal triggered"

**Trade Recommendations:**
- "Create Trade" button pre-fills order form
- "Copy to Clipboard" for use in external brokers
- Shows Greeks (delta, theta, vega) on hover

**Historical Performance:**
- Links to detailed backtest results
- Shows win rate, avg ROI, risk metrics
- Filters by signal strength (similar score range)

---

### 4. Real-Time Notifications

**Location**: Top-right notification bell icon + floating alerts

#### Notification Levels

**🔴 URGENT (Score ≥ 22):**
```
┌─────────────────────────────────────────┐
│ 🔴 EXTREME BEARISH SIGNAL               │
│                                          │
│ HOOD scored 28/27                       │
│ Institutional put buying detected       │
│                                          │
│ [View Signal] [Dismiss]                 │
└─────────────────────────────────────────┘
```
- Persists until dismissed
- Plays subtle sound (optional)
- Shows on portfolio page if user owns stock

**🟠 HIGH (Score 16-21):**
```
┌─────────────────────────────────────────┐
│ 🟠 High Confidence Bearish Signal       │
│                                          │
│ AAPL scored 19/27                       │
│ Large put flows + elevated P/C ratio    │
│                                          │
│ [View Signal] [Dismiss]                 │
└─────────────────────────────────────────┘
```
- Auto-dismisses after 30 seconds
- Logged in notification center

**🟡 MODERATE (Score 8-15):**
```
┌─────────────────────────────────────────┐
│ 📊 New Bearish Signal                   │
│                                          │
│ MSFT • Score 12/27                      │
│                                          │
│ [View]                                  │
└─────────────────────────────────────────┘
```
- Only shown if user is watching the stock
- Auto-dismisses after 15 seconds

#### Notification Settings

User preferences in Settings page:
```
🔔 Bearish Signal Notifications

Signal Threshold:
  [ ] All signals (5+)
  [x] Moderate and above (8+)
  [ ] High confidence only (16+)

Notification Method:
  [x] In-app notifications
  [x] Browser push notifications
  [ ] Email alerts
  [ ] SMS alerts (Premium)

Filters:
  [x] Portfolio holdings only
  [ ] Watchlist only
  [ ] All scanned symbols

Quiet Hours:
  [ ] Enable quiet hours
  From: [9:00 PM] To: [7:00 AM]
```

---

### 5. Mobile Responsive Design

**Phone Layout (< 768px):**

```
┌─────────────────────────────────┐
│  HOOD                    28/27  │
│  🔴 EXTREME              94%    │
│                                 │
│  🎯 RECOMMENDED ACTION          │
│  BUY: $35 Put @ $1.50           │
│  Expected ROI: 120-180%         │
│                                 │
│  [Trade Now]  [Analyze]         │
│                                 │
│  ▼ Signal Details               │
│  • P/C Ratio: 2.04 (99th %ile) │
│  • Vol/OI: 3.11x                │
│  • Premium: $525k               │
│                                 │
│  Updated: 2:45 PM               │
└─────────────────────────────────┘
```

**Key Mobile Optimizations:**
- Stack horizontally-aligned elements vertically
- Collapse "nice-to-have" data by default (expand on tap)
- Larger tap targets (min 44x44px)
- Bottom sheet for detailed view (easier one-handed use)
- Swipe actions: Swipe right = Dismiss, Swipe left = Add to watchlist

---

## 🎨 Component Library

### New Components to Build

#### 1. `<BearishSignalCard>`
```tsx
interface BearishSignalCardProps {
  signal: BearishAnalysis  // from bearish_signals.py
  variant: 'compact' | 'standard' | 'expanded'
  showRecommendation?: boolean
  showPosition?: Position  // if in portfolio
  actions?: Array<'trade' | 'analyze' | 'watch' | 'dismiss'>
  onAction?: (action: string, signal: BearishAnalysis) => void
}

// Usage:
<BearishSignalCard
  signal={hoodSignal}
  variant="expanded"
  showRecommendation={true}
  actions={['trade', 'analyze', 'watch']}
  onAction={(action, signal) => {
    if (action === 'trade') {
      openTradeModal(signal)
    }
  }}
/>
```

#### 2. `<SignalScoreBreakdown>`
```tsx
interface SignalScoreBreakdownProps {
  signals: Array<{
    name: string
    points: number
    maxPoints: number
    triggered: boolean
    description: string
    details?: string
  }>
  totalScore: number
  maxScore: number
}

// Shows visual bars + explanations for each signal component
```

#### 3. `<TradeRecommendation>`
```tsx
interface TradeRecommendationProps {
  symbol: string
  currentPrice: number
  recommendedStrikes: Array<{
    strike: number
    premium: number
    expiration: string
    roi: string
    breakeven: number
  }>
  positionSizes: Array<{
    risk: 'conservative' | 'moderate' | 'aggressive'
    contracts: number
    cost: number
    percentOfPortfolio: number
  }>
  stopLoss: number
  timeStop: string
}
```

#### 4. `<HistoricalBacktest>`
```tsx
interface HistoricalBacktestProps {
  symbol: string
  similarSignalCount: number
  successRate: number
  avgROI: number
  avgLoss: number
  riskAdjustedReturn: number
  signalScoreRange: [number, number]
}

// Shows track record for similar signals
```

---

## 🔄 Data Flow

### Backend → Frontend Pipeline

```
1. Python Scanner (bearish_signals.py)
   ├─ Analyzes options data every 15 min
   ├─ Generates BearishAnalysis objects
   └─ Stores in Supabase table: bearish_signals

2. Supabase Table Schema:
   bearish_signals
   ├─ id (uuid, primary key)
   ├─ symbol (text)
   ├─ total_score (int)
   ├─ recommendation (text)
   ├─ signals (jsonb) -- array of signal objects
   ├─ put_call_ratio (decimal)
   ├─ recommended_strikes (jsonb)
   ├─ expected_roi (text)
   ├─ timestamp (timestamptz)
   ├─ expires_at (timestamptz) -- 24 hours after timestamp
   └─ metadata (jsonb) -- additional context

3. API Endpoint: /api/bearish-signals
   ├─ GET /api/bearish-signals?minScore=8&limit=20
   ├─ GET /api/bearish-signals/:symbol
   └─ POST /api/bearish-signals/refresh (triggers rescan)

4. React Components
   ├─ Fetch from API on mount + every 5 min
   ├─ Subscribe to Supabase realtime changes
   └─ Update UI instantly when new signal arrives
```

### API Specification

```typescript
// GET /api/bearish-signals
interface GetBearishSignalsRequest {
  minScore?: number       // Filter by minimum score (default: 8)
  limit?: number          // Max results (default: 20)
  symbols?: string[]      // Filter by symbols
  alertLevel?: string     // 'watch' | 'elevated' | 'high' | 'extreme'
  includeExpired?: boolean // Include signals older than 24h
}

interface GetBearishSignalsResponse {
  success: boolean
  data: BearishSignal[]
  count: number
  generatedAt: string
  nextScanAt: string
  error?: string
}

interface BearishSignal {
  id: string
  symbol: string
  totalScore: number
  recommendation: string
  signals: SignalComponent[]
  putCallRatio: number
  recommendedStrikes: RecommendedStrike[]
  expectedRoi: string
  timestamp: string
  expiresAt: string
  metadata: {
    currentPrice: number
    priceChange: number
    volume: number
    isPortfolio?: boolean
    isWatchlist?: boolean
  }
}
```

---

## 🚀 Implementation Roadmap

### Phase 1: Core Components (Week 1)
- [x] Build Python bearish_signals.py module ✅
- [ ] Create Supabase table migration
- [ ] Build API endpoint `/api/bearish-signals`
- [ ] Create `<BearishSignalCard>` component
- [ ] Add to Scanner page (basic view)

### Phase 2: Portfolio Integration (Week 2)
- [ ] Add to Portfolio page
- [ ] Distinguish portfolio vs watchlist signals
- [ ] Build protective put recommendations
- [ ] Add notification system

### Phase 3: Deep Dive (Week 3)
- [ ] Create detailed signal view modal
- [ ] Build `<SignalScoreBreakdown>` component
- [ ] Add historical performance tracking
- [ ] Implement backtest display

### Phase 4: Real-time & Polish (Week 4)
- [ ] Add Supabase realtime subscriptions
- [ ] Implement notification preferences
- [ ] Mobile optimization
- [ ] Performance testing & optimization

---

## 📊 Success Metrics

Track these to validate UX effectiveness:

1. **Engagement Metrics:**
   - % of users who click on bearish signals
   - Time spent viewing signal details
   - Signals dismissed vs analyzed

2. **Action Metrics:**
   - % of signals that lead to trades
   - Average time from signal to trade
   - "Create Trade" button click rate

3. **User Satisfaction:**
   - Survey: "How useful are bearish signals?" (1-5)
   - Feature usage frequency
   - User feedback volume

4. **Business Metrics:**
   - Win rate on bearish signal trades
   - Average ROI on followed recommendations
   - User retention among signal users

---

## ⚠️ Edge Cases & Error States

### No Signals Detected
```
┌─────────────────────────────────────────┐
│ ✅ All Clear                             │
│                                          │
│ No high-confidence bearish signals      │
│ detected across 120 symbols.            │
│                                          │
│ Last scan: 2:45 PM                      │
│ Next scan: 3:00 PM                      │
└─────────────────────────────────────────┘
```

### API Error
```
┌─────────────────────────────────────────┐
│ ⚠️ Unable to Load Signals                │
│                                          │
│ We couldn't fetch the latest bearish    │
│ signals. This might be temporary.       │
│                                          │
│ [Retry] [View Cached Data]              │
└─────────────────────────────────────────┘
```

### Expired Signal
```
┌─────────────────────────────────────────┐
│ HOOD • Score 28/27                      │
│ 🕐 EXPIRED (26 hours old)                │
│                                          │
│ This signal is outdated. Options        │
│ activity changes rapidly.               │
│                                          │
│ [Scan Now] [View Historical Data]       │
└─────────────────────────────────────────┘
```

### Conflicting Signals
```
┌─────────────────────────────────────────┐
│ ⚡ MIXED SIGNALS                         │
│                                          │
│ AAPL has both bearish (score 18) and    │
│ bullish (score 16) signals active.      │
│                                          │
│ This suggests uncertainty or hedging.   │
│ Consider waiting for clearer direction. │
│                                          │
│ [View Both Signals]                     │
└─────────────────────────────────────────┘
```

---

## 🎭 Accessibility

### WCAG 2.1 AA Compliance

1. **Color Contrast:**
   - All text meets 4.5:1 minimum ratio
   - Red alerts tested for color blindness
   - Alternative indicators beyond color (icons, text)

2. **Keyboard Navigation:**
   - All actions accessible via keyboard
   - Tab order follows visual hierarchy
   - Focus indicators clearly visible

3. **Screen Readers:**
   ```html
   <div role="alert" aria-live="polite" aria-label="High confidence bearish signal detected for HOOD">
     <h3>HOOD Bearish Signal</h3>
     <p>Score: 28 out of 27. Extreme alert level.</p>
     <button aria-label="View detailed analysis for HOOD bearish signal">Analyze</button>
   </div>
   ```

4. **Reduced Motion:**
   ```css
   @media (prefers-reduced-motion: reduce) {
     * {
       animation: none !important;
       transition: none !important;
     }
   }
   ```

---

## 🎨 Dark Mode

All components must support dark mode with appropriate contrast:

```css
/* Light mode */
.bearish-signal-card {
  background: linear-gradient(to-br, white, rgb(248 250 252));
  border: 1px solid rgb(226 232 240);
  color: rgb(15 23 42);
}

/* Dark mode */
.dark .bearish-signal-card {
  background: linear-gradient(to-br, rgb(15 23 42), rgb(30 41 59));
  border: 1px solid rgb(51 65 85);
  color: rgb(248 250 252);
}

/* Alert colors adjust for dark mode */
.dark .extreme-alert {
  border-color: rgb(248 113 113 / 0.6);  /* Brighter for visibility */
  box-shadow: 0 18px 55px rgba(248, 113, 113, 0.35);  /* More glow */
}
```

---

## 💡 User Education

### First-Time User Experience

Show educational tooltip on first bearish signal view:

```
┌───────────────────────────────────────────────┐
│ 💡 How Bearish Signals Work                   │
│                                                │
│ Our system monitors unusual options activity  │
│ to detect when institutions are betting on    │
│ stock drops. A score of 8+ suggests high      │
│ confidence.                                    │
│                                                │
│ Key indicators:                                │
│ • Put/Call Ratio: More puts = bearish         │
│ • Unusual Volume: Fresh positioning           │
│ • Large Flows: Institutional trades           │
│                                                │
│ [Learn More] [Don't Show Again]               │
└───────────────────────────────────────────────┘
```

### Help Tooltips

Add (?) icons throughout with contextual help:

```
Score: 28/27 (?)
└──> "This is an extremely high score.
      Anything above 22 indicates very
      strong bearish signals. The system
      rarely scores this high."

Put/Call Ratio: 2.04 (?)
└──> "This means 2x more puts were traded
      than calls today. Ratios above 1.5
      suggest strong bearish sentiment."

Expected ROI: 120-180% (?)
└──> "If HOOD drops 10% within 2 weeks,
      this put position would gain 120-180%.
      This is NOT guaranteed."
```

---

## 🔒 Risk Disclosures

**Every signal must include:**

```
⚠️ RISK DISCLOSURE

Options trading involves substantial risk and is not
suitable for all investors. The recommended positions
could result in 100% loss of capital. Past performance
of signals does not guarantee future results.

This is not financial advice. Always do your own
research and consider consulting a financial advisor.

[I Understand the Risks]
```

Required before "Create Trade" button becomes active.

---

## 📱 Push Notification Example

**Browser Push Notification:**
```
[🔴 Options Scanner]

EXTREME bearish signal: HOOD (28/27)

Institutional put buying detected.
Expected ROI: 120-180%

[View Signal] [Dismiss]
```

**Email Alert (Optional, Premium):**
```
Subject: 🔴 EXTREME Bearish Signal: HOOD

Hi Sam,

Your Options Scanner detected an EXTREME confidence
bearish signal for HOOD (Robinhood Markets).

Score: 28/27 (99th percentile)
Confidence: 94%

Key Indicators:
✓ Put/Call Ratio: 2.04 (extreme)
✓ Unusual Put Volume: 3.11x at $34 strike
✓ Large Premium Flows: $525k in 3 hours
✓ Time Concentration: 87% in near-term

Recommended Action:
BUY: $35 Put @ $1.50 (Dec 15)
Expected ROI: 120-180% on 10% drop
Position Size: 2-3% of portfolio

[View Full Analysis →]

---
You're receiving this because you enabled email
alerts for high-confidence bearish signals.

Manage notification preferences →
```

---

## 🎯 Summary: What Makes This UX Thoughtful?

1. **Actionable First**
   - Shows what to DO before explaining why
   - Recommended strikes and position sizes upfront
   - One-click trade creation

2. **Context-Aware**
   - Portfolio positions get special treatment
   - Watchlist items prioritized
   - Unknown symbols de-emphasized

3. **Progressive Disclosure**
   - Quick scan → Card view → Detailed analysis
   - Don't overwhelm with data
   - Power users can dig deeper

4. **Trust Building**
   - Show confidence levels clearly
   - Display historical performance
   - Explain signal components
   - Include risk disclosures

5. **Respectful of Time**
   - Key info visible without clicking
   - Smart defaults (appropriate position sizes)
   - Bulk actions (dismiss all, add multiple to watchlist)

6. **Accessible & Inclusive**
   - Works on all devices
   - Supports screen readers
   - Color-blind friendly
   - Respects reduced motion

7. **Educational**
   - Tooltips explain jargon
   - First-time user guidance
   - Links to learning resources
   - But doesn't force education on experienced users

---

**This UX design ensures users can:**
1. Discover opportunities quickly (Scanner)
2. Protect their holdings (Portfolio)
3. Understand the reasoning (Detailed View)
4. Take action confidently (Trade Recommendations)
5. Learn and improve (Historical Performance)

All while maintaining visual consistency with the existing DropRiskRadar component and overall design system.

