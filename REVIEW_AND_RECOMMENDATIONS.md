# Options Trader: Comprehensive Code Review & Improvement Roadmap

**Date:** October 7, 2025
**Goal:** Transform the tool into a professional quant hedge fund-grade options scanner

---

## Executive Summary

Your options trading tool has a solid foundation with good architectural separation (Python backend, TypeScript frontend, multi-scorer framework). However, there are **critical data accuracy issues** and several areas requiring improvement to achieve institutional-grade reliability for finding asymmetric, high-probability options opportunities.

### Key Findings:
1. **Critical Data Accuracy Issue**: Stock price data can be stale or inconsistent
2. **Calculation Issues**: Risk/reward and probability calculations need refinement
3. **Scoring Logic**: Some scoring thresholds are arbitrary and not data-driven
4. **Missing Features**: No backtesting, position sizing, or real-time Greeks
5. **Data Sources**: Over-reliance on free yfinance API without fallbacks

---

## Critical Issues Requiring Immediate Attention

### 1. **Stock Price Data Accuracy Problem** 🚨

**Location:** `src/adapters/yfinance.py:90-139`

**Problem:**
The `_extract_price` method attempts multiple fallback sources but can return stale data:
- `fast_info` might be cached
- `history(period="1d", interval="1m")` could return after-hours prices
- `info['previousClose']` is yesterday's close

**Impact:**
If stock prices are incorrect, ALL calculations downstream are wrong:
- Strike selection (moneyness)
- Breakeven calculations
- Greeks calculations
- Risk/reward ratios

**Evidence of Issue:**
```python
# Falls back to previousClose which could be hours old
for key in ("currentPrice", "regularMarketPrice", "previousClose"):
    _add_candidate(info.get(key), candidates)
```

**Recommendation:**
```python
def _extract_price(self, ticker: yf.Ticker) -> tuple[float | None, str]:
    """Return the most up-to-date underlying price and source label."""

    candidates: List[tuple[float, str, int]] = []  # (price, source, priority)

    # Priority 1: Real-time fast_info
    try:
        fast_info = ticker.fast_info
        if hasattr(fast_info, 'last_price'):
            candidates.append((float(fast_info.last_price), 'live', 1))
    except:
        pass

    # Priority 2: Most recent intraday close (within last 15 min)
    try:
        history = ticker.history(period="1d", interval="1m")
        if not history.empty:
            last_timestamp = history.index[-1]
            minutes_old = (datetime.now(timezone.utc) - last_timestamp).total_seconds() / 60
            if minutes_old < 15:  # Only use if very recent
                candidates.append((float(history['Close'].iloc[-1]), f'intraday_{int(minutes_old)}m_old', 2))
    except:
        pass

    # Priority 3: Regular market price with staleness check
    try:
        info = ticker.info
        market_state = info.get('marketState', 'UNKNOWN')
        if market_state == 'REGULAR':
            candidates.append((float(info['regularMarketPrice']), 'regular_market', 3))
        else:
            # Market closed, use previous close but flag it
            candidates.append((float(info['previousClose']), f'previous_close_{market_state}', 4))
    except:
        pass

    if not candidates:
        return None, 'unavailable'

    # Return highest priority (lowest priority number)
    candidates.sort(key=lambda x: x[2])
    return candidates[0][0], candidates[0][1]
```

**Action Items:**
- [ ] Update `_extract_price` to return price + data source + timestamp
- [ ] Add staleness warnings in scanner output
- [ ] Reject options where stock price is >15 minutes old during market hours
- [ ] Add data quality metrics to each opportunity

---

### 2. **Inconsistent Probability Calculations**

**Locations:**
- `scripts/fetch_options_data.py:89-127` - Black-Scholes approximation
- `src/scanner/service.py:373-415` - Heuristic-based probability
- `lib/api/ai-analyzer.ts:92-106` - Simple IV rank calculation

**Problem:**
Three different methods calculate "probability of profit" with no clear reconciliation:

1. **fetch_options_data.py** uses normal distribution CDF (statistical)
2. **service.py** uses heuristic scoring (0-40 points converted to %)
3. **Frontend** doesn't recalculate, just displays what backend sends

**Example Issue:**
```python
# service.py:414-415
def estimate_probability_percent(self, probability_score: float) -> float:
    return float(max(5.0, min(92.0, probability_score * 2.4)))
```
This multiplies a 0-40 score by 2.4 to get a percentage - completely arbitrary!

**Recommendation:**
Consolidate to **one** probability calculation method using proper statistical models:

