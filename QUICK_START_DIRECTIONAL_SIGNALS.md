# Quick Start Guide: Directional Prediction Signals

## 🎯 What Problem Does This Solve?

**Before**: You see multiple Amazon options (calls AND puts) with similar scores. Which one should you trade?

**After**: Clear directional guidance tells you "BULLISH 78% confidence - favor calls over puts" with detailed reasoning.

---

## ⚡ Quick Usage

### 1. Run a scan:
```bash
PYTHONPATH=. ./venv/bin/python3 -m src.scanner.service --max-symbols 5
```

### 2. Check the frontend:
```bash
npm run dev
```

### 3. Look for the purple "📊 Directional Prediction" card on each opportunity

---

## 📊 Understanding the Display

### **Direction Badge**:
- 🟢 **BULLISH** = Stock likely to go UP → Favor CALLS
- 🔴 **BEARISH** = Stock likely to go DOWN → Favor PUTS
- ⚪ **NEUTRAL** = No clear direction → Consider other factors

### **Confidence %**:
- **75-100%** = Strong conviction, high reliability
- **60-75%** = Moderate conviction, decent reliability
- **45-60%** = Weak conviction, low reliability
- **<45%** = Very weak, essentially neutral

### **Recommendation**:
Plain English explanation of what to do

### **Contributing Signals**:
Breakdown showing WHY we made this prediction:
- **Options Skew**: Market maker pricing analysis
- **Smart Money Flow**: Institutional order flow detection

---

## 🔬 The Signals Explained

### **Options Skew Analyzer** (55% weight)
**What it measures**: Are OTM calls or puts priced higher?

**How to read it**:
- "Call skew detected" = Bullish (calls more expensive)
- "Put skew detected" = Bearish (puts more expensive)
- "Flat skew" = Neutral (similar pricing)

**Why it works**: Market makers have billions on the line. When they charge more for puts, they're hedging downside risk. When calls cost more, they see upside risk.

**Confidence**: Higher when skew is extreme (>5% difference)

---

### **Smart Money Flow Detector** (45% weight)
**What it measures**: Unusual volume and institutional order flow

**How to read it**:
- "Call volume 120% above average" = Bullish
- "Put volume 85% above average" = Bearish
- "Block trades in calls" = Institutional bullish positioning

**Why it works**: Large orders from hedge funds and institutions can't hide. Following "smart money" beats following retail sentiment.

**Confidence**: Higher when volume is very unusual (>2x average) and block trades detected

---

## 🎮 Real Example

```
Symbol: AMZN
Options available:
  - AMZN $185 Call @ $5.20 (Score: 88)
  - AMZN $185 Put @ $4.80 (Score: 86)

📊 Directional Prediction
BULLISH | 78% Confidence

Strong bullish bias - favor calls over puts. Multiple signals confirm this direction.

Contributing Signals:
  ✓ Options Skew (bullish, 72%): Call skew detected - OTM calls priced 4.5% higher
    than OTM puts relative to ATM. Market makers pricing higher risk to upside.

  ✓ Smart Money Flow (bullish, 85%): Call volume 120% above average, with aggressive
    buying detected. Block trades in calls suggest institutional bullish positioning.

Decision: Trade the CALL, not the PUT ✅
```

---

## ⚠️ Important Notes

### **When Signals Disagree**:
If Options Skew says "bearish" but Smart Money Flow says "bullish", the confidence will be lower (typically 45-55%). This is your cue to be cautious or wait for clearer setup.

### **Directional Conflicts**:
If you see a PUT option with a "BULLISH" bias, that's a red flag. The signal is saying the stock will go UP, but you're looking at a PUT (which profits when stock goes DOWN). Consider the CALL instead.

### **Low Confidence (<50%)**:
When confidence is low, the signals don't have strong conviction. Don't ignore other factors (Greeks, IV rank, fundamentals). The directional signal is just one input.

---

## 🛠️ Technical Details

### **Data Sources**:
- Full options chain (all strikes and expirations)
- Historical average volume (for comparison)
- Current market price and implied volatility
- Bid/ask spreads (for aggression detection)

### **Calculation Frequency**:
- Signals are calculated real-time during each scan
- No caching (always fresh data)
- Typical calculation time: ~50ms per symbol

### **Accuracy Tracking** (Coming Soon):
Future versions will track prediction outcomes and display historical accuracy:
- "This signal has 67% accuracy over the last 30 days"
- "High-confidence predictions (>75%) have 78% accuracy"

