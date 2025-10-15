# Initial Scan Data - What's Included in Fast Results

## Overview

The **fast initial scan** (2-3 minutes) includes comprehensive analysis for filtering and decision-making. Users get everything they need to evaluate opportunities, with optional deep-dive enhancements available on-demand.

## ✅ What's INCLUDED in Initial Scan

### 1. Basic Opportunity Data
```json
{
  "symbol": "AAPL",
  "optionType": "call",
  "strike": 180,
  "expiration": "2025-11-15",
  "premium": 250,              // Premium per contract ($250)
  "bid": 240,
  "ask": 260,
  "stockPrice": 175.50,
  "daysToExpiration": 30,
  "score": 85.3                // Overall opportunity score
}
```

### 2. Sentiment Analysis (Bullish/Bearish) ✅
```json
{
  "swingSignal": {
    "symbol": "AAPL",
    "compositeScore": 78.5,
    "classification": "BULLISH",  // BULLISH, BEARISH, NEUTRAL
    "factors": [
      {
        "name": "Price Action",
        "score": 82.0,
        "rationale": "Strong uptrend with higher highs",
        "details": {...}
      },
      {
        "name": "Volume Profile",
        "score": 75.0,
        "rationale": "Above-average buying volume",
        "details": {...}
      },
      {
        "name": "Technical Indicators",
        "score": 80.0,
        "rationale": "RSI showing strength, MACD bullish crossover",
        "details": {...}
      }
    ]
  },
  "directionalBias": {
    "bias": "bullish",
    "strength": 0.75,
    "signals": ["momentum", "volume", "technicals"]
  }
}
```

### 3. Volume & Liquidity ✅
```json
{
  "volume": 1250,              // Daily contract volume
  "openInterest": 5000,        // Total open contracts
  "volumeRatio": 0.25,         // volume / openInterest
  "impliedVolatility": 0.35,   // 35% IV
  "ivRank": 67.5,              // IV rank (0-100)
  "_dataQuality": {
    "quality": "HIGH",         // HIGH, GOOD, ACCEPTABLE, LOW, REJECTED
    "score": 85,
    "issues": [],
    "warnings": [],
    "priceSource": "live"
  }
}
```

### 4. Greeks ✅
```json
{
  "greeks": {
    // Standard Greeks (always included)
    "delta": 0.45,             // Price sensitivity
    "gamma": 0.05,             // Delta rate of change
    "theta": -0.15,            // Time decay per day
    "vega": 0.25,              // IV sensitivity
    "rho": 0.08,               // Interest rate sensitivity

    // Enhanced Greeks (from institutional scanner)
    "lambda": 5.2              // Leverage ratio
  },
  "enhancedAnalysis": {
    "greeks": {
      // Advanced Greeks (if needed for analysis)
      "charm": -0.002,         // Delta decay over time
      "color": 0.001,          // Gamma decay over time
      "speed": 0.003,          // Gamma sensitivity to price
      "zomma": 0.002,          // Gamma sensitivity to IV
      "ultima": 0.001          // Vomma sensitivity to IV
    }
  }
}
```

### 5. Probability Analysis ✅
```json
{
  "probabilityOfProfit": 62.5,    // Basic probability
  "enhancedAnalysis": {
    "probabilityAnalysis": {
      "probabilityOfProfit": 0.625,        // Institutional calculation
      "probabilityITM": 0.55,              // Probability in-the-money
      "probabilityTouch": 0.72,            // Probability of touching strike
      "expectedValue": 42.50,              // Expected $ value
      "confidenceInterval": [35, 52],      // 95% confidence range
      "breakeven": 177.50,
      "maxLoss": 250,
      "method": "black-scholes-merton"
    }
  }
}
```

### 6. Risk Metrics ✅
```json
{
  "riskLevel": "medium",             // low, medium, high, extreme
  "potentialReturn": 45.2,           // % return on premium
  "maxReturn": 120.0,                // Maximum possible % return
  "maxLoss": 100.0,                  // Maximum loss (premium = 100%)
  "breakevenPrice": 177.50,
  "breakevenMovePercent": 1.14,      // % move needed for breakeven
  "riskRewardRatio": 2.65,           // Reward/risk ratio
  "enhancedAnalysis": {
    "riskMetrics": {
      "compositeScore": 78.5,
      "riskAdjustedScore": 72.3,     // Score adjusted for risk
      "scoreBreakdown": {
        "qualityScore": 85,
        "probabilityScore": 75,
        "greeksScore": 68,
        "liquidityScore": 82
      }
    }
  }
}
```

