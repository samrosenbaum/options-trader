import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
import time
import random

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

def detect_gamma_squeeze_potential(options_df, symbol, current_price):
    """Detect potential gamma squeeze setups by analyzing call concentration"""
    try:
        # Get calls near current price
        near_strike_calls = options_df[
            (options_df['type'] == 'call') & 
            (options_df['strike'] >= current_price * 0.98) & 
            (options_df['strike'] <= current_price * 1.05)
        ]
        
        if near_strike_calls.empty:
            return 0, []
        
        # Calculate total call open interest near strikes
        total_call_oi = near_strike_calls['openInterest'].sum()
        total_call_volume = near_strike_calls['volume'].sum()
        
        # Calculate put/call ratio for near strikes
        near_strike_puts = options_df[
            (options_df['type'] == 'put') & 
            (options_df['strike'] >= current_price * 0.95) & 
            (options_df['strike'] <= current_price * 1.02)
        ]
        
        put_call_ratio = 0
        if not near_strike_puts.empty:
            total_put_oi = near_strike_puts['openInterest'].sum()
            put_call_ratio = total_put_oi / max(total_call_oi, 1)
        
        # Gamma squeeze indicators
        squeeze_score = 0
        squeeze_reasons = []
        
        # High call concentration
        if total_call_oi > 10000:
            squeeze_score += 30
            squeeze_reasons.append(f"Massive call concentration ({total_call_oi:,} OI)")
        
        # Low put/call ratio (more calls than puts)
        if put_call_ratio < 0.5:
            squeeze_score += 25
            squeeze_reasons.append(f"Low put/call ratio ({put_call_ratio:.2f}) - bullish bias")
        
        # High call volume vs OI
        if total_call_volume > total_call_oi * 2:
            squeeze_score += 20
            squeeze_reasons.append(f"Extreme call volume ({total_call_volume:,}) vs OI")
        
        return squeeze_score, squeeze_reasons
        
    except Exception as e:
        return 0, []

def detect_unusual_options_flow(options_df, symbol):
    """Detect unusual options flow patterns"""
    try:
        # Analyze large block trades (volume >> open interest)
        unusual_calls = options_df[
            (options_df['type'] == 'call') & 
            (options_df['volume'] > options_df['openInterest'] * 3) &
            (options_df['volume'] > 1000)
        ]
        
        unusual_puts = options_df[
            (options_df['type'] == 'put') & 
            (options_df['volume'] > options_df['openInterest'] * 3) &
            (options_df['volume'] > 1000)
        ]
        
        flow_score = 0
        flow_reasons = []
        
        # Call sweep detection
        if len(unusual_calls) > 3:
            flow_score += 25
            flow_reasons.append(f"Call sweep detected ({len(unusual_calls)} unusual call blocks)")
        
        # Put sweep detection  
        if len(unusual_puts) > 3:
            flow_score += 25
            flow_reasons.append(f"Put sweep detected ({len(unusual_puts)} unusual put blocks)")
        
        # Single massive block trade
        max_call_volume = unusual_calls['volume'].max() if not unusual_calls.empty else 0
        if max_call_volume > 10000:
            flow_score += 20
            flow_reasons.append(f"Massive call block trade ({max_call_volume:,} volume)")
        
        return flow_score, flow_reasons
        
    except Exception as e:
        return 0, []

def calculate_max_pain(options_df, symbol):
    """Calculate max pain point where most options expire worthless"""
    try:
        calls = options_df[options_df['type'] == 'call']
        puts = options_df[options_df['type'] == 'put']
        
        if calls.empty or puts.empty:
            return 0, []
        
        # Calculate pain at each strike
        strikes = sorted(set(calls['strike'].tolist() + puts['strike'].tolist()))
        pain_levels = []
        
        for strike in strikes:
            # Calls ITM = max(0, strike - current_price)
            call_pain = calls[calls['strike'] <= strike]['openInterest'].sum()
            # Puts ITM = max(0, current_price - strike) 
            put_pain = puts[puts['strike'] >= strike]['openInterest'].sum()
            total_pain = call_pain + put_pain
            pain_levels.append((strike, total_pain))
        
        # Find strike with minimum pain (max pain point)
        if pain_levels:
            max_pain_strike = min(pain_levels, key=lambda x: x[1])[0]
            return max_pain_strike, [f"Max pain at ${max_pain_strike}"]
        
        return 0, []
        
    except Exception as e:
        return 0, []

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