```python
from scipy.stats import norm
import numpy as np

def calculate_probability_of_profit(
    option_type: str,
    stock_price: float,
    strike: float,
    premium: float,
    implied_vol: float,
    days_to_expiration: int,
    risk_free_rate: float = 0.05
) -> dict:
    """
    Calculate probability of profit using delta and statistical distribution.

    Returns probability the option will be ITM at expiration by >= premium paid.
    """
    if days_to_expiration <= 0 or implied_vol <= 0:
        return {"probability": 0.0, "method": "expired_or_invalid"}

    # Calculate breakeven price
    breakeven = strike + premium if option_type == "call" else strike - premium

    # Time to expiration in years
    T = days_to_expiration / 365.0

    # Calculate the required move as a percentage
    required_move_pct = abs(breakeven - stock_price) / stock_price

    # Use log-normal distribution of stock prices
    # μ = ln(S) + (r - 0.5*σ²)*T
    # σ_stock = σ_IV * sqrt(T)

    drift = (risk_free_rate - 0.5 * implied_vol**2) * T
    diffusion = implied_vol * np.sqrt(T)

    # Z-score of breakeven in the distribution
    if option_type == "call":
        # P(S_T >= breakeven)
        z = (np.log(breakeven / stock_price) - drift) / diffusion
        probability = 1 - norm.cdf(z)
    else:
        # P(S_T <= breakeven)
        z = (np.log(breakeven / stock_price) - drift) / diffusion
        probability = norm.cdf(z)

    # Delta provides approximate probability of being ITM
    # Refine by comparing to delta-based estimate

    return {
        "probability": float(np.clip(probability, 0, 1)),
        "required_move_pct": required_move_pct,
        "breakeven_price": breakeven,
        "method": "lognormal_distribution",
        "implied_vol_annualized": implied_vol,
        "days_to_expiration": days_to_expiration
    }
```

**Action Items:**
- [ ] Replace all probability calculations with unified statistical method
- [ ] Add model validation against historical win rates
- [ ] Include confidence intervals in probability estimates
- [ ] Document assumptions clearly (no drift vs. risk-free drift)

---

### 3. **Potential Return Calculation Changed Recently**

**Location:** `lib/api/ai-analyzer.ts:97-107`

**Current Implementation:**
```typescript
function calculatePotentialReturn(
  type: "call" | "put",
  currentPrice: number,
  strike: number,
  premium: number,
): number {
  const targetPrice = type === "call" ? currentPrice * 1.1 : currentPrice * 0.9
  const intrinsicValue = type === "call" ? Math.max(0, targetPrice - strike) : Math.max(0, strike - targetPrice)
  // Return the potential dollar gain for a single contract (100 shares)
  return Math.max(0, intrinsicValue - premium) * 100
}
```

**Issues:**
1. Assumes exactly 10% move (arbitrary)
2. Returns **dollars**, not percentage ROI
3. Doesn't account for different expiration timeframes
4. No consideration of IV expansion/contraction

**Recommendation:**
```typescript
interface ReturnScenario {
  movePercent: number;
  targetPrice: number;
  intrinsicValue: number;
  extrinsicValue: number;  // Time value remaining
  totalValue: number;
  profitLoss: number;
  roiPercent: number;
  annualizedRoi: number;
}

function calculateReturnScenarios(
  type: "call" | "put",
  currentPrice: number,
  strike: number,
  premium: number,
  daysToExpiration: number,
  currentIV: number
): ReturnScenario[] {
  const scenarios: ReturnScenario[] = [];

  // Test multiple scenarios
  const moves = [0.05, 0.10, 0.15, 0.20, 0.30];

  for (const move of moves) {
    const targetPrice = type === "call"
      ? currentPrice * (1 + move)
      : currentPrice * (1 - move);

    const intrinsicValue = type === "call"
      ? Math.max(0, targetPrice - strike)
      : Math.max(0, strike - targetPrice);

    // Estimate remaining time value (decays as we approach expiration)
    // Assume we're calculating for halfway to expiration
    const timeRemaining = daysToExpiration / 2;
    const timeValueDecayFactor = Math.sqrt(timeRemaining / daysToExpiration);
    const extrinsicValue = Math.max(0, premium - Math.max(0,
      type === "call" ? currentPrice - strike : strike - currentPrice
    )) * timeValueDecayFactor;

    const totalValue = intrinsicValue + extrinsicValue;
    const profitLoss = (totalValue - premium) * 100;  // Per contract
    const roiPercent = (profitLoss / (premium * 100)) * 100;
    const annualizedRoi = roiPercent * (365 / Math.max(daysToExpiration / 2, 1));

    scenarios.push({
      movePercent: move * 100,
      targetPrice,
      intrinsicValue,
      extrinsicValue,
      totalValue,
      profitLoss,
      roiPercent,
      annualizedRoi
    });
  }

  return scenarios;
}
```

**Action Items:**
- [ ] Return multiple scenarios, not just one
- [ ] Include time value decay in calculations
- [ ] Calculate annualized returns for fair comparison
- [ ] Add expected value calculation (probability × return for each scenario)

---

## Moderate Priority Issues

### 4. **Greeks Calculations Have Multiple Implementations**

**Locations:**
- `lib/math/greeks.ts:91-133` - TypeScript Black-Scholes
- `scripts/fetch_options_data.py:42-86` - Python Black-Scholes
- `src/scanner/service.py:447-474` - Python heuristics

**Problem:**
Three different Greek calculation methods with no validation:
1. TypeScript uses proper Black-Scholes
2. Python fetch script uses scipy.stats.norm
3. Scanner service uses "approximate heuristics" (very inaccurate)

**Example of Problematic Heuristic:**
```python
# src/scanner/service.py:459-462
if option["type"] == "call":
    moneyness = (stock_price - strike) / max(stock_price, 0.01)
    delta = 0.5 + moneyness * 2.2  # Totally arbitrary formula!
```

**Recommendation:**
- Consolidate to **single implementation** using Black-Scholes in Python
- Expose via API endpoint that frontend calls
- Cache Greeks with options data
- Add Greeks validation (delta between -1 and 1, etc.)

