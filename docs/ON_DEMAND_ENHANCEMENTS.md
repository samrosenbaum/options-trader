# On-Demand Enhancement System

## Overview

Instead of running expensive analysis on ALL opportunities upfront (causing timeouts), we now use a **two-phase approach**:

1. **Phase 1: Fast Initial Scan** (2-3 minutes)
   - Shows opportunities with basic scoring immediately
   - NO backtesting, NO historical analysis
   - Runs every 10 minutes via cron jobs

2. **Phase 2: On-Demand Enhancements** (when user clicks buttons)
   - User sees opportunities and chooses which to analyze deeply
   - Each enhancement runs quickly on a single opportunity
   - Advanced analysis only when needed

## Why This Approach?

### The Old Way (Broken)
- Scanner tried to do EVERYTHING upfront for ALL opportunities
- 20 symbols × backtesting × historical analysis = 10-15 minutes
- Exceeded 4-minute timeout → failed
- Users got timeouts and no results

### The New Way (Fixed)
- Scanner does FAST basic analysis = 2-3 minutes ✅
- Shows opportunities immediately
- User clicks "Backtest" on opportunities they like
- That ONE opportunity gets 365-day backtest in ~5 seconds
- Much better UX and resource usage

## Available Enhancements

### 1. Backtest (365 days)
**Endpoint:** `POST /api/enhance/backtest`

Runs a full-year backtest on a single opportunity to show historical performance.

**Request:**
```json
{
  "symbol": "AAPL",
  "optionType": "call",
  "strike": 180,
  "stockPrice": 175.50,
  "premium": 250,
  "daysToExpiration": 30,
  "impliedVolatility": 0.35
}
```

**Response:**
```json
{
  "success": true,
  "backtest": {
    "symbol": "AAPL",
    "winRate": 62.5,
    "avgReturn": 15.3,
    "maxDrawdown": -45.2,
    "sharpeRatio": 1.45,
    "similarTradesFound": 48,
    "summary": "62.5% win rate over 48 similar trades in past 365 days",
    "confidence": "high"
  }
}
```

**When to use:**
- User sees an opportunity and wants to know historical win rate
- Before risking capital on a trade
- To validate that the strategy has worked historically

**Duration:** ~5-10 seconds per opportunity

---

### 2. Historical Patterns
**Endpoint:** `POST /api/enhance/historical`

Analyzes how often the stock has made similar moves in the past.

**Request:**
```json
{
  "symbol": "TSLA",
  "optionType": "put",
  "strike": 240,
  "stockPrice": 250,
  "premium": 350,
  "expiration": "2025-11-15"
}
```

**Response:**
```json
{
  "success": true,
  "historical": {
    "symbol": "TSLA",
    "available": true,
    "requiredMove": 4.0,
    "daysToExpiration": 30,
    "direction": "down",
    "historicalFrequency": 35.5,
    "recentExamples": [
      {"date": "2025-09-15", "move": -5.2, "achieved": true},
      {"date": "2025-08-03", "move": -3.1, "achieved": false}
    ],
    "summary": "35.5% chance of 4.0% down move in 30 days",
    "confidence": "high"
  }
}
```

**When to use:**
- To see if the required move is realistic based on history
- To understand stock volatility patterns
- Before betting on a large directional move

**Duration:** ~3-5 seconds per opportunity

---

### 3. Advanced Greeks (Future)
**Endpoint:** `POST /api/enhance/greeks`

Calculate exotic Greeks (charm, color, vomma, etc.) for sophisticated traders.

**Coming soon!**

---

### 4. Risk Deep Dive (Future)
**Endpoint:** `POST /api/enhance/risk`

Comprehensive risk analysis including stress testing and scenario analysis.

**Coming soon!**

---

## Implementation Guide

### Frontend Integration

Example React component:

