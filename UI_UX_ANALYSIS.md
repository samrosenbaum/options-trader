# Options Trader Application - UI/UX Structure Analysis

## 1. Frontend Framework & Core Stack

### Primary Framework
- **Next.js 15.5.4** with React 18
- **TypeScript** for type safety
- **Tailwind CSS** for styling with dark mode support
- **Framer Motion** for animations and transitions

### UI Component Libraries
- **Radix UI** - Comprehensive headless component system for:
  - Dialogs, Dropdowns, Menus
  - Tabs, Accordions, Collapsibles
  - Tooltips, Popovers, Hover Cards
  - Forms (labels, inputs, selects)
  - Progress bars, sliders, switches
  
### Visualization & Data
- **Recharts** - Interactive charts (line, bar, pie, area)
- **Lucide React** - Icon library (extensive set for all UI needs)
- **date-fns** - Date formatting and manipulation

### Additional Libraries
- **Framer Motion** - Animation library for smooth UI transitions
- **SWR** - Data fetching with caching
- **React Hook Form** - Form management
- **Zod** - Schema validation
- **Next Themes** - Dark mode management

## 2. Frontend Architecture

### Directory Structure
```
/app                       # Next.js app directory (main application)
  /api                     # API routes
    /drop-risk            # Bearish signal API endpoint
    /exit-signals         # Exit signal detection
    /sentiment-signals    # Market sentiment signals
    /scan*                # Various scanner endpoints
  /scanner               # Scanner page route
  /macro                 # Macro indicators page
  /sentiments            # Sentiment intelligence page
  /portfolio             # Portfolio management page
  /dashboard-page.tsx    # Main dashboard
  /scanner-page.tsx      # Main scanner interface
  layout.tsx             # Root layout
  providers.tsx          # Context providers

/components              # Reusable React components
  /ui                    # Base UI components (Radix-based)
  /onboarding           # Onboarding flow components
  drop-risk-radar.tsx   # Bearish signal display
  signal-tape.tsx       # Signal ticker
  opportunity-card.tsx  # Opportunity display (130KB - complex)
  live-scanner.tsx      # Real-time scanner UI
  navigator.tsx         # Navigation bar
  position-alerts.tsx   # Alert notifications
  [...other components]

/lib
  /types                # TypeScript type definitions
    opportunity.ts      # Opportunity types
    drop-alert.ts       # Drop alert/bearish signal types
    database.types.ts   # Supabase schema types
  /supabase            # Supabase client utilities
  /sentiments          # Sentiment analysis utilities

/contexts               # React Context providers
  monty-chat-context.tsx
  scan-context.tsx

/public               # Static assets
```

## 3. Existing Pages & Views

### Dashboard (`/dashboard-page.tsx`)
- **Purpose**: Home page with portfolio overview
- **Key Components**:
  - Portfolio snapshot with P&L tracking
  - Quick action cards (Scanner, Portfolio, Market Intelligence, Macro Indicators)
  - Top performing positions table
  - Biggest winners/losers history
  - Trading desk banner
  - Monty AI assistant brief
- **Layout**: Grid-based with cards and charts
- **Colors**: Emerald (positive), Sky (neutral), Purple (analysis), Amber (macro)

### Scanner (`/scanner/page.tsx` → `scanner-page.tsx`)
- **Purpose**: Core trade-finding tool
- **Key Features**:
  - Real-time opportunity scanning
  - Custom filters (directional bias, Greeks, IV, volume)
  - Opportunity cards with detailed analysis
  - Backtest validation results
  - Historical context and confidence levels
  - Swing signal insights
  - Data quality badges
  - Sort options: promising, risk/reward, probability, max return, safety, expiration
- **Layout**: Full-page scanner with collapsible sections
- **Key Component**: `OpportunityCard` (displays bullish opportunities)