```python
# Centralized in src/math/greeks.py
from scipy.stats import norm
import numpy as np

class BlackScholesGreeks:
    """Production-grade Greeks calculator with validation."""

    @staticmethod
    def calculate(
        option_type: str,
        S: float,  # Stock price
        K: float,  # Strike
        T: float,  # Time to expiration (years)
        sigma: float,  # Implied volatility
        r: float = 0.05,  # Risk-free rate
        q: float = 0.0  # Dividend yield
    ) -> dict:
        """Calculate all Greeks using Black-Scholes-Merton model."""

        # Input validation
        if T <= 0:
            return {"delta": 0, "gamma": 0, "theta": 0, "vega": 0, "rho": 0}

        if sigma <= 0:
            sigma = 0.01  # Minimum vol

        sqrt_T = np.sqrt(T)

        # Calculate d1 and d2
        d1 = (np.log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * sqrt_T)
        d2 = d1 - sigma * sqrt_T

        # Standard normal CDF and PDF
        if option_type.lower() == "call":
            delta = np.exp(-q * T) * norm.cdf(d1)
            theta_sign = -1
            rho = K * T * np.exp(-r * T) * norm.cdf(d2)
        else:  # put
            delta = -np.exp(-q * T) * norm.cdf(-d1)
            theta_sign = 1
            rho = -K * T * np.exp(-r * T) * norm.cdf(-d2)

        # Greeks common to both calls and puts
        gamma = np.exp(-q * T) * norm.pdf(d1) / (S * sigma * sqrt_T)
        vega = S * np.exp(-q * T) * norm.pdf(d1) * sqrt_T / 100  # Per 1% change
        theta = (
            theta_sign * (S * norm.pdf(d1) * sigma * np.exp(-q * T)) / (2 * sqrt_T)
            - r * K * np.exp(-r * T) * (norm.cdf(theta_sign * d2) if option_type == "call" else norm.cdf(-theta_sign * d2))
            + q * S * np.exp(-q * T) * (norm.cdf(theta_sign * d1) if option_type == "call" else norm.cdf(-theta_sign * d1))
        ) / 365  # Per day

        return {
            "delta": round(float(delta), 4),
            "gamma": round(float(gamma), 6),
            "theta": round(float(theta), 4),
            "vega": round(float(vega), 4),
            "rho": round(float(rho), 4),
            # Add metadata for debugging
            "_d1": float(d1),
            "_d2": float(d2),
            "_inputs": {"S": S, "K": K, "T": T, "sigma": sigma, "r": r, "q": q}
        }
```

**Action Items:**
- [ ] Create centralized `src/math/greeks.py` module
- [ ] Replace all heuristic calculations
- [ ] Add unit tests comparing to known option pricing values
- [ ] Include dividend yield in calculations for dividend-paying stocks

---

### 5. **Scoring System Lacks Empirical Validation**

**Location:** `src/scanner/service.py:257-294`, all scorer modules

**Problem:**
Scoring weights and thresholds appear arbitrary:

```python
# src/scanner/service.py:263-270
if volume_ratio > 4:
    score += 18
elif volume_ratio > 3:
    score += 15
elif volume_ratio > 2:
    score += 12
```

Why 18 points for >4x? Why not 20? Or 15? No empirical justification.

**Recommendation:**
Implement **backtesting framework** to optimize scoring weights:

```python
# src/backtesting/optimizer.py
from sklearn.ensemble import RandomForestRegressor
import pandas as pd

class ScoringOptimizer:
    """Optimize scoring weights based on historical performance."""

    def __init__(self, historical_opportunities: pd.DataFrame):
        """
        historical_opportunities should have columns:
        - All scoring features (volume_ratio, spread_pct, etc.)
        - actual_return: The actual P&L if trade was taken
        - was_profitable: Boolean outcome
        """
        self.data = historical_opportunities

    def optimize_weights(self) -> dict:
        """Use machine learning to find optimal feature weights."""

        features = [
            'volume_ratio', 'spread_pct', 'best_roi', 'short_term_roi',
            'breakeven_move_pct', 'iv_rank', 'days_to_expiration'
        ]

        X = self.data[features]
        y = self.data['actual_return']

        # Train random forest to predict actual returns
        model = RandomForestRegressor(n_estimators=100, random_state=42)
        model.fit(X, y)

        # Feature importances become our weights
        weights = dict(zip(features, model.feature_importances_))

        # Normalize to sum to 100
        total = sum(weights.values())
        weights = {k: (v / total) * 100 for k, v in weights.items()}

        return weights

    def backtest_threshold(self, score_threshold: float) -> dict:
        """Test what minimum score threshold works best."""

        results = {
            'total_opportunities': len(self.data),
            'trades_taken': 0,
            'win_rate': 0,
            'avg_return': 0,
            'total_pnl': 0
        }

        above_threshold = self.data[self.data['score'] >= score_threshold]
        results['trades_taken'] = len(above_threshold)

        if len(above_threshold) > 0:
            results['win_rate'] = above_threshold['was_profitable'].mean()
            results['avg_return'] = above_threshold['actual_return'].mean()
            results['total_pnl'] = above_threshold['actual_return'].sum()

        return results
```

**Action Items:**
- [ ] Collect historical opportunity data with actual outcomes
- [ ] Build backtesting harness to replay historical signals
- [ ] Optimize scoring weights using ML or grid search
- [ ] Validate on out-of-sample data
- [ ] Document empirical justification for each weight

