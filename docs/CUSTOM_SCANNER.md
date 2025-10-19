# Custom Scanner

## Overview

The Custom Scanner allows users to define their own filtering criteria to find options trades that match their specific requirements. This is a free-tier feature that complements the Smart Scanner (pro tier).

## Features

### Scanner Modes

**Smart Scanner (PRO)**
- Institutional-grade analysis using 7 scoring dimensions
- Unusual volume detection
- Gamma squeeze potential analysis
- IV anomaly detection
- Event catalyst identification
- Risk-adjusted filtering
- Advanced Greeks and probability calibration

**Custom Scanner (FREE)**
- User-defined filter criteria
- Real-time filtering as you adjust parameters
- Perfect for learning options mechanics
- Test trading strategies
- Find trades matching specific requirements

## Available Filters

### Volume & Liquidity
- **Min Volume**: Minimum option contract volume (0-10,000)
- **Min Open Interest**: Minimum open interest (0-50,000)
- **Max Spread**: Maximum bid-ask spread as percentage of option price (0-20%)

### Greeks
- **Delta Range**: Control directional exposure (0-1 for calls, 0 to -1 for puts)
  - Higher delta = more price sensitivity to stock movement
  - Lower delta = less sensitivity, higher theta decay
- **Gamma**: Rate of change of delta (advanced)
- **Theta**: Time decay per day (advanced)
- **Vega**: Volatility sensitivity (advanced)

### IV & Expiration
- **IV Range**: Filter by implied volatility percentage (0-200%)
  - Higher IV = higher premium, more expensive options
  - Lower IV = cheaper options, potential for IV expansion plays
- **DTE Range**: Days to expiration (0-365 days)
  - Short-term: 0-30 days (high theta, quick trades)
  - Medium-term: 30-90 days (balanced)
  - Long-term: 90+ days (lower theta, trend plays)

### Type & Price
- **Option Type**: Calls, Puts, or Both
- **Strike Range**: Filter by strike price
- **Premium Range**: Filter by option cost ($0-$50)

## How to Use

1. **Navigate to Scanner Page**: Go to the main scanner page
2. **Toggle Scanner Mode**: Click "Custom Scanner" in the mode toggle
3. **Set Your Criteria**:
   - Expand filter sections (Volume, Greeks, IV & Time, Type & Price)
   - Adjust sliders or inputs to your desired ranges
   - See real-time match count as you adjust filters
4. **Review Results**:
   - Options that match ALL your criteria will be displayed
   - Sort by various metrics (score, probability, max return, etc.)
5. **Clear Filters**: Click "Clear All" to reset and start over

## Example Use Cases

### High Volume Calls
```
Min Volume: 1000
Min Open Interest: 5000
Option Type: Call
Min Delta: 0.5
Max Delta: 0.7
DTE Range: 30-60 days
```

### Income Generation (Theta Plays)
```
Min Open Interest: 10000
Option Type: Put
Min Delta: 0.2
Max Delta: 0.3
DTE Range: 30-45 days
Max Premium: $2.00
```

### Volatility Plays
```
Min IV: 80%
Max IV: 150%
Min Volume: 500
DTE Range: 14-30 days
Option Type: Both
```

### Deep OTM Lottery Tickets
```
Min Delta: 0.1
Max Delta: 0.2
Max Premium: $1.00
Min IV: 50%
DTE Range: 7-21 days
```

## Tips

1. **Start Broad**: Begin with minimal filters, then tighten criteria
2. **Watch Match Count**: The filter UI shows how many options match your criteria in real-time
3. **Learn Greeks**: Understanding delta, gamma, theta, and vega will help you create better filters
4. **Combine with Smart Scanner**: Use Smart Scanner to discover patterns, then recreate them with custom filters
5. **Save Mental Notes**: Keep track of filter combinations that work for your strategy

## Backend API

The custom scanner also has a backend API endpoint for programmatic access:

**Endpoint**: `POST /scan/custom`

**Request Body**:
```json
{
  "targets": [...],  // Option contracts to filter
  "market_context": {...},  // Market data per symbol
  "min_volume": 100,
  "min_open_interest": 1000,
  "max_spread_percent": 0.05,
  "min_delta": 0.4,
  "max_delta": 0.6,
  "min_iv": 0.3,
  "max_iv": 0.7,
  "min_dte": 30,
  "max_dte": 90,
  "option_type": "call",
  "min_strike": 100,
  "max_strike": 200,
  "min_price": 1.0,
  "max_price": 10.0
}
```

**Response**: Standard `ScanResponse` with signals and match metadata

## Implementation Details

- **Client-side filtering**: For instant feedback as users adjust criteria
- **Backend support**: Available for programmatic access and future optimizations
- **Type-safe**: Full TypeScript support with validated filter ranges
- **Performance**: Filters applied efficiently using memoized computations

## Future Enhancements

- Save/load custom filter presets
- Preset templates for common strategies
- Filter combination suggestions
- Historical backtesting of custom criteria
- Alert notifications when matches are found
