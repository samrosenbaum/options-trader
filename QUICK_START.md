# Quick Start - Data Accuracy Improvements

## What Changed?

Your options scanner now tracks **price freshness** and **data quality** to ensure accurate recommendations.

## Test the Changes

### 1. Run the Integration Test

```bash
source venv/bin/activate
PYTHONPATH=. python tests/test_data_quality_integration.py
```

**Expected Output:**
```
============================================================
DATA QUALITY VALIDATION - INTEGRATION TEST SUITE
============================================================

HIGH QUALITY OPTION TEST - ✅ PASSED
MEDIUM QUALITY OPTION TEST - ✅ PASSED
REJECTED OPTION TEST - ✅ PASSED
STALE PRICE DETECTION TEST - ✅ PASSED
MARKET HOURS DETECTION TEST - ✅ PASSED

ALL TESTS PASSED ✅
```

### 2. Run the Scanner

```bash
source venv/bin/activate
python -m src.scanner.service --max-symbols 5
```

**Look for:**
- `⚠️  Rejected {symbol} - Quality issues: [...]` in console output
- Options with stale prices or low liquidity are auto-filtered

### 3. View in the UI

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Navigate to the options scanner page

3. **Look for the Data Quality Badge** on each opportunity:
   - 🟢 **Green = High Quality** - Fresh price, tight spreads
   - 🟡 **Yellow = Medium** - Some warnings
   - 🟠 **Orange = Low** - Multiple issues
   - 🔴 **Red = Rejected** - Poor quality, auto-filtered

## What Gets Validated?

### ✅ Price Freshness
- Real-time: `fast_info.last_price` (0s old)
- Recent: `intraday_1m` (<15 min old)
- Stale: `previousClose_STALE` (16+ hours old)

### ✅ Bid-Ask Spread
- Good: <5% spread
- Warning: 5-20% spread
- Issue: >20% spread

### ✅ Liquidity
- Volume: Should be >10 contracts
- Open Interest: Should be >100 contracts

### ✅ Implied Volatility
- Normal: 5-200%
- Suspicious: >500% (likely data error)

## Key Files

| File | Purpose |
|------|---------|
| `src/adapters/yfinance.py` | Enhanced price extraction |
| `src/adapters/base.py` | Metadata in OptionsChain |
| `src/validation/data_quality.py` | Quality validation logic |
| `src/scanner/service.py` | Auto-filtering integration |
| `components/data-quality-badge.tsx` | UI display component |
| `tests/test_data_quality_integration.py` | Integration tests |

## Example Data Quality Output

### Console (Scanner)
```
📊 Analyzing 1,247 liquid options...
⚠️  Rejected TSLA call $300 - Quality issues: ['Excessive bid-ask spread: 55%', 'Zero volume']
⚠️  Rejected AMD put $120 - Quality issues: ['Stock price is from previous close']
✅ Found 18 high-scoring opportunities
```

### UI (Opportunity Card)
```
┌─────────────────────────────────────────────┐
│ Data Quality: MEDIUM                        │
│ Score: 75/100                               │
│                                             │
│ Price Source: intraday_1m                   │
│ Price Age: 3m old                           │
│                                             │
│ ⚠️ Warnings:                                 │
│ • Stock price is 3.2 minutes old            │
│ • Wide bid-ask spread: 12.5%                │
└─────────────────────────────────────────────┘
```

## Common Scenarios

### Scenario 1: Market Hours - Fresh Data
**Expected:** Most opportunities show HIGH quality with `fast_info` source

### Scenario 2: After Hours - Stale Data
**Expected:** Opportunities flagged with warnings about `previousClose_STALE`

### Scenario 3: Low Liquidity Options
**Expected:** Auto-rejected with issues about volume/open interest

### Scenario 4: Wide Spreads
**Expected:** Warning or rejection based on spread percentage

## Troubleshooting

### "No opportunities found"
- ✅ **Good!** This means data quality standards are working
- Try lowering thresholds in `src/validation/data_quality.py`
- Or run during market hours for fresher data

### "All opportunities show previousClose"
- **Normal after market hours** - prices from 4pm ET close
- Run during market hours (9:30am - 4pm ET) for real-time data

### "Tests fail with ModuleNotFoundError"
```bash
# Make sure to set PYTHONPATH
PYTHONPATH=. python tests/test_data_quality_integration.py
```

## Next Steps

See `REVIEW_AND_RECOMMENDATIONS.md` for:
- Week 2-3: Consolidate probability/Greeks calculations
- Week 4-5: Add position sizing and risk management
- Week 6-8: Build backtesting framework
- Week 9+: Multi-source data aggregation

## Questions?

- 📖 Full details: `IMPROVEMENTS_IMPLEMENTED.md`
- 🗺️ Roadmap: `REVIEW_AND_RECOMMENDATIONS.md`
- 🧪 Run tests: `tests/test_data_quality_integration.py`