---

### 6. **No Real-Time Data Validation**

**Problem:**
Options data is accepted without validation:
- No check if bid/ask spread is suspiciously wide
- No validation of volume vs historical average
- No detection of stale quotes
- No check if IV is within reasonable bounds

**Recommendation:**
Add data quality layer:

```python
# src/validation/data_quality.py
from dataclasses import dataclass
from enum import Enum

class DataQuality(Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    REJECTED = "rejected"

@dataclass
class QualityReport:
    quality: DataQuality
    issues: list[str]
    warnings: list[str]
    score: float  # 0-100

class OptionsDataValidator:
    """Validate options data quality before analysis."""

    def validate_option(self, option: dict) -> QualityReport:
        issues = []
        warnings = []
        score = 100.0

        # Check bid-ask spread
        spread_pct = (option['ask'] - option['bid']) / option.get('lastPrice', option['ask'])
        if spread_pct > 0.5:  # 50% spread
            issues.append(f"Excessive bid-ask spread: {spread_pct:.1%}")
            score -= 40
        elif spread_pct > 0.2:
            warnings.append(f"Wide spread: {spread_pct:.1%}")
            score -= 15

        # Check volume
        if option['volume'] == 0:
            issues.append("Zero volume - no trading activity")
            score -= 50
        elif option['volume'] < 10:
            warnings.append(f"Low volume: {option['volume']}")
            score -= 10

        # Check open interest
        if option['openInterest'] == 0:
            issues.append("Zero open interest - illiquid")
            score -= 40

        # Check IV sanity
        iv = option.get('impliedVolatility', 0)
        if iv <= 0 or iv > 5.0:  # 500% IV is suspicious
            issues.append(f"Suspicious IV: {iv:.2%}")
            score -= 30

        # Check stock price staleness
        price_source = option.get('_price_source', '')
        if 'previous_close' in price_source.lower():
            warnings.append("Stock price is from previous close")
            score -= 20

        # Check if option is too far OTM
        moneyness = abs(option['strike'] - option['stockPrice']) / option['stockPrice']
        if moneyness > 0.3:  # 30% OTM
            warnings.append(f"Deep OTM option: {moneyness:.1%} from stock price")
            score -= 10

        # Determine overall quality
        if score < 40:
            quality = DataQuality.REJECTED
        elif score < 60:
            quality = DataQuality.LOW
        elif score < 80:
            quality = DataQuality.MEDIUM
        else:
            quality = DataQuality.HIGH

        return QualityReport(
            quality=quality,
            issues=issues,
            warnings=warnings,
            score=max(0, score)
        )
```

**Action Items:**
- [ ] Add validation layer before scoring
- [ ] Filter out low-quality data automatically
- [ ] Display data quality metrics in UI
- [ ] Log rejected data for debugging

---

## Architectural Improvements for Quant-Grade Tool

### 7. **Add Professional Data Pipeline**

Current flow:
```
yfinance API → BulkOptionsFetcher → Scanner → Frontend
```

Recommended institutional flow:
```
Multiple Data Sources → Aggregator → Normalizer → Validator → Cache → Scanner → Risk Manager → Frontend
                                                                    ↓
                                                              Database (historical)
```

**Implementation:**

```python
# src/data/pipeline.py
from typing import Protocol, List
import pandas as pd

class DataSource(Protocol):
    """Protocol for data source adapters."""
    def fetch_options_chain(self, symbol: str) -> pd.DataFrame: ...
    def fetch_quote(self, symbol: str) -> dict: ...

class DataAggregator:
    """Aggregate data from multiple sources with fallbacks."""

    def __init__(self, sources: List[DataSource], primary_source: str = "yfinance"):
        self.sources = {s.name: s for s in sources}
        self.primary = primary_source

    def fetch_with_fallback(self, symbol: str) -> pd.DataFrame:
        """Try primary source, fall back to others if it fails."""

        # Try primary
        try:
            data = self.sources[self.primary].fetch_options_chain(symbol)
            if data is not None and not data.empty:
                data['_source'] = self.primary
                return data
        except Exception as e:
            print(f"Primary source {self.primary} failed: {e}")

        # Try fallbacks
        for name, source in self.sources.items():
            if name == self.primary:
                continue
            try:
                data = source.fetch_options_chain(symbol)
                if data is not None and not data.empty:
                    data['_source'] = name
                    print(f"Using fallback source: {name}")
                    return data
            except Exception as e:
                print(f"Fallback source {name} failed: {e}")

        return pd.DataFrame()

    def fetch_quote_consensus(self, symbol: str) -> dict:
        """Get stock quote from multiple sources and use consensus."""
        quotes = []

        for name, source in self.sources.items():
            try:
                quote = source.fetch_quote(symbol)
                if quote and quote.get('price'):
                    quotes.append({
                        'source': name,
                        'price': quote['price'],
                        'timestamp': quote.get('timestamp')
                    })
            except:
                continue

        if not quotes:
            return {}

        # Use median price if we have multiple sources
        if len(quotes) >= 3:
            prices = sorted([q['price'] for q in quotes])
            consensus_price = prices[len(prices) // 2]
            return {
                'price': consensus_price,
                'sources': [q['source'] for q in quotes],
                'price_range': (min(prices), max(prices)),
                'confidence': 'high'
            }
        else:
            return {
                'price': quotes[0]['price'],
                'sources': [q['source'] for q in quotes],
                'confidence': 'medium'
            }
```