### Portfolio (`/portfolio/portfolio-client.tsx`)
- **Purpose**: Position management and monitoring
- **Key Features**:
  - **Drop Risk Radar** - Shows bearish signal detections (existing!)
  - Open positions table with exit signals
  - Closed positions history
  - Position mix breakdown (pie/bar charts)
  - Expiration date bucketing
  - Position type analysis
  - CSV import capability
  - Add/edit/close position modals
- **Layout**: Multiple sections with charts and tables
- **Key Component**: `DropRiskRadar` - Already displays bearish signals!

### Macro (`/macro/page.tsx`)
- **Purpose**: Macroeconomic signals and indicators
- **Key Features**:
  - Live ticker with key indices
  - Market sentiment snapshot (VIX, sentiment gauge)
  - Political trades feed
  - Live news feed
  - WSB trending topics
  - Macro summary card
  - Signal tape (sentiment signals)
  - Economic calendar

### Sentiments (`/sentiments/page.tsx`)
- **Purpose**: Market sentiment and narrative analysis
- **Key Features**:
  - Bullish/bearish narrative cards (gradient colored)
  - Options flow sentiment
  - News tone analysis
  - Macro signal integration
  - Signal tape component
  - Tone-based coloring (emerald for bullish, rose for bearish, cyan for neutral)

## 4. Design System & UI Components