```typescript
function OpportunityCard({ opportunity }) {
  const [backtest, setBacktest] = useState(null)
  const [loading, setLoading] = useState(false)

  const runBacktest = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/enhance/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: opportunity.symbol,
          optionType: opportunity.optionType,
          strike: opportunity.strike,
          stockPrice: opportunity.stockPrice,
          premium: opportunity.premium,
          daysToExpiration: opportunity.daysToExpiration,
          impliedVolatility: opportunity.impliedVolatility
        })
      })

      const data = await response.json()
      setBacktest(data.backtest)
    } catch (error) {
      console.error('Backtest failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="opportunity-card">
      <h3>{opportunity.symbol}</h3>
      <p>Score: {opportunity.score}</p>

      {/* Enhancement buttons */}
      <div className="enhancements">
        <button onClick={runBacktest} disabled={loading}>
          {loading ? 'Running...' : '🔍 Backtest (365 days)'}
        </button>

        {backtest && (
          <div className="backtest-results">
            <p>Win Rate: {backtest.winRate}%</p>
            <p>Avg Return: {backtest.avgReturn}%</p>
            <p>Sample: {backtest.similarTradesFound} trades</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

### Best Practices

1. **Show loading states**: Enhancements take 3-10 seconds
2. **Cache results**: Don't re-run if user clicks twice
3. **Show confidence**: Display "high/medium/low" confidence badges
4. **Graceful failures**: Some stocks may not have enough historical data
5. **Rate limiting**: Consider limiting enhancements per user

---

## Performance Characteristics

### Initial Scan
- **Symbols:** 20
- **Duration:** 2-3 minutes
- **Frequency:** Every 10 minutes (cron)
- **Results:** 10-20 opportunities (strict), 50-200 (relaxed)

### Enhancements (per opportunity)
- **Backtest (365 days):** 5-10 seconds
- **Historical Patterns:** 3-5 seconds
- **Advanced Greeks:** 1-2 seconds (future)
- **Risk Analysis:** 3-5 seconds (future)

### Why This Is Fast
- Only analyzes ONE opportunity at a time
- User only enhances opportunities they're interested in
- Parallelizable: can run multiple enhancements simultaneously
- No timeout issues: each enhancement completes in seconds

---

## Migration Notes

### Old Behavior
```python
# Scanner did EVERYTHING for ALL opportunities
for opportunity in opportunities:
    opportunity.backtest = run_backtest(365_days)  # 5-10 seconds × 20 = 100-200 seconds
    opportunity.historical = analyze_history()     # 3-5 seconds × 20 = 60-100 seconds
    # Total: 160-300 seconds just for enhancements!
```

### New Behavior
```python
# Scanner does BASIC analysis only
for opportunity in opportunities:
    opportunity.score = calculate_basic_score()  # <1 second × 20 = 20 seconds
    # User enhances specific opportunities on-demand
```

### Enabling Old Behavior (Not Recommended)
If you really need backtesting during the scan:
```bash
# In render.yaml or environment
DISABLE_BACKTESTING=0
```

But this will cause timeouts if scanning many symbols!

---

## Future Enhancements

### Planned Features
1. **Advanced Greeks** - Charm, color, vomma for sophisticated traders
2. **Risk Analysis** - Stress testing, scenario analysis, correlations
3. **Real-Time Updates** - WebSocket updates as market moves
4. **Batch Enhancements** - "Backtest top 5 opportunities"
5. **Smart Caching** - Cache enhancements for 24 hours

### UI Improvements
1. **Enhancement presets** - "Quick", "Standard", "Deep" analysis levels
2. **Comparison mode** - Compare backtest results across opportunities
3. **Historical charts** - Visualize historical move patterns
4. **Alert on completion** - Notify when enhancement finishes

---

## Troubleshooting

### Enhancement takes too long (>30 seconds)
- Check if symbol has sufficient historical data
- Reduce lookback period for that symbol
- Contact support if persistent

### Enhancement returns "insufficient data"
- Stock is too new (IPO < 1 year ago)
- Low options volume (< 100 contracts/day)
- Try a more liquid alternative

### Enhancement fails with 500 error
- Check server logs for Python errors
- Verify all required fields in request
- File issue with error details

---

## API Reference

All enhancement endpoints follow this pattern:

**Success Response:**
```json
{
  "success": true,
  "[enhancement_type]": { ... },
  "timestamp": "2025-10-15T18:00:00Z"
}
```

**Error Response:**
```json
{
  "error": "Description of what went wrong",
  "details": "Technical error message"
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid request (missing fields)
- `500` - Server error (check logs)
- `504` - Timeout (enhancement took >30s)

---

## Cost Analysis

### Old System
- **Scan duration:** 10-15 minutes
- **Timeout:** 4 minutes
- **Success rate:** 0% (always timed out)
- **User experience:** Frustrating, no results

### New System
- **Scan duration:** 2-3 minutes ✅
- **Timeout:** Never (stays under limit)
- **Success rate:** ~100%
- **Enhancement cost:** Only when user requests (5-10 seconds)
- **User experience:** Fast results + deep analysis on demand

### Resource Savings
- **Before:** 15 minutes × every scan = wasted compute
- **After:** 3 minutes × every scan + 5 seconds × selected opportunities
- **Example:** User scans 20 opportunities, backtests 3 they like
  - Total time: 180s scan + 15s enhancements = 195 seconds
  - vs 900+ seconds with old system (and timeouts!)

---

## Summary

This on-demand enhancement system provides the best of both worlds:
- **Fast initial results** so users aren't waiting
- **Deep analysis on demand** for opportunities they care about
- **No timeouts** because nothing takes longer than a few seconds
- **Better resource usage** because we only analyze what's needed

Perfect for active traders who want to quickly scan opportunities and then dive deep into the ones that look promising!