**Action Items:**
- [ ] Implement data aggregator with fallback sources
- [ ] Add quote consensus from multiple sources
- [ ] Store all fetched data in database for analysis
- [ ] Build data quality monitoring dashboard

---

### 8. **Add Position Sizing and Risk Management**

**Problem:**
Tool shows opportunities but provides no guidance on:
- How many contracts to buy
- Portfolio-level risk limits
- Correlation between positions
- Max loss scenarios

**Recommendation:**

```python
# src/risk/position_sizer.py
from dataclasses import dataclass

@dataclass
class PositionSize:
    contracts: int
    total_cost: float
    max_loss: float
    max_loss_pct_of_portfolio: float
    kelly_criterion_fraction: float
    recommended_allocation: str  # "underweight", "normal", "overweight"

class KellyPositionSizer:
    """Calculate position sizes using Kelly Criterion."""

    def __init__(self, portfolio_value: float, max_risk_per_trade: float = 0.02):
        self.portfolio_value = portfolio_value
        self.max_risk_per_trade = max_risk_per_trade  # 2% default

    def calculate_position_size(
        self,
        opportunity: dict,
        win_probability: float,
        win_amount: float,  # Expected win in dollars
        loss_amount: float   # Expected loss in dollars (premium * 100)
    ) -> PositionSize:
        """
        Calculate optimal position size using Kelly Criterion.

        Kelly% = (p * b - q) / b
        where:
        p = probability of winning
        q = probability of losing (1-p)
        b = ratio of win to loss (win_amount / loss_amount)
        """

        if loss_amount == 0 or win_probability >= 1 or win_probability <= 0:
            return PositionSize(0, 0, 0, 0, 0, "rejected")

        q = 1 - win_probability
        b = win_amount / loss_amount

        # Full Kelly (usually too aggressive)
        kelly_fraction = (win_probability * b - q) / b

        # Half Kelly (more conservative, recommended)
        half_kelly = kelly_fraction / 2

        # Never risk more than max_risk_per_trade
        kelly_capped = min(half_kelly, self.max_risk_per_trade)

        # Calculate number of contracts
        if kelly_capped <= 0:
            return PositionSize(0, 0, 0, 0, 0, "negative_edge")

        max_dollar_risk = self.portfolio_value * kelly_capped
        cost_per_contract = opportunity['premium'] * 100

        contracts = int(max_dollar_risk / cost_per_contract)
        contracts = max(1, contracts)  # At least 1 contract

        total_cost = contracts * cost_per_contract
        max_loss = total_cost  # For long options
        max_loss_pct = (max_loss / self.portfolio_value) * 100

        # Classify allocation
        if max_loss_pct < 1:
            allocation = "underweight"
        elif max_loss_pct < 3:
            allocation = "normal"
        else:
            allocation = "overweight"

        return PositionSize(
            contracts=contracts,
            total_cost=total_cost,
            max_loss=max_loss,
            max_loss_pct_of_portfolio=max_loss_pct,
            kelly_criterion_fraction=kelly_fraction,
            recommended_allocation=allocation
        )

# src/risk/portfolio_risk.py
class PortfolioRiskManager:
    """Manage portfolio-level risk limits."""

    def __init__(self, portfolio_value: float):
        self.portfolio_value = portfolio_value
        self.max_portfolio_heat = 0.10  # Max 10% of portfolio at risk
        self.max_sector_concentration = 0.25  # Max 25% in one sector
        self.current_positions = []

    def can_add_position(self, new_opportunity: dict, position_size: PositionSize) -> tuple[bool, str]:
        """Check if new position violates portfolio risk limits."""

        current_risk = sum(p.max_loss for p in self.current_positions)
        new_total_risk = current_risk + position_size.max_loss

        # Check total portfolio heat
        if new_total_risk / self.portfolio_value > self.max_portfolio_heat:
            return False, f"Would exceed portfolio heat limit ({self.max_portfolio_heat:.0%})"

        # Check sector concentration
        sector = new_opportunity.get('sector', 'unknown')
        sector_exposure = sum(
            p.total_cost for p in self.current_positions
            if p.sector == sector
        )
        new_sector_exposure = sector_exposure + position_size.total_cost

        if new_sector_exposure / self.portfolio_value > self.max_sector_concentration:
            return False, f"Would exceed {sector} sector limit ({self.max_sector_concentration:.0%})"

        # Check correlation (simplified - should use actual correlation matrix)
        correlated_positions = [
            p for p in self.current_positions
            if p.symbol == new_opportunity['symbol']
        ]
        if len(correlated_positions) >= 3:
            return False, f"Already have 3 positions in {new_opportunity['symbol']}"

        return True, "Position approved"
```

**Action Items:**
- [ ] Implement Kelly Criterion position sizing
- [ ] Add portfolio-level risk tracking
- [ ] Include sector/correlation limits
- [ ] Display recommended position size in UI

---

### 9. **Add Backtesting Framework**

**Critical for validation** - you need to prove the scanner actually finds profitable opportunities.

