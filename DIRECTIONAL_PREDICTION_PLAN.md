# Proprietary Directional Prediction System
## Comprehensive Plan for Predictive Stock Movement Analysis

**Goal**: Build a completely novel, data-driven directional bias system that predicts which way a stock is likely to move with quantifiable confidence, helping users choose between calls and puts on the same underlying.

---

## Current State Analysis

### What We Have:
- Basic directional bias calculation in `service.py:697`
- Swing signal analysis with momentum, news sentiment, and volatility
- Options flow data (volume, open interest)
- Greeks calculations (delta, gamma, theta, vega)
- IV rank tracking with historical data
- Price history and technical indicators
- News sentiment analysis

### What's Missing:
- **Predictive power scoring** - How often are our signals right?
- **Multi-timeframe analysis** - Short vs medium vs long-term trends
- **Order flow intelligence** - Smart money vs retail activity
- **Options skew analysis** - Market maker positioning
- **Volume profile analysis** - Support/resistance levels with volume
- **Earnings cycle patterns** - Systematic behavior around catalysts
- **Sector rotation signals** - Relative strength within industries
- **Put/call ratio analysis** - Aggregate sentiment indicators
- **Dark pool activity** - Institutional positioning
- **Historical pattern matching** - Similar setups from the past

---

## Novel Predictive Signals to Build

### 1. **Smart Money Flow Detector** (HIGH IMPACT)
**Theory**: Large institutional orders leave footprints in volume, price action, and options flow that retail traders miss.

**Data Sources**:
- Block trades (>10,000 shares or >$200k notional)
- Unusual options activity (volume >> 3x avg, OI spike)
- Bid/ask pressure analysis (which side is getting hit)
- Time & sales data (aggressive vs passive fills)

**Calculations**:
```python
smart_money_score = (
    block_trade_frequency * 30 +
    unusual_options_flow * 25 +
    bid_ask_aggression * 20 +
    large_order_direction * 25
)
```

**Confidence Metric**: Track hit rate over 30/60/90 days to validate predictive power

---

### 2. **Options Skew Predictor** (HIGH IMPACT)
**Theory**: When market makers price OTM puts higher than OTM calls (or vice versa), they're revealing their risk assessment.

**Data Sources**:
- IV skew curve across strikes
- Put/call IV ratio by moneyness
- Risk reversal pricing (25-delta put vs call)
- Term structure of volatility

**Calculations**:
```python
# Skew favors direction when OTM options in that direction are cheaper
put_skew = avg_otm_put_iv - atm_iv
call_skew = avg_otm_call_iv - atm_iv

skew_signal = {
    "direction": "bullish" if put_skew > call_skew else "bearish",
    "magnitude": abs(put_skew - call_skew) / atm_iv,
    "confidence": min(100, magnitude * 100)
}
```

**Why It Works**: Market makers have better information and hedge books worth millions. Their pricing reveals edge.

---

### 3. **Volume Profile Momentum** (MEDIUM-HIGH IMPACT)
**Theory**: Volume concentration at specific price levels creates support/resistance. Price moving through high-volume nodes with momentum predicts continuation.

**Data Sources**:
- Intraday volume by price level (volume profile)
- Point of control (POC) - highest volume price
- Value area (70% of volume traded)
- Distance from POC

**Calculations**:
```python
# If price is breaking through high-volume area with strong volume
if current_price > poc and volume > avg_volume * 1.5:
    bullish_breakout_signal = True
    confidence = (volume / avg_volume) * proximity_to_poc
```

---

### 4. **Mean Reversion vs Momentum Regime Detection** (HIGH IMPACT)
**Theory**: Markets alternate between trending (momentum) and ranging (mean reversion). Identifying the current regime predicts which strategies work.

**Data Sources**:
- ADX (Average Directional Index) for trend strength
- Bollinger Band width for volatility regime
- Linear regression R-squared for trend quality
- Hurst exponent for persistence vs mean reversion