### Color System
- **Positive/Bullish**: Emerald (#10b981), Green (#22c55e)
- **Negative/Bearish**: Red (#ef4444), Rose (#f43f5e), Orange (#f97316), Amber (#f59e0b)
- **Neutral/Alert**: Slate (#64748b), Blue (#3b82f6), Cyan (#06b6d4)
- **Background**: White/Slate-50 (light), Slate-950 (dark)
- **Dark Mode**: Full dark theme support with Tailwind dark: prefix

### Card Patterns
```
Standard Card:
- Rounded borders (rounded-2xl, rounded-3xl)
- Subtle gradients (from-white via-slate-50 to-white)
- Border with opacity (border-white/30)
- Shadow with backdrop blur
- Hover effects (translate-y-1, shadow increase)

Signal Cards:
- Color-coded by alert level or sentiment
- Gradient backgrounds with transparency
- Border matching theme color
- Glow effect (shadow with colored opacity)
- Badge for type/severity
```

### Key Component Patterns

#### 1. Alert/Signal Badge
```tsx
<span className="rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.2em]">
  {alertLevel}
</span>
```
Used for: alert levels, trade directions, signal types

#### 2. Score Display
```tsx
<div className="rounded-2xl border bg-gradient-to-br px-6 py-4 text-white shadow-lg">
  <div className="text-xs uppercase tracking-[0.3em]">Drop Risk</div>
  <div className="text-3xl font-semibold">{score}</div>
</div>
```
Used for: risk scores, confidence levels, composite scores

#### 3. Stat Card
```tsx
<div className="rounded-xl bg-gradient-to-br p-4 border">
  <div className="text-xs font-semibold uppercase">LABEL</div>
  <div className="text-lg font-bold">{value}</div>
  <div className="text-xs text-slate-600">{subtext}</div>
</div>
```
Used for: quick metrics, key stats

#### 4. Driver/Factor List
```tsx
<ul className="space-y-2 text-sm">
  {items.map(item => (
    <li className="flex gap-2">
      <span className="h-1.5 w-1.5 rounded-full" />
      <span>{item}</span>
    </li>
  ))}
</ul>
```
Used for: reasons, drivers, factors

## 5. How Signals/Opportunities Are Displayed

### Bullish Opportunities (Scanner)
**Component**: `OpportunityCard` (in `/components/opportunity-card.tsx`)
- **Display Format**: Individual cards for each opportunity
- **Information Shown**:
  - Stock symbol, option type, strike, expiration
  - Composite opportunity score
  - Directional bias (bullish/bearish/neutral) with color-coding
  - Expected probability of profit
  - Greeks (Delta, Gamma, Theta, Vega)
  - Risk-adjusted scoring
  - Data quality badge
  - Backtest validation results
  - Historical context (past occurrences, success rate)
  - Swing signal insights with factors
  - News headlines and sentiment
  - Position sizing recommendations
  - Scenario analysis and confidence levels

- **Colors**: 
  - Bullish: Green/Emerald tints
  - Bearish: Red/Rose tints
  - Score-based: Color gradient (red for high scores, yellow for medium, slate for low)

- **Layout**: Collapsible sections for detailed analysis
- **Interaction**: Expandable cards with accordion sections

### Bearish Signals (Drop Risk Radar)
**Component**: `DropRiskRadar` (in `/components/drop-risk-radar.tsx`)
- **Display Format**: Card-based list showing top bearish candidates
- **Information Shown**:
  - Stock symbol with portfolio/watchlist tags
  - Drop risk score (0-100+) with color gradient
  - Alert level badge (watch, elevated, high, extreme)
  - Confidence percentage
  - Score change (Δ) from previous calculation
  - Price movement today (%)
  - List of drivers explaining the bearish signal
  - Current stock price
  - Composite scoring explanation in header

- **Alert Levels Styling**:
  - **Watch**: Slate (slate-500/15, slate-400/40)
  - **Elevated**: Amber (amber-500/15, amber-400/40)
  - **High**: Orange (orange-500/15, orange-400/40)
  - **Extreme**: Red (red-500/15, red-400/40)

- **Visual Hierarchy**:
  - Large score badge on the right
  - Symbol and tags on the left
  - Drivers listed below as bullet points
  - Portfolio items get orange glow effect
  - Watchlist items get blue tags

- **Layout**: Vertical stack of cards
- **Interaction**: 
  - Refresh button to manually trigger update
  - Responsive to portfolio/watchlist context
  - Loading states with skeleton cards
  - Empty states with clear messages
  - Error states with retry information

### Signal Tape Component
**Component**: `SignalTape` (in `/components/signal-tape.tsx`)
- **Display Format**: Scrollable tape of recent signals
- **Information Shown**:
  - Signal label (event name)
  - Direction badge (bullish/bearish)
  - Signal detail (explanation)
  - Time posted (relative, "5 minutes ago")

- **Colors**:
  - Bullish: Emerald background with darker emerald text
  - Bearish: Rose background with darker rose text

- **Layout**: Horizontal cards in vertical stack
- **Interaction**: Auto-refresh every 5 minutes, manual refresh button

## 6. API Endpoints for Signals

### Drop Risk / Bearish Signals
```
GET /api/drop-risk?limit=20&minScore=50
```
- **Response**: Array of `DropRiskSignal` objects from `drop_risk_signals` table
- **Fields**: 
  - `symbol`, `score`, `biasScore`, `confidence`
  - `alertLevel`, `drivers`, `signalDetails`
  - `stockPrice`, `priceChangePct`, `scoreChange`
  - `generatedAt`, `id`

### Sentiment Signals
```
GET /api/sentiment-signals
```
- **Response**: Array of sentiment signals with direction, label, detail, time
- **Used By**: SignalTape component
- **Refresh**: Every 5 minutes

### Exit Signals
```
POST /api/exit-signals
```
- **Body**: Array of positions with Greeks, IV, directional bias
- **Response**: Exit signal analysis per position
  - Signals: SELL_ALL, SELL_PARTIAL, HOLD, CUT_LOSS
  - Confidence, reasoning, suggested action
  - Risk/recovery scores

### Scanner/Opportunities
```
GET /api/scan
GET /api/scan-enhanced
GET /api/scan-enhanced-pro
```
- **Response**: Array of `Opportunity` objects with full analysis
- **Used By**: Scanner page and dashboard

## 7. Database Schema

### Drop Risk Signals Table
```sql
CREATE TABLE drop_risk_signals (
  id UUID PRIMARY KEY
  symbol TEXT NOT NULL
  drop_risk_score NUMERIC(6,2)       -- 0-100+ composite score
  bias_score NUMERIC(6,2)            -- directional bias component
  confidence NUMERIC(5,2)            -- 0-100% confidence
  stock_price NUMERIC(12,4)          -- current stock price
  price_change_pct NUMERIC(6,2)      -- daily % change
  alert_level TEXT                   -- 'watch', 'elevated', 'high', 'extreme'
  drivers JSONB NOT NULL             -- array of reason strings
  signal_details JSONB               -- component breakdown, context
  score_change NUMERIC(6,2)          -- change from last calculation
  generated_at TIMESTAMPTZ           -- when signal was created
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
)

INDEXES:
- drop_risk_signals_symbol_idx (symbol, generated_at DESC)
- drop_risk_signals_generated_at_idx (generated_at DESC)

RLS POLICY:
- SELECT: authenticated users can read
- INSERT: service role only (from backend)
```

## 8. Notification/Alert Systems

### No Heavy Toast System
The app does NOT use a global toast notification system (no Sonner integration in UI).

### Alert Patterns Instead:
1. **Inline Alerts**: Cards with dismiss buttons (`PositionAlerts` component)
2. **Alert Severities**: critical, high, medium, low, info
3. **Alert Colors**:
   - Critical: Red (red-50 border, red-900 text)
   - High: Orange (orange-50 border, orange-900 text)
   - Medium: Amber (amber-50 border, amber-900 text)
   - Low: Blue (blue-50 border, blue-900 text)
   - Info: Slate (slate-50 border, slate-900 text)

4. **Alert Dismissal**: 
   - API call to `/api/positions/dismiss-alert`
   - Optimistic UI update
   - Can be refetched

### Exit Signal Badges
Portfolio shows exit signals on each position:
- **Hold**: Green badge (border-emerald-400/40, bg-emerald-500/10)
- **Watch Closely**: Amber badge (border-amber-400/40, bg-amber-500/10)
- **Exit Now**: Red badge (border-red-400/40, bg-red-500/10)

## 9. Navigation Structure

### Main Navigation Bar
- **Sticky top navigation** with logo
- **Primary Navigation Items**:
  - Desk (dashboard) - /
  - Find Trades - /scanner
  - Market Movers (dropdown):
    - Macro - /macro
    - Sentiments - /sentiments
    - Crypto - /crypto
  - Your Positions (dropdown):
    - Portfolio - /portfolio
    - Watchlist - /watchlist
    - Anti-Portfolio - /rejection-learning

- **Styling**: 
  - Gradient background (white-90% to emerald-50)
  - Rounded corners (2rem)
  - Backdrop blur
  - Responsive: hamburger menu on mobile
  - Active page indicator (emerald color)
  - Fun greeting message on landing

## 10. Key Context Providers

### MontyChatProvider
- Manages AI assistant state
- Powers interactive Monty chat widget

### ScanProvider
- Manages scanner state (results, filters, preferences)

### WatchlistProvider
- Manages watchlist symbols and operations

## 11. Development Tools

### Testing
- **Vitest** for unit testing
- **Supertest** for API testing

### Linting & Code Quality
- **ESLint** with Next.js config

### Analytics
- **Vercel Analytics** for performance monitoring

## Design Principles Observed

1. **Dark Mode First**: Full dark theme support, high contrast
2. **Gradient Aesthetics**: Subtle gradients for depth
3. **Blur Effects**: Backdrop blur for modern look
4. **Spacing**: Consistent padding and margins
5. **Typography**: Clean sans-serif fonts (Inter, Space Grotesk)
6. **Responsive**: Mobile-first approach
7. **Color Semantics**: Colors map to sentiment/signal type
8. **Micro-interactions**: Hover states, transitions, animations
9. **Information Density**: Collapsible sections for details
10. **Accessibility**: Proper ARIA labels, focus states