```python
# src/backtesting/engine.py
from dataclasses import dataclass
from datetime import datetime, timedelta
import pandas as pd

@dataclass
class Trade:
    entry_date: datetime
    exit_date: datetime
    symbol: str
    option_type: str
    strike: float
    entry_price: float
    exit_price: float
    contracts: int
    pnl: float
    pnl_pct: float
    days_held: int
    max_drawdown: float
    score_at_entry: float

class Backtester:
    """Backtest the scanner on historical data."""

    def __init__(self, historical_data: pd.DataFrame):
        """
        historical_data should have daily snapshots of:
        - All options that would have been flagged
        - Actual price evolution of those options
        - Actual stock price evolution
        """
        self.data = historical_data
        self.trades: List[Trade] = []

    def run_backtest(
        self,
        start_date: datetime,
        end_date: datetime,
        score_threshold: float = 75,
        holding_period_days: int = 7
    ) -> dict:
        """
        Simulate taking trades based on scanner signals.

        Strategy:
        - Each day, scan for opportunities
        - Enter positions that score >= threshold
        - Exit after holding_period_days or when profit target hit
        """

        current_date = start_date

        while current_date <= end_date:
            # Get opportunities from that day
            daily_opps = self.data[
                (self.data['date'] == current_date) &
                (self.data['score'] >= score_threshold)
            ]

            # Enter new positions
            for _, opp in daily_opps.iterrows():
                self._enter_position(opp, current_date, holding_period_days)

            # Check existing positions for exits
            self._check_exits(current_date)

            current_date += timedelta(days=1)

        # Close any remaining positions
        self._close_all_positions(end_date)

        return self._calculate_performance()

    def _calculate_performance(self) -> dict:
        """Calculate backtest performance metrics."""

        if not self.trades:
            return {}

        total_pnl = sum(t.pnl for t in self.trades)
        total_trades = len(self.trades)
        winning_trades = [t for t in self.trades if t.pnl > 0]
        losing_trades = [t for t in self.trades if t.pnl <= 0]

        win_rate = len(winning_trades) / total_trades if total_trades > 0 else 0
        avg_win = sum(t.pnl for t in winning_trades) / len(winning_trades) if winning_trades else 0
        avg_loss = sum(t.pnl for t in losing_trades) / len(losing_trades) if losing_trades else 0

        profit_factor = (
            sum(t.pnl for t in winning_trades) / abs(sum(t.pnl for t in losing_trades))
            if losing_trades and sum(t.pnl for t in losing_trades) != 0
            else float('inf')
        )

        # Calculate max drawdown
        cumulative_pnl = 0
        peak = 0
        max_dd = 0
        for trade in sorted(self.trades, key=lambda t: t.exit_date):
            cumulative_pnl += trade.pnl
            if cumulative_pnl > peak:
                peak = cumulative_pnl
            dd = peak - cumulative_pnl
            if dd > max_dd:
                max_dd = dd

        return {
            'total_trades': total_trades,
            'win_rate': win_rate,
            'total_pnl': total_pnl,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'profit_factor': profit_factor,
            'max_drawdown': max_dd,
            'expectancy': total_pnl / total_trades if total_trades > 0 else 0,
            'best_trade': max((t.pnl for t in self.trades), default=0),
            'worst_trade': min((t.pnl for t in self.trades), default=0)
        }
```

**Action Items:**
- [ ] Collect 1-2 years of historical options data
- [ ] Build backtest engine
- [ ] Test multiple score thresholds
- [ ] Optimize holding periods
- [ ] Document expected performance metrics

---

### 10. **Add Market Regime Detection**

**Problem:**
Current scanner treats all market conditions equally. But:
- High IV strategies work differently than low IV
- Bull markets vs bear markets require different setups
- Trending vs choppy markets affect options

**Recommendation:**