**Calculations**:
```python
regime_score = {
    "trending": (adx > 25) and (r_squared > 0.5),
    "ranging": (adx < 20) and (bb_width < historical_avg),
    "confidence": calculate_regime_confidence(adx, r_squared, hurst)
}

# In trending regime: follow momentum
# In ranging regime: fade extremes
```

---

### 5. **Earnings Cycle Alpha** (MEDIUM IMPACT)
**Theory**: Stocks exhibit predictable patterns in different phases of the earnings cycle. Post-earnings drift, pre-earnings run-up, etc.

**Data Sources**:
- Days until next earnings
- Historical performance in similar earnings phases
- Guidance patterns (beat/miss/raise/lower)
- Options IV crush patterns post-earnings

**Calculations**:
```python
earnings_phase_signal = {
    "pre_earnings_runup": days_to_earnings in [5, 15] and historical_runup_avg > 2%,
    "post_earnings_drift": days_since_earnings < 10 and beat_rate > 0.7,
    "dead_zone": days_to_earnings in [20, 60],  # Avoid low-conviction periods
}
```

---

### 6. **Sector Relative Strength Rotation** (MEDIUM IMPACT)
**Theory**: Money rotates between sectors. Stocks outperforming their sector often continue, and sector leaders predict individual stock direction.

**Data Sources**:
- Stock performance vs sector ETF (e.g., AMZN vs XLY)
- Sector performance vs SPY
- Relative strength index (RSI) comparisons
- Money flow into/out of sector

**Calculations**:
```python
relative_strength = {
    "vs_sector": (stock_return_30d - sector_return_30d) / sector_volatility,
    "vs_market": (stock_return_30d - spy_return_30d) / spy_volatility,
    "sector_momentum": sector_return_5d / market_return_5d,
    "signal": "bullish" if all_positive else "bearish"
}
```

---

### 7. **Dark Pool & Institutional Flow** (HIGH IMPACT - if data accessible)
**Theory**: Institutional orders executed in dark pools precede public market moves.

**Data Sources** (if available):
- Dark pool volume percentage
- Dark pool sentiment (buy vs sell imbalance)
- Institutional ownership changes (13F filings)
- ETF flows (are funds buying/selling this stock?)

**Calculations**:
```python
institutional_signal = {
    "dark_pool_bullish": dark_pool_buy_vol > dark_pool_sell_vol * 1.5,
    "etf_inflows": net_etf_flow > 0,
    "insider_activity": recent_insider_buys - recent_insider_sells,
    "confidence": combine_institutional_factors()
}
```

---

### 8. **Historical Pattern Matching** (MEDIUM IMPACT)
**Theory**: Similar technical setups in the past produced similar outcomes. Machine learning can identify these patterns.

**Data Sources**:
- Price action patterns (last 30/60/90 days)
- Volume patterns
- Options flow patterns
- Outcome data (what happened next?)

**Calculations**:
```python
# Find similar historical setups using distance metrics
similar_patterns = find_nearest_neighbors(
    current_features=[price_pattern, volume_pattern, iv_rank],
    historical_database=pattern_db,
    k=50  # Top 50 most similar
)

# Calculate success rate of similar patterns
pattern_signal = {
    "direction": "bullish" if bull_outcomes > bear_outcomes else "bearish",
    "confidence": max(bull_outcomes, bear_outcomes) / len(similar_patterns),
    "sample_size": len(similar_patterns)
}
```

---

### 9. **Put/Call Ratio Extremes** (MEDIUM IMPACT)
**Theory**: Extreme put/call ratios are contrarian indicators. When everyone's bearish (high P/C), reversals happen.

**Data Sources**:
- Stock-level put/call ratio (volume and OI)
- Sector put/call ratio
- Market-wide put/call ratio (CBOE data)
- Historical percentiles of P/C ratio

