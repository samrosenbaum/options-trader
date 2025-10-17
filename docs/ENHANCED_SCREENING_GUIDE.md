# Enhanced Options Screening Framework - Integration Guide

## Overview

The enhanced screening framework implements sophisticated multi-layer filtering based on institutional-grade criteria:

1. **Stock-level filters** (market cap, volume, price, EMA trend analysis)
2. **Options-specific filters** (OI, volume, bid-ask spread, IV rank)
3. **Trade structure parameters** (directional vs income strategies)
4. **Enhanced scoring system** (technical, probability, risk/reward, liquidity)
5. **Risk management rules** (position sizing, stop loss, profit targets)

## Quick Start

### 1. Import the Screening Modules

```python
from src.scanner.screening_criteria import (
    StockScreener,
    OptionsScreener,
    TradeStructureFilter,
    TradeScoreCalculator,
    RiskManagement,
    DIRECTIONAL_STRUCTURE,
    INCOME_STRUCTURE
)
```

### 2. Apply Stock-Level Filters

```python
# Check if stock meets minimum criteria
stock_passes, stock_reasons = StockScreener.passes_stock_filters(
    market_cap=5_000_000_000,  # $5B
    avg_volume=2_000_000,       # 2M shares/day
    price=45.50                 # $45.50/share
)

if not stock_passes:
    print(f"Stock rejected: {', '.join(stock_reasons)}")
```

### 3. Analyze Trend Direction

```python
# Get price history (need 50+ days for EMAs)
ticker = yf.Ticker("AAPL")
price_history = ticker.history(period="3mo")

# Analyze EMA alignment
trend_analysis = StockScreener.analyze_trend(price_history)

print(f"Trend: {trend_analysis.direction}")
print(f"EMA 20: ${trend_analysis.ema_20:.2f}")
print(f"EMA 50: ${trend_analysis.ema_50:.2f}")
print(f"Alignment Score: {trend_analysis.alignment_score:.1f}/100")
```

### 4. Filter Options by Quality

```python
# Check option liquidity and spreads
options_passes, options_reasons = OptionsScreener.passes_options_filters(
    open_interest=1500,
    volume=250,
    bid=5.40,
    ask=5.60,
    last_price=5.50,
    iv_rank=0.45  # 45th percentile
)

if options_passes:
    print("✅ Option passes quality filters")
```

### 5. Match Trade Structure

```python
# Determine if option fits directional or income strategy
structure_type = TradeStructureFilter.determine_best_structure(
    delta=0.50,
    days_to_expiration=60,
    probability_of_profit=0.52
)

print(f"Best fit: {structure_type}")  # "directional" or "income"

# Or explicitly check against a structure
directional_passes, reasons = TradeStructureFilter.passes_structure_filters(
    delta=0.50,
    days_to_expiration=60,
    probability_of_profit=0.52,
    structure=DIRECTIONAL_STRUCTURE
)
```

### 6. Calculate Enhanced Score

```python
# Calculate comprehensive trade score
score_breakdown = TradeScoreCalculator.calculate_trade_score(
    trend_alignment_score=75.0,      # From trend analysis
    probability_of_profit=0.52,       # 52%
    expected_return=550.0,            # $550 potential gain
    max_loss=550.0,                   # $550 max loss (premium)
    open_interest=3000,
    volume=1500,
    bid_ask_spread_pct=0.036          # 3.6%
)

print(f"Total Score: {score_breakdown['total_score']:.1f}/100")
print(f"  Technical:   {score_breakdown['technical_score']:.1f}")
print(f"  Probability: {score_breakdown['probability_score']:.1f}")
print(f"  Risk/Reward: {score_breakdown['risk_reward_score']:.1f}")
print(f"  Liquidity:   {score_breakdown['liquidity_score']:.1f}")
```

### 7. Calculate Position Size

```python
# Determine how many contracts to trade
position_size = RiskManagement.calculate_position_size(
    account_value=50000,           # $50k account
    risk_per_trade_pct=0.02,       # 2% risk
    option_price=5.50,             # $5.50 premium
    max_loss=5.50                  # Max loss = premium
)

print(f"Trade {position_size['contracts']} contracts")
print(f"Capital required: ${position_size['dollar_amount']:.2f}")
print(f"Risk: {position_size['risk_percent']:.1f}%")
```

## Integration with Existing Scanner

### Option 1: Add Filters to Scanner Service

In `src/scanner/service.py`, add enhanced filtering after initial liquidity filters:

```python
from src.scanner.screening_criteria import (
    StockScreener, OptionsScreener, TradeScoreCalculator
)

# In your scanning loop...
for symbol in symbols:
    # ... fetch options data ...

    # Apply stock filters
    stock_passes, _ = StockScreener.passes_stock_filters(
        market_cap=stock_info['marketCap'],
        avg_volume=stock_info['avgVolume'],
        price=stock_price
    )

    if not stock_passes:
        continue

    # Analyze trend
    trend_analysis = StockScreener.analyze_trend(price_history)

    # Filter each option
    for option in options_chain:
        # Apply options filters
        options_passes, _ = OptionsScreener.passes_options_filters(
            open_interest=option['openInterest'],
            volume=option['volume'],
            bid=option['bid'],
            ask=option['ask'],
            last_price=option['lastPrice'],
            iv_rank=option.get('ivRank')
        )

        if not options_passes:
            continue

        # Calculate enhanced score
        score_breakdown = TradeScoreCalculator.calculate_trade_score(
            trend_alignment_score=trend_analysis.alignment_score,
            # ... other parameters ...
        )

        # Add to results if score > threshold
        if score_breakdown['total_score'] >= 60:
            opportunities.append({
                # ... opportunity data ...
                'enhancedScore': score_breakdown['total_score'],
                'scoreBreakdown': score_breakdown
            })
```

### Option 2: Use as Post-Processing Filter

Apply enhanced screening to scanner results:

```python
from src.scanner.enhanced_scanner_example import apply_enhanced_screening

# After running normal scanner
initial_results = scanner.scan()

# Apply enhanced filters
enhanced_results = []
for result in initial_results:
    filtered = apply_enhanced_screening(
        symbol=result['symbol'],
        options_data=result['options'],
        stock_price=result['stockPrice'],
        market_cap=result['marketCap'],
        avg_volume=result['avgVolume'],
        strategy_preference="auto"
    )
    enhanced_results.extend(filtered)

# Sort by enhanced score
enhanced_results.sort(key=lambda x: x['enhancedScore'], reverse=True)
```

## Filter Thresholds (Customizable)

### Stock-Level Minimums
```python
StockScreener.MIN_MARKET_CAP = 2_000_000_000  # $2B
StockScreener.MIN_AVG_VOLUME = 1_000_000      # 1M shares
StockScreener.MIN_PRICE = 10.0                # $10
```

### Options-Level Minimums
```python
OptionsScreener.MIN_OPEN_INTEREST = 1000      # 1000 contracts
OptionsScreener.MIN_VOLUME = 100              # 100 contracts
OptionsScreener.MAX_BID_ASK_SPREAD_PCT = 0.05 # 5%
OptionsScreener.MIN_IV_RANK = 0.30            # 30th percentile
OptionsScreener.MAX_IV_RANK = 0.70            # 70th percentile
```

### Trade Structure Parameters

**Directional Strategy:**
- Delta: 0.40 to 0.60
- DTE: 45-90 days
- Probability of Profit: > 40%
- Target Return: 100%

**Income Strategy:**
- Delta: 0.20 to 0.30
- DTE: 30-45 days
- Probability of Profit: > 60%
- Target Return: 33%

## Risk Management Rules

### Position Sizing
- **Default Risk:** 1-3% per trade
- **Max Contracts:** 100
- **Min Contracts:** 1

### Exit Rules
```python
# Stop loss
if current_price <= entry_price * (1 - RiskManagement.STOP_LOSS_PCT):
    exit_position()  # -50% loss

# Profit targets
if current_price >= entry_price * (1 + RiskManagement.PROFIT_TARGET_PCT):
    close_half()  # +50% profit

if current_price >= entry_price * (1 + RiskManagement.FULL_EXIT_PCT):
    close_all()  # +100% profit
```

### Earnings Avoidance
```python
has_earnings, warning = RiskManagement.check_earnings_date(
    symbol="AAPL",
    expiration_date=option_expiration,
    earnings_dates=[upcoming_earnings_date]
)

if has_earnings:
    print(f"⚠️ {warning}")
    # Skip or adjust trade
```

## Scoring System Details

### Component Weights
- **Technical Alignment:** 30% (EMA trend + price position)
- **Probability of Profit:** 30% (statistical edge)
- **Risk/Reward Ratio:** 20% (expected return vs max loss)
- **Liquidity:** 20% (OI + volume + spreads)

### Score Interpretation
- **80-100:** Excellent opportunity
- **60-80:** Good opportunity
- **40-60:** Fair opportunity
- **< 40:** Weak opportunity (filter out)

## Testing

Run the example to see the framework in action:

```bash
cd /Users/samrosenbaum/options-trader
python -m src.scanner.enhanced_scanner_example
```

## Next Steps

1. **Test on Historical Data:** Backtest the filters to see how they would have performed
2. **Adjust Thresholds:** Tune filter values based on your risk tolerance
3. **Add Custom Filters:** Extend the framework with your own criteria
4. **Monitor Performance:** Track which filters produce the best results

## Files Reference

- **Main Module:** `src/scanner/screening_criteria.py`
- **Example Integration:** `src/scanner/enhanced_scanner_example.py`
- **This Guide:** `docs/ENHANCED_SCREENING_GUIDE.md`

## Questions?

The framework is modular - you can use individual filters or the complete system. Start with the stock and options filters, then gradually add trend analysis and enhanced scoring.
