import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
import sys

def get_options_chain(symbol):
    """Fetch real options chain data from Yahoo Finance"""
    try:
        ticker = yf.Ticker(symbol)
        
        # Get stock info
        info = ticker.info
        current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))
        
        # Get available expiration dates
        expirations = ticker.options
        
        if not expirations:
            return None
            
        # Get options for next 2 expirations
        all_options = []
        
        for exp_date in expirations[:2]:
            opt_chain = ticker.option_chain(exp_date)
            
            # Process calls
            calls = opt_chain.calls
            calls['type'] = 'call'
            calls['expiration'] = exp_date
            
            # Process puts
            puts = opt_chain.puts
            puts['type'] = 'put'
            puts['expiration'] = exp_date
            
            # Combine
            options = pd.concat([calls, puts])
            options['symbol'] = symbol
            options['stockPrice'] = current_price
            
            all_options.append(options)
        
        return pd.concat(all_options) if all_options else None
        
    except Exception as e:
        print(f"Error fetching options for {symbol}: {e}")
        return None

def calculate_greeks_approximation(row):
    """Calculate approximate Greeks using Black-Scholes approximations"""
    S = row['stockPrice']  # Current stock price
    K = row['strike']  # Strike price
    T = (pd.to_datetime(row['expiration']) - datetime.now()).days / 365.0  # Time to expiration
    sigma = row.get('impliedVolatility', 0.3)  # IV
    r = 0.05  # Risk-free rate (approximate)
    
    if T <= 0 or sigma <= 0:
        return {
            'delta': 0,
            'gamma': 0,
            'theta': 0,
            'vega': 0
        }
    
    # Calculate d1 and d2 for Black-Scholes
    d1 = (np.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    
    # Standard normal CDF approximation
    from scipy.stats import norm
    
    if row['type'] == 'call':
        delta = norm.cdf(d1)
    else:
        delta = -norm.cdf(-d1)
    
    # Gamma (same for calls and puts)
    gamma = norm.pdf(d1) / (S * sigma * np.sqrt(T))
    
    # Theta (approximate)
    theta = -(S * norm.pdf(d1) * sigma) / (2 * np.sqrt(T))
    if row['type'] == 'call':
        theta -= r * K * np.exp(-r * T) * norm.cdf(d2)
    else:
        theta += r * K * np.exp(-r * T) * norm.cdf(-d2)
    theta = theta / 365  # Convert to daily
    
    # Vega (same for calls and puts)
    vega = S * norm.pdf(d1) * np.sqrt(T) / 100  # Divide by 100 for 1% change
    
    return {
        'delta': round(delta, 4),
        'gamma': round(gamma, 6),
        'theta': round(theta, 4),
        'vega': round(vega, 4)
    }

def calculate_iv_rank(symbol, current_iv):
    """Calculate IV rank based on 52-week IV history"""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1y")
        
        # Calculate historical volatility as proxy for IV range
        returns = np.log(hist['Close'] / hist['Close'].shift(1))
        rolling_vol = returns.rolling(window=30).std() * np.sqrt(252) * 100
        
        iv_low = rolling_vol.min()
        iv_high = rolling_vol.max()
        
        if iv_high == iv_low:
            return 50
            
        iv_rank = ((current_iv - iv_low) / (iv_high - iv_low)) * 100
        return round(max(0, min(100, iv_rank)), 2)
        
    except:
        return 50  # Default to middle

def analyze_opportunity(row):
    """Analyze an option for trading opportunity with advanced pattern recognition"""
    score = 0
    reasoning = []
    catalysts = []
    patterns = []
    
    # Calculate Greeks first
    greeks = calculate_greeks_approximation(row)
    
    # Factor 1: Unusual Options Activity (CRITICAL for large moves)
    volume_ratio = row['volume'] / max(row['openInterest'], 1)
    if volume_ratio > 5:
        score += 35
        reasoning.append(f"EXTREME unusual volume ({volume_ratio:.1f}x open interest)")
        catalysts.append("Massive Unusual Options Activity")
        patterns.append("Smart Money Flow")
    elif volume_ratio > 3:
        score += 25
        reasoning.append(f"Very high unusual volume ({volume_ratio:.1f}x open interest)")
        catalysts.append("Unusual Options Activity")
    elif volume_ratio > 2:
        score += 15
        reasoning.append(f"Unusual volume ({volume_ratio:.1f}x open interest)")
    else:
        score += 5
    
    # Factor 2: IV Rank + Gamma Squeeze Potential
    iv_rank = calculate_iv_rank(row['symbol'], row.get('impliedVolatility', 0.3) * 100)
    if iv_rank > 80 and greeks['gamma'] > 0.01:
        score += 30
        reasoning.append(f"EXTREME IV rank ({iv_rank:.0f}%) + High Gamma - Squeeze potential")
        patterns.append("Gamma Squeeze Setup")
        catalysts.append("Volatility Expansion")
    elif iv_rank > 70:
        score += 20
        reasoning.append(f"High IV rank ({iv_rank:.0f}%)")
    elif iv_rank < 20 and greeks['vega'] > 0.1:
        score += 25
        reasoning.append(f"Very low IV ({iv_rank:.0f}%) with high Vega - expansion play")
        patterns.append("IV Expansion Play")
    else:
        score += 8
    
    # Factor 3: Delta + Gamma Combination (Explosive move potential)
    delta_abs = abs(greeks['delta'])
    if delta_abs > 0.6 and greeks['gamma'] > 0.015:
        score += 25
        reasoning.append(f"High Delta ({delta_abs:.2f}) + High Gamma - Explosive potential")
        patterns.append("Delta-Gamma Acceleration")
    elif delta_abs > 0.5 and greeks['gamma'] > 0.01:
        score += 18
        reasoning.append(f"Strong Delta-Gamma combination")
    elif delta_abs > 0.4:
        score += 12
    else:
        score += 6
    
    # Factor 4: Theta Decay vs Premium (Time value analysis)
    theta_ratio = abs(greeks['theta']) / max(row['lastPrice'], 0.01)
    days_to_exp = (pd.to_datetime(row['expiration']) - datetime.now()).days
    if theta_ratio < 0.02 and days_to_exp > 30:
        score += 15
        reasoning.append(f"Low theta decay ({theta_ratio:.3f}) - time on your side")
    elif theta_ratio > 0.05 and days_to_exp < 14:
        score -= 10
        reasoning.append(f"High theta decay risk ({theta_ratio:.3f})")
    else:
        score += 8
    
    # Factor 5: Moneyness + Strike Selection (Sweet spot analysis)
    moneyness = abs(row['stockPrice'] - row['strike']) / row['stockPrice']
    if 0.01 < moneyness < 0.05:  # Slightly OTM/ITM sweet spot
        score += 20
        reasoning.append("OPTIMAL strike selection (near ATM sweet spot)")
        patterns.append("Sweet Spot Strike")
    elif moneyness < 0.01:
        score += 12
        reasoning.append("At-the-money strike")
    elif 0.05 < moneyness < 0.10:
        score += 10
    else:
        score += 4
    
    # Factor 6: Liquidity Analysis (Critical for execution)
    spread_pct = (row['ask'] - row['bid']) / max(row['lastPrice'], 0.01)
    if spread_pct < 0.03 and row['openInterest'] > 2000:
        score += 20
        reasoning.append("EXCELLENT liquidity (tight spread + high OI)")
    elif spread_pct < 0.05 and row['openInterest'] > 1000:
        score += 15
        reasoning.append("Very good liquidity")
    elif spread_pct < 0.10:
        score += 10
    else:
        score += 3
        reasoning.append("Warning: Wide spread may impact entry/exit")
    
    # Factor 7: Risk/Reward Calculation (Expected value)
    # Calculate potential return on 10%, 20%, and 30% moves
    returns_analysis = []
    for move_pct in [0.10, 0.20, 0.30]:
        if row['type'] == 'call':
            target_price = row['stockPrice'] * (1 + move_pct)
            intrinsic = max(0, target_price - row['strike'])
        else:
            target_price = row['stockPrice'] * (1 - move_pct)
            intrinsic = max(0, row['strike'] - target_price)
        
        potential_return = max(0, intrinsic - row['lastPrice'])
        risk_reward = potential_return / max(row['lastPrice'], 0.01)
        returns_analysis.append({
            'move': f"{move_pct*100:.0f}%",
            'return': round(risk_reward * 100, 1)
        })
    
    # Score based on 10% move potential
    primary_rr = returns_analysis[0]['return'] / 100
    if primary_rr > 5:
        score += 30
        reasoning.append(f"EXCEPTIONAL risk/reward ({primary_rr:.1f}:1 on 10% move)")
        patterns.append("Asymmetric Payoff")
    elif primary_rr > 3:
        score += 20
        reasoning.append(f"Excellent risk/reward ({primary_rr:.1f}:1)")
    elif primary_rr > 2:
        score += 12
    else:
        score += 5
    
    # Factor 8: Vega + IV Rank (Volatility play potential)
    if greeks['vega'] > 0.15 and iv_rank < 30:
        score += 20
        reasoning.append(f"High Vega ({greeks['vega']:.2f}) + Low IV - volatility expansion play")
        patterns.append("Volatility Expansion")
    elif greeks['vega'] > 0.10:
        score += 10
    
    # Factor 9: Open Interest Growth (Institutional interest)
    if row['openInterest'] > 5000:
        score += 15
        reasoning.append(f"Very high open interest ({int(row['openInterest'])}) - institutional interest")
        catalysts.append("Institutional Activity")
    elif row['openInterest'] > 2000:
        score += 10
        reasoning.append(f"High open interest ({int(row['openInterest'])})")
    elif row['openInterest'] > 1000:
        score += 7
    else:
        score += 3
    
    # Pattern Recognition Bonuses
    if len(patterns) >= 3:
        score += 15
        reasoning.append(f"MULTIPLE PATTERNS ALIGNED: {', '.join(patterns)}")
    elif len(patterns) >= 2:
        score += 10
    
    # Determine risk level based on multiple factors
    risk_factors = 0
    if moneyness > 0.10:
        risk_factors += 1
    if days_to_exp < 14:
        risk_factors += 1
    if spread_pct > 0.10:
        risk_factors += 1
    if row['openInterest'] < 500:
        risk_factors += 1
    
    if risk_factors >= 3:
        risk_level = "high"
    elif risk_factors >= 2:
        risk_level = "medium"
    else:
        risk_level = "low"
    
    # Calculate breakeven
    breakeven = row['strike'] + row['lastPrice'] if row['type'] == 'call' else row['strike'] - row['lastPrice']
    
    # Calculate max profit potential (for 30% move)
    max_return_scenario = returns_analysis[2]
    
    return {
        'score': min(100, score),
        'confidence': min(98, score * 0.85 + 15),
        'reasoning': reasoning,
        'catalysts': catalysts if catalysts else ["Technical Setup"],
        'patterns': patterns,
        'riskLevel': risk_level,
        'potentialReturn': round(returns_analysis[0]['return'], 1),  # 10% move
        'maxReturn': round(max_return_scenario['return'], 1),  # 30% move
        'maxLoss': round(row['lastPrice'] * 100, 2),  # Per contract
        'breakeven': round(breakeven, 2),
        'ivRank': iv_rank,
        'volumeRatio': round(volume_ratio, 2),
        'greeks': greeks,
        'daysToExpiration': days_to_exp,
        'returnsAnalysis': returns_analysis
    }

def scan_symbols(symbols, max_budget=None):
    """Scan multiple symbols for superior opportunities

    Args:
        symbols: List of ticker symbols to scan
        max_budget: Maximum budget per contract in dollars (e.g., 1500)
    """
    all_opportunities = []
    
    for symbol in symbols:
        print(f"Scanning {symbol}...")
        options_df = get_options_chain(symbol)
        
        if options_df is None or options_df.empty:
            continue
        
        # Filter for liquid options with potential
        liquid_options = options_df[
            (options_df['volume'] > 50) &  # Quality volume threshold
            (options_df['openInterest'] > 100) &  # Quality OI threshold
            (options_df['lastPrice'] > 0.20) &  # Minimum premium
            (options_df['lastPrice'] < 50)  # Maximum premium (will be budget-filtered later)
        ]
        
        for idx, row in liquid_options.iterrows():
            analysis = analyze_opportunity(row)
            
            # Only include HIGH-QUALITY opportunities (65+ for superior trades)
            if analysis['score'] >= 65:
                # Calculate contract cost (premium per share * 100 shares)
                contract_cost = row['lastPrice'] * 100

                # Apply budget filter if specified
                if max_budget is not None and contract_cost > max_budget:
                    continue  # Skip options over budget

                opportunity = {
                    'symbol': row['symbol'],
                    'optionType': row['type'],
                    'action': 'buy',
                    'strike': float(row['strike']),
                    'expiration': row['expiration'],
                    'premium': float(row['lastPrice']),
                    'bid': float(row['bid']),
                    'ask': float(row['ask']),
                    'volume': int(row['volume']),
                    'openInterest': int(row['openInterest']),
                    'impliedVolatility': float(row.get('impliedVolatility', 0)),
                    'stockPrice': float(row['stockPrice']),
                    **analysis
                }
                all_opportunities.append(opportunity)
    
    # Sort by score, then by potential return
    all_opportunities.sort(key=lambda x: (x['score'], x['potentialReturn']), reverse=True)
    
    return all_opportunities[:15]  # Top 15 superior opportunities

if __name__ == "__main__":
    WATCHLIST = [
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "AMD",
        "NFLX", "SPY", "QQQ", "COIN", "PLTR", "SOFI", "RIVN"
    ]

    # Parse budget from command line args if provided
    max_budget = None
    if len(sys.argv) > 1:
        try:
            max_budget = float(sys.argv[1])
            print(f"Filtering options with max budget: ${max_budget:.2f} per contract")
        except ValueError:
            print("Invalid budget argument, scanning without budget limit")

    print("Starting advanced options scan for superior opportunities...")
    opportunities = scan_symbols(WATCHLIST, max_budget=max_budget)

    budget_msg = f" under ${max_budget:.0f} budget" if max_budget else ""
    print(f"\nFound {len(opportunities)} high-quality opportunities (score >= 65){budget_msg}")

    # Output as JSON
    print(json.dumps(opportunities, indent=2))