**Calculations**:
```python
pc_ratio_signal = {
    "current_pc": put_volume / call_volume,
    "percentile": percentile_rank(current_pc, 90_day_history),
    "signal": {
        "extreme_bearish": percentile > 90,  # Contrarian bullish
        "extreme_bullish": percentile < 10,  # Contrarian bearish
        "neutral": 30 < percentile < 70
    }
}
```

---

### 10. **Implied Move vs Historical Move** (HIGH IMPACT)
**Theory**: Options pricing implies an expected move. When the implied move is much larger/smaller than historical volatility, there's edge.

**Data Sources**:
- ATM straddle pricing (implied move for expiration)
- Historical realized volatility
- Historical move sizes for same DTE
- Event calendars (earnings, FDA, etc.)

**Calculations**:
```python
implied_vs_realized = {
    "implied_move": atm_straddle_price / stock_price,
    "realized_move_avg": historical_move_std_for_dte,
    "ratio": implied_move / realized_move_avg,
    "edge": {
        "overpriced": ratio > 1.3,  # IV too high, sell premium
        "underpriced": ratio < 0.7,  # IV too low, buy premium
        "fair": 0.8 < ratio < 1.2
    }
}
```

---

## Implementation Architecture

### Phase 1: Data Infrastructure (Week 1-2)
1. **Create new data models** for each signal type
2. **Build data collectors** for new sources:
   - Block trade detector
   - IV skew analyzer
   - Volume profile builder
   - Historical pattern database
3. **Set up caching layer** - Don't recalculate expensive signals every scan
4. **Create data validation** - Ensure signal quality

### Phase 2: Signal Calculation Engine (Week 2-4)
1. **Implement each signal calculator** as a separate module
2. **Build confidence scoring** for each signal
3. **Create signal aggregation framework** - How to combine 10+ signals?
4. **Add historical tracking** - Store predictions and outcomes

### Phase 3: Validation & Backtesting (Week 4-6)
1. **Build backtesting framework** - Test signals on historical data
2. **Calculate hit rates** - Which signals actually predict direction?
3. **Optimize weights** - Machine learning to find best signal combination
4. **Create confidence calibration** - Is 70% confidence actually 70% accurate?

### Phase 4: UI/UX Integration (Week 6-7)
1. **Add directional bias display** to each opportunity card
2. **Show signal breakdown** - Which factors are bullish/bearish?
3. **Add filtering by direction** - "Show only bullish setups"
4. **Create directional conflict alerts** - Flag when signals disagree
5. **Build comparison view** - Side-by-side calls vs puts with bias

### Phase 5: Real-time Monitoring & Iteration (Ongoing)
1. **Track prediction accuracy** in production
2. **A/B test new signals** before full rollout
3. **Retrain ML models** monthly with new data
4. **Publish transparency report** - Show users which signals work best

---

## Proprietary Scoring Algorithm

### Master Directional Score Formula
```python
def calculate_master_directional_score(signals: Dict) -> DirectionalScore:
    """
    Combines all signals into a single directional prediction with confidence.

    Weight allocation (must sum to 100):
    - Smart Money Flow: 20%
    - Options Skew: 18%
    - Momentum Regime: 15%
    - Volume Profile: 12%
    - Relative Strength: 10%
    - Pattern Matching: 10%
    - Earnings Cycle: 8%
    - Put/Call Extremes: 7%

    Total: 100%
    """

    weighted_score = (
        signals.smart_money * 0.20 +
        signals.options_skew * 0.18 +
        signals.momentum_regime * 0.15 +
        signals.volume_profile * 0.12 +
        signals.relative_strength * 0.10 +
        signals.pattern_matching * 0.10 +
        signals.earnings_cycle * 0.08 +
        signals.put_call_extremes * 0.07
    )

    # Confidence based on signal agreement
    signal_directions = [s.direction for s in signals.values()]
    agreement_rate = max(
        signal_directions.count("bullish"),
        signal_directions.count("bearish")
    ) / len(signal_directions)

    confidence = min(95, agreement_rate * 100)

    # Adjust confidence by individual signal confidence
    avg_signal_confidence = np.mean([s.confidence for s in signals.values()])
    final_confidence = (confidence * 0.6) + (avg_signal_confidence * 0.4)

    return DirectionalScore(
        direction="bullish" if weighted_score > 0 else "bearish",
        score=abs(weighted_score),
        confidence=final_confidence,
        signals=signals,
        timestamp=datetime.now()
    )
```