### 7. Position Sizing ✅
```json
{
  "positionSizing": {
    "recommendedFraction": 0.025,      // 2.5% of portfolio
    "conservativeFraction": 0.015,     // 1.5% conservative
    "aggressiveFraction": 0.035,       // 3.5% aggressive
    "kellyFraction": 0.042,            // Kelly criterion suggests 4.2%
    "expectedLogGrowth": 0.0018,       // Expected growth per trade
    "expectedEdge": 0.15,              // 15% edge
    "riskBudgetTier": "balanced",      // conservative, balanced, aggressive
    "rationale": [
      "Kelly fraction of 4.2% based on 62.5% win probability",
      "Position sized to 2.5% with expected growth of 0.18% per trade",
      "Risk-of-ruin controls keep drawdown under 25%"
    ],
    "capitalAllocationExamples": [
      {
        "portfolio": 10000,
        "contracts": 1,
        "capitalAtRisk": 250,
        "allocationPercent": 2.5
      }
    ]
  }
}
```

### 8. Trade Reasoning ✅
```json
{
  "reasoning": [
    "High IV rank (67.5th percentile) suggests favorable entry",
    "Strong bullish momentum with confirming volume",
    "Delta of 0.45 provides good leverage with manageable risk",
    "Tight bid-ask spread (8%) indicates good liquidity"
  ],
  "catalysts": [
    "Earnings announcement in 2 weeks",
    "Product launch expected this month",
    "Analyst upgrades increasing"
  ],
  "patterns": [
    "Bullish flag pattern forming",
    "Support holding at $172",
    "Volume increasing on up days"
  ]
}
```

---

## ❌ What's NOT INCLUDED (On-Demand Only)

### 1. Historical Backtesting
**Why excluded:** Takes 5-10 seconds per opportunity
**How to get:** Click "Backtest (365 days)" button
**What you get:** Win rate, avg return, Sharpe ratio over past year

### 2. Historical Price Patterns
**Why excluded:** Takes 3-5 seconds per opportunity
**How to get:** Click "Historical Patterns" button
**What you get:** Frequency of similar moves, recent examples

---

## Summary: What You Can Do With Initial Scan Data

### Immediate Filtering ✅
- Filter by sentiment: "Show only BULLISH opportunities"
- Filter by Greeks: "Show only delta > 0.40"
- Filter by quality: "Show only HIGH quality data"
- Filter by volume: "Show only volume > 1000"

### Immediate Decision Making ✅
- **Sentiment:** Is the market bullish/bearish on this symbol?
- **Risk:** What's my maximum loss? What's the risk level?
- **Probability:** What's my chance of profit?
- **Greeks:** How sensitive is this to price/time/IV?
- **Volume:** Is there enough liquidity to trade?
- **Position Size:** How much should I allocate?

### Optional Deep Dive 🔍
- Click "Backtest" → See historical performance
- Click "Historical Patterns" → See if similar moves happened before

---

## Frontend Display Recommendations

### Card Layout

```
┌────────────────────────────────────────────────┐
│ AAPL $180 Call • Expires Nov 15               │
│                                                │
│ 📊 Score: 85.3                                │
│ 💰 Premium: $250                              │
│                                                │
│ ┌──────────────────────────────────────────┐  │
│ │ 📈 BULLISH SIGNAL (78.5/100)            │  │
│ │ • Strong uptrend with higher highs       │  │
│ │ • Above-average buying volume            │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ Volume: 1,250 • OI: 5,000 ✅                  │
│ Quality: HIGH ✅                               │
│                                                │
│ Greeks: Δ 0.45 • Γ 0.05 • Θ -0.15 • V 0.25   │
│                                                │
│ Win Probability: 62.5%                        │
│ Risk/Reward: 2.65x                            │
│ Recommended Size: 2.5% ($250 of $10k)         │
│                                                │
│ [🔍 Backtest (365 days)]                     │
│ [📊 Historical Patterns]                      │
└────────────────────────────────────────────────┘
```

### Color Coding
- **Bullish signal:** Green badge
- **Bearish signal:** Red badge
- **Neutral signal:** Gray badge
- **High volume:** Green checkmark
- **Low volume:** Yellow warning
- **High quality:** Green checkmark
- **Low quality:** Red X

### Priority Sorting Options
1. By score (default)
2. By sentiment strength (show strongest bullish/bearish first)
3. By volume (most liquid first)
4. By probability (highest win rate first)
5. By risk-adjusted score

---

## Example: Complete Opportunity Object

See the full JSON structure in the codebase at:
- Scanner output: `src/scanner/service.py` (line ~836)
- Enhanced output: `src/scanner/enhanced_service.py` (line ~259)

Key point: **Everything you need for decision-making is in the initial scan!**

Backtesting and historical analysis are **optional confirmations**, not requirements for evaluation.