```python
# src/market/regime.py
from enum import Enum
import pandas as pd
import numpy as np

class MarketRegime(Enum):
    BULL_TRENDING = "bull_trending"
    BULL_CHOPPY = "bull_choppy"
    BEAR_TRENDING = "bear_trending"
    BEAR_CHOPPY = "bear_choppy"
    NEUTRAL = "neutral"

class RegimeDetector:
    """Detect current market regime to adjust strategy."""

    def __init__(self):
        self.vix_threshold_high = 25
        self.vix_threshold_low = 15

    def detect_regime(self, spy_data: pd.DataFrame) -> MarketRegime:
        """
        Determine market regime based on SPY price action and VIX.

        spy_data should have: Date, Close, Volume, and VIX columns
        """

        # Calculate trend (20-day SMA)
        spy_data['sma_20'] = spy_data['Close'].rolling(20).mean()
        spy_data['sma_50'] = spy_data['Close'].rolling(50).mean()

        current_price = spy_data['Close'].iloc[-1]
        sma_20 = spy_data['sma_20'].iloc[-1]
        sma_50 = spy_data['sma_50'].iloc[-1]

        # Calculate volatility (20-day historical vol)
        spy_data['returns'] = spy_data['Close'].pct_change()
        hist_vol = spy_data['returns'].rolling(20).std() * np.sqrt(252) * 100
        current_hvol = hist_vol.iloc[-1]

        vix = spy_data['VIX'].iloc[-1] if 'VIX' in spy_data.columns else current_hvol

        # Determine trend direction
        if current_price > sma_20 > sma_50:
            trend = "bull"
        elif current_price < sma_20 < sma_50:
            trend = "bear"
        else:
            trend = "neutral"

        # Determine choppiness (high vol = choppy)
        if vix > self.vix_threshold_high:
            choppiness = "choppy"
        elif vix < self.vix_threshold_low:
            choppiness = "trending"
        else:
            choppiness = "neutral"

        # Combine into regime
        if trend == "bull" and choppiness == "trending":
            return MarketRegime.BULL_TRENDING
        elif trend == "bull" and choppiness == "choppy":
            return MarketRegime.BULL_CHOPPY
        elif trend == "bear" and choppiness == "trending":
            return MarketRegime.BEAR_TRENDING
        elif trend == "bear" and choppiness == "choppy":
            return MarketRegime.BEAR_CHOPPY
        else:
            return MarketRegime.NEUTRAL

class RegimeAdjustedScorer:
    """Adjust scoring based on market regime."""

    def adjust_score(self, base_score: float, opportunity: dict, regime: MarketRegime) -> float:
        """
        Adjust opportunity score based on market regime.

        Different strategies work in different regimes:
        - Bull trending: Favor calls, lower IVs
        - Bull choppy: Favor iron condors, credit spreads
        - Bear trending: Favor puts, lower IVs
        - Bear choppy: Favor straddles, high IV plays
        """

        adjusted_score = base_score

        option_type = opportunity['optionType']
        iv_rank = opportunity.get('ivRank', 50)

        if regime == MarketRegime.BULL_TRENDING:
            # Favor calls with low IV (more room to run)
            if option_type == 'call' and iv_rank < 30:
                adjusted_score *= 1.2
            elif option_type == 'put':
                adjusted_score *= 0.8

        elif regime == MarketRegime.BEAR_TRENDING:
            # Favor puts with low IV
            if option_type == 'put' and iv_rank < 30:
                adjusted_score *= 1.2
            elif option_type == 'call':
                adjusted_score *= 0.8

        elif regime == MarketRegime.BULL_CHOPPY or regime == MarketRegime.BEAR_CHOPPY:
            # Favor high IV plays (IV crush opportunities)
            if iv_rank > 70:
                adjusted_score *= 1.15

        return adjusted_score
```

**Action Items:**
- [ ] Implement regime detection using SPY/VIX
- [ ] Adjust scoring weights by regime
- [ ] Display current regime in UI
- [ ] Track performance by regime in backtests

---

## Data Accuracy Root Cause Analysis

### Where Stock Price Errors Originate

I've traced through the entire data flow:

1. **`src/adapters/yfinance.py:90-139`** - `_extract_price()` method
   - Returns stale prices without timestamp validation
   - No indication of price source or age

2. **`scripts/bulk_options_fetcher.py:99`** - `options_df = chain.to_dataframe()`
   - Uses `underlying_price` from the chain
   - This price could be cached from yfinance

3. **`src/adapters/base.py:48-52`** - `OptionsChain.to_dataframe()`
   - Fills `stockPrice` column with `underlying_price`
   - No staleness check or validation

4. **`src/scanner/service.py:161-170`** - Numeric conversion
   - Blindly converts to numeric without validation
   - No check if stock price is recent

**The Fix:**

Add timestamp tracking throughout the pipeline:

```python
# src/adapters/base.py
@dataclass
class OptionsChain:
    symbol: str
    expiration: date
    calls: pd.DataFrame
    puts: pd.DataFrame
    underlying_price: Optional[float] = None
    price_timestamp: Optional[datetime] = None  # ADD THIS
    price_source: Optional[str] = None  # ADD THIS

    def to_dataframe(self) -> pd.DataFrame:
        # ... existing code ...

        if self.underlying_price is not None:
            enriched["stockPrice"] = self.underlying_price
            enriched["_price_timestamp"] = self.price_timestamp  # ADD THIS
            enriched["_price_source"] = self.price_source  # ADD THIS

        return enriched

# Then in yfinance adapter
def get_chain(self, symbol: str, expiration: date) -> OptionsChain:
    # ... fetch chain ...

    price, source = self._extract_price(ticker)  # Modified to return source
    timestamp = datetime.now(timezone.utc)

    return OptionsChain(
        symbol=symbol,
        expiration=expiration,
        calls=calls,
        puts=puts,
        underlying_price=price,
        price_timestamp=timestamp,
        price_source=source
    )
```

---

## Summary Recommendations by Priority

### Critical (Do These First)
1. ✅ **Fix stock price staleness** - Add timestamp validation and source tracking
2. ✅ **Consolidate probability calculations** - Use one statistical method
3. ✅ **Add data quality validation** - Reject bad data before scoring
4. ✅ **Unify Greeks calculations** - Single Black-Scholes implementation

### High Priority
5. ✅ **Implement position sizing** - Kelly Criterion for trade sizing
6. ✅ **Add backtesting framework** - Validate the system works
7. ✅ **Build data aggregator** - Multiple sources with fallbacks
8. ✅ **Add return scenarios** - Multiple scenarios, not single 10% move

### Medium Priority
9. ✅ **Optimize scoring weights** - Use empirical data, not guesses
10. ✅ **Market regime detection** - Adjust strategy to market conditions
11. ✅ **Portfolio risk manager** - Sector limits, correlation, heat
12. ✅ **Add monitoring/alerting** - Track data quality over time

### Nice to Have
13. Database for historical analysis
14. Real-time streaming quotes (WebSocket)
15. Automated trade execution interface
16. Mobile app for alerts
17. Machine learning for pattern recognition

---

## Expected Outcomes