---

## Success Metrics

### Week 1-2:
- [ ] All data collectors implemented and tested
- [ ] At least 5 signals calculating correctly
- [ ] Data quality > 95% (no NaN, proper types)

### Week 3-4:
- [ ] All 10 signals implemented
- [ ] Master scoring algorithm live
- [ ] Initial backtest results (need 60%+ accuracy)

### Week 5-6:
- [ ] Backtest accuracy > 62% overall
- [ ] High-confidence predictions (>70%) hit > 75%
- [ ] Signal weights optimized via ML

### Week 7:
- [ ] UI showing directional bias on all opportunities
- [ ] Users can filter by direction
- [ ] Comparison view for calls vs puts

### Month 2+:
- [ ] Live prediction tracking showing > 60% accuracy
- [ ] User feedback incorporated
- [ ] Edge maintained over time (no signal decay)

---

## Novel Edge Sources (Competitive Moats)

1. **Multi-signal fusion** - Most tools use 1-3 signals. We'll use 10+ with ML weighting.
2. **Confidence calibration** - Most tools say "bullish" without quantifying accuracy. We'll track and display real hit rates.
3. **Regime awareness** - Signals that work in trending markets fail in ranging markets. We'll adapt.
4. **Options-specific intel** - Most technical analysis ignores options data. Options volume, skew, and flow are leading indicators.
5. **Historical validation** - Every signal shows its own track record. Users trust what they can verify.
6. **Transparency** - Show users WHY we think it's bullish/bearish, not just the conclusion.

---

## Technical Stack

### Python Backend:
- **yfinance** - Price data, volume, fundamentals
- **pandas/numpy** - Data manipulation and calculations
- **scipy** - Statistical analysis (z-scores, correlations)
- **scikit-learn** - ML for pattern matching and weight optimization
- **ta-lib** (optional) - Technical indicators (ADX, RSI, etc.)

### Data Storage:
- **SQLite** - Store historical predictions and outcomes
- **Redis** (optional) - Cache expensive calculations
- **JSON files** - Signal configuration and weights

### Frontend:
- **React components** - Directional bias cards
- **Recharts** - Visualize signal strength
- **Color coding** - Green (bullish), Red (bearish), Gray (neutral)

---

## Risk Considerations

1. **Overfitting** - Too many signals might fit historical data but fail forward. Solution: Regular out-of-sample testing.
2. **Data quality** - Garbage in, garbage out. Solution: Strict validation and anomaly detection.
3. **Signal decay** - What works today might not work tomorrow. Solution: Continuous monitoring and retraining.
4. **False confidence** - Don't oversell accuracy. Solution: Conservative confidence scoring and transparency.
5. **Correlation not causation** - Signals might coincide with moves without causing them. Solution: Mechanistic reasoning for each signal.

---

## Next Steps

1. **Review and approve this plan**
2. **Prioritize signals** - Which 3-5 to build first?
3. **Set up development environment** - Ensure all data sources accessible
4. **Build Phase 1 (data infrastructure)**
5. **Implement first 3 signals with backtesting**
6. **Iterate based on results**

---

This plan creates a **genuinely proprietary system** that combines multiple edge sources into a unified, validated, transparent directional prediction framework. The key is not any single signal, but the **intelligent fusion** of many signals with proven track records.

Ready to start building? 🚀