def get_news_for_symbol(symbol):
    """Get recent news for a specific symbol"""
    try:
        import subprocess
        import json
        
        # Run the news script to get current news
        result = subprocess.run(['./venv/bin/python3', 'scripts/fetch_market_news.py'], 
                              capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            # Parse the JSON output
            lines = result.stdout.strip().split('\n')
            json_start = -1
            for i, line in enumerate(lines):
                if line.strip().startswith('['):
                    json_start = i
                    break
            
            if json_start >= 0:
                json_output = '\n'.join(lines[json_start:])
                news_data = json.loads(json_output)
                
                # Filter news related to this symbol
                symbol_news = []
                for news_item in news_data:
                    if symbol in news_item.get('related', []) or symbol.lower() in news_item.get('headline', '').lower():
                        symbol_news.append(news_item)
                
                return symbol_news[:5]  # Top 5 news items for this symbol
        
        return []
        
    except Exception as e:
        print(f"Error fetching news for {symbol}: {e}")
        return []

def calculate_news_impact_score(news_items):
    """Calculate overall news impact score for opportunities"""
    if not news_items:
        return 0, []
    
    total_impact = 0
    news_reasons = []
    
    for news in news_items:
        impact_score = news.get('impact_score', 0)
        sentiment_score = news.get('sentiment', {}).get('score', 0)
        category = news.get('category', 'general')
        
        # Weight different categories
        category_weights = {
            'political': 3.0,
            'regulatory': 2.5,
            'earnings': 2.0,
            'm&a': 2.0,
            'insider': 1.5,
            'general': 1.0
        }
        
        weight = category_weights.get(category, 1.0)
        weighted_impact = impact_score * weight
        
        # Boost for strong sentiment
        if abs(sentiment_score) > 0.7:
            weighted_impact *= 1.5
        elif abs(sentiment_score) > 0.4:
            weighted_impact *= 1.2
        
        total_impact += weighted_impact
        
        if weighted_impact > 5:  # High impact news
            news_reasons.append(f"{category.title()} news: {news.get('headline', '')[:50]}...")
    
    return min(20, total_impact), news_reasons

def scan_symbols(symbols, max_attempts=50):
    """Scan multiple symbols for superior opportunities with advanced pattern recognition and news analysis"""
    all_opportunities = []
    successful_scans = 0
    failed_scans = 0
    
    for i, symbol in enumerate(symbols):
        if successful_scans >= max_attempts:
            print(f"\nReached maximum successful scans ({max_attempts}). Stopping to avoid rate limits.")
            break
            
        print(f"Scanning {symbol} ({i+1}/{len(symbols)}) - Success: {successful_scans}, Failed: {failed_scans}")
        
        # Fast mode rate limiting (reduced delays)
        if i > 0 and i % 3 == 0:
            print(f"Rate limiting pause after {i} requests...")
            time.sleep(5)  # 5 second pause every 3 requests
        elif i > 0:
            time.sleep(2)  # 2 seconds between requests
        
        options_df = get_options_chain(symbol)
        
        if options_df is None or options_df.empty:
            failed_scans += 1
            continue
        
        successful_scans += 1
        
        # Get current stock price for pattern analysis
        current_price = options_df['stockPrice'].iloc[0] if not options_df.empty else 0
        
        # Get news for this symbol
        symbol_news = get_news_for_symbol(symbol)
        news_impact_score, news_reasons = calculate_news_impact_score(symbol_news)
        
        # Advanced pattern detection
        gamma_squeeze_score, gamma_reasons = detect_gamma_squeeze_potential(options_df, symbol, current_price)
        flow_score, flow_reasons = detect_unusual_options_flow(options_df, symbol)
        max_pain_strike, max_pain_reasons = calculate_max_pain(options_df, symbol)
        
        # Filter for liquid options with potential
        liquid_options = options_df[
            (options_df['volume'] > 100) &  # Higher volume threshold
            (options_df['openInterest'] > 200) &  # Higher OI threshold
            (options_df['lastPrice'] > 0.20) &  # Minimum premium
            (options_df['lastPrice'] < 50)  # Maximum premium (avoid deep ITM)
        ]
        
        for idx, row in liquid_options.iterrows():
            analysis = analyze_opportunity(row)
            
            # Add advanced pattern analysis
            enhanced_analysis = analysis.copy()
            
            # Add news impact analysis
            if news_impact_score > 0:
                enhanced_analysis['score'] += min(25, news_impact_score)
                enhanced_analysis['reasoning'].extend(news_reasons)
                enhanced_analysis['patterns'].append('News Catalyst')
                enhanced_analysis['catalysts'].append('Breaking News Impact')
            
            # Add gamma squeeze analysis if relevant
            if row['type'] == 'call' and gamma_squeeze_score > 0:
                enhanced_analysis['score'] += min(20, gamma_squeeze_score)
                enhanced_analysis['reasoning'].extend(gamma_reasons)
                enhanced_analysis['patterns'].append('Gamma Squeeze Setup')
                enhanced_analysis['catalysts'].append('Gamma Squeeze Potential')
            
            # Add unusual flow analysis
            if flow_score > 0:
                enhanced_analysis['score'] += min(15, flow_score)
                enhanced_analysis['reasoning'].extend(flow_reasons)
                enhanced_analysis['patterns'].append('Unusual Options Flow')
                enhanced_analysis['catalysts'].append('Smart Money Activity')
            
            # Add max pain analysis
            if max_pain_strike > 0:
                strike_distance = abs(row['strike'] - max_pain_strike) / current_price
                if strike_distance < 0.05:  # Within 5% of max pain
                    enhanced_analysis['score'] += 10
                    enhanced_analysis['reasoning'].extend(max_pain_reasons)
                    enhanced_analysis['patterns'].append('Max Pain Proximity')
            
            # Only include HIGH-SCORING opportunities (75+ for superior trades)
            if enhanced_analysis['score'] >= 75:
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
                    'gammaSqueezeScore': gamma_squeeze_score,
                    'unusualFlowScore': flow_score,
                    'maxPainStrike': max_pain_strike,
                    'newsImpactScore': news_impact_score,
                    'recentNews': symbol_news[:3],  # Top 3 news items
                    **enhanced_analysis
                }
                all_opportunities.append(opportunity)
    
    # Sort by score, then by potential return
    all_opportunities.sort(key=lambda x: (x['score'], x['potentialReturn']), reverse=True)
    
    return all_opportunities[:20]  # Top 20 superior opportunities