After implementing these improvements:

### Data Quality
- ✅ Stock prices accurate to <1 minute during market hours
- ✅ All stale data flagged and optionally filtered
- ✅ Multiple data source consensus for critical values
- ✅ Data quality score for each opportunity

### Calculation Accuracy
- ✅ Greeks within 1% of professional platforms (IBKR, Bloomberg)
- ✅ Probability of profit aligned with historical win rates
- ✅ Return calculations include time value decay
- ✅ All calculations validated with unit tests

### Signal Quality
- ✅ Backtested win rate >60% (vs 50% random)
- ✅ Profit factor >1.5 (winners 1.5x larger than losers)
- ✅ Expectancy >0 on every signal
- ✅ Max drawdown <15% of portfolio

### User Experience
- ✅ Confidence in data accuracy (timestamps, sources shown)
- ✅ Clear position sizing guidance
- ✅ Risk/reward scenarios for multiple price moves
- ✅ Regime-adjusted recommendations

---

## Implementation Roadmap

### Week 1: Data Accuracy
- [ ] Implement enhanced `_extract_price` with timestamps
- [ ] Add data quality validation layer
- [ ] Update frontend to show data quality metrics
- [ ] Add staleness warnings

### Week 2: Calculation Consolidation
- [ ] Create `src/math/greeks.py` with validated Black-Scholes
- [ ] Unify probability calculation across all modules
- [ ] Add return scenarios (5%, 10%, 15%, 20%, 30% moves)
- [ ] Write unit tests for all calculations

### Week 3: Risk Management
- [ ] Implement Kelly Criterion position sizer
- [ ] Build portfolio risk manager
- [ ] Add position size recommendations to UI
- [ ] Create risk limit configuration

### Week 4: Backtesting & Validation
- [ ] Build backtesting framework
- [ ] Collect 6-12 months historical data
- [ ] Run backtests on different score thresholds
- [ ] Optimize weights based on historical performance
- [ ] Document expected performance ranges

### Week 5-6: Advanced Features
- [ ] Implement data aggregator with multiple sources
- [ ] Add market regime detection
- [ ] Build regime-adjusted scoring
- [ ] Create performance monitoring dashboard

### Week 7-8: Polish & Production
- [ ] Comprehensive test suite (unit, integration, end-to-end)
- [ ] Performance optimization (caching, parallel processing)
- [ ] Documentation (API docs, user guide, architecture)
- [ ] Deployment automation (CI/CD, monitoring, alerts)

---

## Success Metrics

Track these KPIs to measure improvement:

### Data Quality Metrics
- **Price Staleness**: % of opportunities with stock price <5 min old
  - Target: >95% during market hours

- **Data Validation Pass Rate**: % of opportunities passing quality checks
  - Target: >80%

### Calculation Accuracy
- **Greeks Validation Error**: Average % difference from reference platform
  - Target: <2%

- **Probability Calibration**: Actual win rate vs predicted probability
  - Target: Within ±10 percentage points

### Signal Performance (Backtested)
- **Win Rate**: % of signals that are profitable
  - Target: >60%

- **Profit Factor**: Total wins / Total losses
  - Target: >1.5

- **Expectancy**: Average $ per trade
  - Target: >$50 per contract

- **Max Drawdown**: Largest peak-to-trough decline
  - Target: <15% of starting capital

### Operational Metrics
- **Scan Latency**: Time to complete full scan
  - Target: <30 seconds

- **Uptime**: % of time system is operational
  - Target: >99%

- **False Positive Rate**: % of high-scoring opportunities that fail
  - Target: <30%

---

## Tools & Resources Needed

### Data Sources (Recommended)
1. **Primary**: yfinance (free, current)
2. **Backup #1**: Polygon.io ($99/mo for real-time options)
3. **Backup #2**: Tradier (free sandbox, or $10/mo live)
4. **Market data**: Alpha Vantage (free tier) or Yahoo Finance

### Infrastructure
- **Database**: PostgreSQL or SQLite for historical data
- **Caching**: Redis for real-time quotes
- **Monitoring**: Grafana + Prometheus
- **Alerting**: PagerDuty or custom webhooks

### Development Tools
- **Testing**: pytest, vitest, supertest
- **Type checking**: mypy (Python), TypeScript (JS)
- **Linting**: ruff (Python), eslint (JS)
- **CI/CD**: GitHub Actions

### Reference Materials
- Hull's "Options, Futures, and Other Derivatives" (Greeks, pricing)
- Natenberg's "Option Volatility and Pricing" (strategies)
- Tharp's "Trade Your Way to Financial Freedom" (position sizing)
- Chan's "Quantitative Trading" (backtesting)

---

## Conclusion

Your tool has excellent bones, but needs critical improvements in **data accuracy, calculation validation, and empirical tuning** to become a true quant-grade system.

The most critical issue is **stock price staleness**, which cascades into every downstream calculation. Fix this first.

After that, focus on:
1. Unified, validated calculations (Greeks, probability, returns)
2. Position sizing and risk management
3. Backtesting to prove it works
4. Multi-source data pipeline for reliability

With these improvements, you'll have a professional tool capable of consistently finding asymmetric, high-probability options opportunities.

**Estimated timeline to production-grade**: 6-8 weeks of focused development.

Let me know which areas you'd like to tackle first, and I can provide detailed implementation code for those specific modules.
