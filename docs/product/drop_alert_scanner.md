# Drop Alert Scanner Experience

## Overview
Retail traders need early warnings for large downside moves. The Drop Alert Scanner integrates
multi-signal monitoring (options skew, institutional flow, regime shifts, volume profile, and
sentiment momentum) into a cohesive product experience inside the morning brief and throughout
the trading day.

## User Goals
- Spot high-conviction downside setups before catalysts trigger gap moves.
- Understand which signals justify opening puts and the confidence level of the call.
- Receive proactive notifications when new bearish setups emerge or confirm.

## Product Pillars

### 1. Morning Brief Scanner Section
- **Placement**: Dedicated "Bearish Risk Radar" module in the morning brief below macro recap.
- **Content**:
  - Top 3-5 tickers ranked by a composite Drop Risk Score (weighted blend of skew, flow,
    regime, volume, sentiment).
  - Each entry shows:
    - Score and confidence percentile.
    - Key drivers (e.g., "Put skew 92nd percentile", "Block trades 3× average on bid").
    - Upcoming catalysts (earnings date, regulatory events, macro print).
    - Suggested actions: e.g., "Monitor for volume profile break; consider put debit spread".
  - Include sparkline of last 5 days of composite score for trend context.
- **Interactivity**: Click-through opens detailed signal breakdown view.

### 2. Real-Time Monitoring Dashboard
- **Destination**: Standalone "Risk Moves" tab accessible from main navigation.
- **Features**:
  - Live ticker table with sortable columns (score, change vs prior close, IV percentile,
    sentiment delta).
  - Filter presets (e.g., "Mega-cap tech", "Upcoming earnings", "High IV expansion").
  - Signal detail drawer per ticker showing raw metrics, historical percentiles, and
    annotated price chart with regime flags.
  - Backtesting widget summarizing how often similar signal stacks led to ≥5% drawdowns.

### 3. Notification System
- **Triggers**:
  - Score crosses high-risk threshold (e.g., >70) or increases by >20 pts intraday.
  - Divergence resolved (signals align after disagreement penalty drops).
  - Catalyst proximity (T-1 day) when signals already elevated.
- **Channels**: in-app alerts, push notifications (mobile), optional email summary.
- **Content**: concise message with ticker, score, driving signal(s), suggested next step.

## Data & Signal Infrastructure
- **Continuous Scanning**: Run enhanced bias engine + legacy stack hourly during market hours;
  lighter cadence (every 3h) pre/post market. Stream results to `drop_risk_signals` table.
- **Composite Score**: Weighted ensemble with tunable weights via feature flags; include
  disagreement penalty to avoid false positives.
- **Historical Baselines**: Maintain rolling percentiles per ticker for skew, flow, sentiment.
- **Catalyst Calendar**: Merge internal `macro_events` and `earnings_calendar` tables to annotate
  risk entries.

## User Trust & Education
- **Explainability**: Provide tooltips and "Why this alert" modals referencing contributing
  signals and historical hit rates.
- **Playbook Links**: Each alert links to strategy guides (e.g., debit spreads vs naked puts).
- **Post-Move Recaps**: Automated recap the morning after significant drop showing signal
  performance and lessons.

## Success Metrics
- Alert precision/recall for ≥5% drawdowns within 5 trading days.
- User engagement: click-through rate on alerts, time spent in Risk Moves tab.
- Conversion: percentage of alerts leading to trades logged via brokerage integration.

## Roadmap
1. **MVP (2 sprints)**: Morning brief module + hourly scanning backend + in-app alerts.
2. **Iteration**: Add catalyst overlays, push notifications, and backtesting widget.
3. **Optimization**: Machine-learned weights, personalized thresholds per user profile.