---

## 🚀 Next Features (Roadmap)

### **Phase 2 Signals** (Coming in 1-2 months):
1. Volume Profile Momentum
2. Mean Reversion vs Momentum Regime Detection
3. Earnings Cycle Alpha
4. Sector Relative Strength Rotation
5. Put/Call Ratio Extremes

### **Phase 3 Enhancements** (2-3 months):
- ML-optimized signal weights
- Historical accuracy tracking and display
- Per-symbol signal customization
- Backtesting framework

### **Phase 4 UX Improvements** (3-4 months):
- Filter by directional bias
- Side-by-side call vs put comparison
- Directional conflict warnings
- Signal performance leaderboard

---

## 📚 Advanced Usage

### **Customizing Signal Weights**:
Edit `src/scanner/service.py` line 77-80:
```python
self.signal_aggregator = SignalAggregator([
    OptionsSkewAnalyzer(weight=0.60),  # Increase skew weight
    SmartMoneyFlowDetector(weight=0.40),  # Decrease flow weight
])
```

### **Adding New Signals**:
1. Create new class in `src/signals/your_signal.py` extending `Signal`
2. Implement `calculate()` and `get_required_data()` methods
3. Add to SignalAggregator in scanner service
4. Adjust weights so they sum to 1.0

### **Testing Signals**:
```bash
./venv/bin/python3 -c "
from src.signals import OptionsSkewAnalyzer, SmartMoneyFlowDetector, SignalAggregator
import pandas as pd

# Create test data
options_chain = pd.DataFrame({
    'type': ['call', 'put'],
    'strike': [185, 185],
    'impliedVolatility': [0.45, 0.35],
    'volume': [1000, 500],
    'openInterest': [2000, 1000],
    'lastPrice': [5.0, 2.0],
    'bid': [4.8, 1.8],
    'ask': [5.2, 2.2],
})

# Test aggregator
aggregator = SignalAggregator([
    OptionsSkewAnalyzer(),
    SmartMoneyFlowDetector(),
])

data = {
    'options_chain': options_chain,
    'options_data': options_chain,
    'stock_price': 180.0,
    'atm_iv': 0.40,
    'historical_volume': {'avg_call_volume': 800, 'avg_put_volume': 600},
    'price_change': 2.0,
}

result = aggregator.aggregate('TEST', data)
print(f'Direction: {result.direction.value}')
print(f'Confidence: {result.confidence:.1f}%')
print(f'Recommendation: {result.recommendation}')
"
```

---

## 🐛 Troubleshooting

### **"No directional bias showing"**:
- Check that scanner is using latest code: `./venv/bin/python3 -m src.scanner.service`
- Verify options chain has sufficient data (need calls AND puts with volume)
- Check browser console for errors

### **"All signals show NEUTRAL"**:
- Options chain might be too sparse (need 4+ liquid options)
- IV data might be missing or invalid
- Volume might be very low (need >200 volume, >1000 OI)

### **"Confidence is always low"**:
- Signals might be disagreeing (one bullish, one bearish)
- Options data quality might be poor
- Try scanning more liquid symbols (AAPL, TSLA, AMZN, SPY)

---

## 📞 Support

**Documentation**:
- Full plan: `DIRECTIONAL_PREDICTION_PLAN.md`
- Implementation details: `IMPLEMENTATION_SUMMARY.md`
- This guide: `QUICK_START_DIRECTIONAL_SIGNALS.md`

**Code Locations**:
- Signals: `src/signals/`
- Scanner integration: `src/scanner/service.py`
- Frontend display: `app/page.tsx` (line 1536+)
- Tests: `tests/signals/`

---

## ✅ Quick Checklist

Before deploying:
- [ ] Build succeeds: `npm run build`
- [ ] Scanner initializes: `from src.scanner.service import SmartOptionsScanner`
- [ ] Signals import: `from src.signals import SignalAggregator`
- [ ] Frontend displays bias cards (check in browser)
- [ ] No console errors

After deploying:
- [ ] Run scan and verify bias appears in JSON
- [ ] Check frontend renders bias cards correctly
- [ ] Verify confidence scores are reasonable (30-90% range)
- [ ] Test with multiple symbols (AAPL, TSLA, AMZN)

---

🎉 **You're ready to use directional prediction signals!**

Start with small position sizes while you build confidence in the system. Track which predictions are accurate. Share feedback on what works and what doesn't.

Happy trading! 📈