if __name__ == "__main__":
    # Priority watchlist (scanned first) - highest potential stocks
    PRIORITY_WATCHLIST = [
        # Your requested stocks
        "COIN", "PLTR", "HOOD", "CVNA",
        
        # High volatility meme stocks
        "GME", "AMC", "SPCE", "NKLA", "WKHS", "CLOV",
        
        # Crypto-related high volatility
        "MSTR", "RIOT", "MARA", "HUT", "BITF",
        
        # EVs with high options activity
        "TSLA", "RIVN", "LCID", "NIO", "XPEV",
        
        # Fintech disruptors
        "SOFI", "UPST", "AFRM", "SQ", "PYPL",
        
        # High-beta tech
        "NVDA", "AMD", "META", "NFLX", "ROKU"
    ]
    
    # Comprehensive watchlist for maximum opportunity discovery
    WATCHLIST = [
        # Mega-cap tech with high options volume
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "AMD", "INTC", "CRM",
        
        # High-beta momentum stocks & growth
        "NFLX", "PLTR", "SOFI", "RIVN", "ROKU", "ZM", "DOCU", "PTON", "PINS", "SNAP",
        "SQ", "PYPL", "SHOP", "MELI", "SE", "BABA", "JD", "PDD", "BILI", "VIPS",
        
        # Fintech & Crypto-related (high volatility)
        "COIN", "MSTR", "RIOT", "MARA", "HUT", "BITF", "CAN", "EBON", "SOS", "BTBT",
        "HOOD", "SOFI", "UPST", "LC", "AFRM", "OPEN", "COMP", "Z", "RKT", "UWMC",
        
        # EVs & Transportation
        "RIVN", "LCID", "F", "GM", "FORD", "NIO", "XPEV", "LI", "BZ", "WKHS",
        "RIDE", "NKLA", "HYLN", "GOEV", "FSR", "LEV", "VLTA", "CHPT", "BLNK", "EVGO",
        
        # Meme stocks and high-volatility plays
        "GME", "AMC", "BB", "NOK", "WISH", "CLOV", "WEN", "SPCE", "PLTR", "SOFI",
        "HOOD", "RKT", "UWMC", "CLNE", "WKHS", "SNDL", "TLRY", "CGC", "ACB", "HEXO",
        
        # Biotech & Pharma (high event risk)
        "BNTX", "MRNA", "PFE", "JNJ", "ABBV", "LLY", "MRK", "UNH", "CVS", "WBA",
        "GILD", "AMGN", "BIIB", "REGN", "VRTX", "ILMN", "MRNA", "NVAX", "OCGN", "VAXART",
        
        # Software & Cloud
        "CRM", "ADBE", "ORCL", "NOW", "WDAY", "SNOW", "DDOG", "NET", "CRWD", "ZS",
        "OKTA", "SPLK", "TEAM", "MDB", "ESTC", "AYX", "TWLO", "ZM", "DOCU", "WORK",
        
        # Semiconductors & Hardware
        "NVDA", "AMD", "INTC", "QCOM", "AVGO", "TXN", "MRVL", "ADI", "AMAT", "LRCX",
        "KLAC", "MCHP", "NXPI", "SWKS", "QRVO", "TER", "SNPS", "CDNS", "ANSS", "KEYS",
        
        # ETFs for broad market moves
        "SPY", "QQQ", "IWM", "TQQQ", "SPXL", "UPRO", "TMF", "TBT", "VIX", "UVXY",
        "VXX", "SVXY", "SQQQ", "SPXS", "SPXU", "TZA", "TECS", "FAS", "FAZ", "ERX",
        
        # Financial sector
        "JPM", "BAC", "WFC", "GS", "MS", "C", "USB", "PNC", "TFC", "COF",
        "AXP", "V", "MA", "DFS", "FISV", "FIS", "GPN", "FLT", "WU", "PYPL",
        
        # Energy & Materials
        "XOM", "CVX", "COP", "EOG", "PXD", "MPC", "VLO", "PSX", "KMI", "EPD",
        "FCX", "NEM", "GOLD", "AA", "X", "CLF", "MT", "VALE", "RIO", "BHP",
        
        # Retail & Consumer
        "WMT", "TGT", "HD", "LOW", "COST", "AMZN", "EBAY", "ETSY", "W", "CHWY",
        "PTON", "NKE", "LULU", "ULTA", "TSCO", "AZO", "ORLY", "AAP", "KO", "PEP",
        
        # Healthcare & Medical
        "JNJ", "PFE", "UNH", "ABBV", "MRK", "LLY", "TMO", "ABT", "DHR", "BMY",
        "AMGN", "GILD", "BIIB", "REGN", "VRTX", "ILMN", "ISRG", "SYK", "MDT", "BSX",
        
        # Industrial & Aerospace
        "BA", "CAT", "DE", "GE", "HON", "MMM", "UPS", "FDX", "LMT", "RTX",
        "NOC", "GD", "TDG", "LHX", "TXT", "EMR", "ETN", "ITW", "PH", "CMI",
        
        # Real Estate & REITs
        "AMT", "PLD", "CCI", "EQIX", "PSA", "EXR", "AVB", "EQR", "MAA", "UDR",
        "WELL", "VTR", "PEAK", "OHI", "MPW", "STAG", "STWD", "BXMT", "TWO", "NYMT",
        
        # Small & Mid Cap Growth
        "ARKK", "ARKQ", "ARKG", "ARKW", "ARKF", "TAN", "ICLN", "PBW", "QCLN", "SMH",
        "SOXX", "XSD", "FTEC", "VGT", "XLK", "IYW", "IGM", "MGK", "VUG", "IWF",
        
        # Special Situations & Turnarounds
        "TWTR", "SNAP", "PINS", "ROKU", "PTON", "ZM", "DOCU", "WORK", "SPOT", "UBER",
        "LYFT", "ABNB", "DASH", "GRUB", "YELP", "TRIP", "BKNG", "EXPE", "MAR", "HLT",
        "CVNA", "CHWY", "PTON", "ROKU", "ZM", "DOCU", "WORK", "SPOT", "UBER", "LYFT",
        
        # International & Emerging Markets
        "BABA", "JD", "PDD", "BILI", "VIPS", "TME", "YMM", "NTES", "BIDU", "WB",
        "NIO", "XPEV", "LI", "BZ", "TAL", "EDU", "VIPS", "WB", "MOMO", "YY",
        
        # SPACs & Recent IPOs (high volatility)
        "SPCE", "NKLA", "HYLN", "GOEV", "WKHS", "RIDE", "FSR", "LEV", "VLTA", "CHPT",
        "OPEN", "COMP", "Z", "RKT", "UWMC", "SOFI", "UPST", "LC", "AFRM", "HOOD",
        
        # Gaming & Entertainment
        "ATVI", "EA", "TTWO", "NTDOY", "UBSFY", "NFLX", "DIS", "CMCSA", "VIAC", "PARA",
        "ROKU", "SPOT", "TME", "YMM", "BILI", "HUYA", "DOYU", "WB", "MOMO", "YY",
        
        # Cannabis & Psychedelics
        "TLRY", "CGC", "ACB", "HEXO", "CRON", "OGI", "CURLF", "GTBIF", "TCNNF", "VRNOF",
        "SNDL", "CTXR", "MNMD", "CMPS", "ATAI", "COMPASS", "FTRP", "DRUG", "SEEL", "MYCO"
    ]
    
    print("Starting advanced options scan for superior opportunities...")
    print(f"Priority scan: {len(PRIORITY_WATCHLIST)} high-potential stocks")
    print(f"Full scan: {len(WATCHLIST)} total stocks")
    
    # Randomize the priority list to avoid always scanning the same stocks first
    import random
    random.shuffle(PRIORITY_WATCHLIST)
    print(f"Randomized priority order: {PRIORITY_WATCHLIST[:5]}...")
    
    # FAST MODE: Scan only 5-8 priority stocks for quick results (under 60 seconds)
    print(f"FAST MODE: Scanning top 8 priority stocks for quick results...")
    opportunities = scan_symbols(PRIORITY_WATCHLIST[:8], max_attempts=8)
    
    # No sample data - only real market opportunities
    if len(opportunities) == 0:
        print(f"\nNo opportunities found due to rate limits. Try again later when market conditions improve.")
    
    print(f"\nFound {len(opportunities)} superior opportunities (score >= 70)")
    
    # Output as JSON
    print(json.dumps(opportunities, indent=2))

