#!/usr/bin/env python3
"""
Analyze Robinhood (HOOD) options data to identify signals that could have predicted
a 10% drop and recommended profitable put positions.

This script:
1. Fetches current and historical HOOD options data
2. Analyzes unusual put activity and bearish signals
3. Identifies which puts would have been most profitable
4. Creates a framework for predicting future drops
"""

import yfinance as yf
from datetime import datetime, timedelta
import pandas as pd
from typing import Dict, List, Tuple, Any
import json

def fetch_hood_data():
    """Fetch HOOD stock and options data"""
    print("=" * 80)
    print("ROBINHOOD (HOOD) OPTIONS ANALYSIS - 10% DROP PREDICTION")
    print("=" * 80)

    hood = yf.Ticker('HOOD')

    # Get historical price data first (more reliable than info)
    hist = hood.history(period='5d', interval='1d')

    # Try to get current price from historical data first
    if len(hist) > 0:
        current_price = float(hist['Close'].iloc[-1])
    else:
        print("⚠️  Warning: Could not fetch historical data, using fallback")
        current_price = 0.0

    print(f"\n📊 HOOD Stock Information")

    # Try to get additional info if available
    try:
        info = hood.info
        if info and 'currentPrice' in info:
            current_price = info.get('currentPrice', current_price)
    except:
        pass  # Ignore if info is not available

    print(f"Current Price: ${current_price:.2f}")

    if len(hist) >= 2:
        prev_close = hist['Close'].iloc[-2]
        today_close = hist['Close'].iloc[-1]
        pct_change = ((today_close - prev_close) / prev_close) * 100
        print(f"Previous Close: ${prev_close:.2f}")
        print(f"Latest Close: ${today_close:.2f}")
        print(f"Change: {pct_change:.2f}%")

        if pct_change < -5:
            print(f"⚠️  SIGNIFICANT DROP DETECTED: {pct_change:.2f}%")

    print("\n" + "=" * 80)

    return hood, current_price, hist

def analyze_options_chain(hood, current_price):
    """Analyze options chain for bearish signals"""

    try:
        # Get available expiration dates
        expirations = hood.options
        if not expirations:
            print("❌ No options data available")
            return None, None

        print(f"\n🔍 Analyzing Options Chain")
        print(f"Available Expirations: {len(expirations)}")

        # Analyze first 3 expirations (near-term options)
        all_puts = []
        all_calls = []

        for i, exp_date in enumerate(expirations[:3]):
            print(f"\n📅 Expiration {i+1}: {exp_date}")

            try:
                chain = hood.option_chain(exp_date)
                puts = chain.puts
                calls = chain.calls

                # Add expiration date to dataframes
                puts['expiration'] = exp_date
                calls['expiration'] = exp_date

                all_puts.append(puts)
                all_calls.append(calls)

                print(f"   Puts: {len(puts)} contracts")
                print(f"   Calls: {len(calls)} contracts")

            except Exception as e:
                print(f"   ❌ Error fetching chain: {e}")
                continue

        if not all_puts or not all_calls:
            print("❌ No options data retrieved")
            return None, None

        # Combine all expirations
        all_puts_df = pd.concat(all_puts, ignore_index=True)
        all_calls_df = pd.concat(all_calls, ignore_index=True)

        return all_puts_df, all_calls_df

    except Exception as e:
        print(f"❌ Error analyzing options: {e}")
        return None, None

def identify_unusual_put_activity(puts_df, current_price):
    """Identify unusual put buying activity that signals bearish sentiment"""

    print("\n" + "=" * 80)
    print("🚨 UNUSUAL PUT ACTIVITY ANALYSIS")
    print("=" * 80)

    signals = []

    if puts_df is None or len(puts_df) == 0:
        print("❌ No put data available")
        return signals

    # 1. High Volume to Open Interest Ratio (indicates fresh positioning)
    puts_df['vol_oi_ratio'] = puts_df['volume'] / (puts_df['openInterest'] + 1)

    # 2. Find ATM and slightly OTM puts (these are most profitable for drops)
    puts_df['distance_from_price'] = abs(puts_df['strike'] - current_price)
    puts_df['pct_from_price'] = (puts_df['strike'] - current_price) / current_price * 100

    # ATM range: within 5% of current price
    atm_puts = puts_df[abs(puts_df['pct_from_price']) <= 5].copy()

    print(f"\n📍 At-The-Money Puts Analysis (within 5% of ${current_price:.2f})")
    print(f"Total ATM Put Contracts: {len(atm_puts)}")

    # 3. Identify high volume puts
    high_volume_puts = atm_puts[atm_puts['volume'] > 100].sort_values('volume', ascending=False)

    if len(high_volume_puts) > 0:
        print(f"\n🔥 High Volume ATM Puts (>100 contracts):")
        for idx, put in high_volume_puts.head(10).iterrows():
            print(f"   ${put['strike']:.2f} strike | Vol: {put['volume']:.0f} | OI: {put['openInterest']:.0f} | "
                  f"Vol/OI: {put['vol_oi_ratio']:.2f}x | IV: {put['impliedVolatility']:.1%}")

            # Signal if Volume/OI > 2 (unusual activity)
            if put['vol_oi_ratio'] >= 2.0:
                signals.append({
                    'type': 'UNUSUAL_PUT_VOLUME',
                    'strike': put['strike'],
                    'volume': put['volume'],
                    'open_interest': put['openInterest'],
                    'vol_oi_ratio': put['vol_oi_ratio'],
                    'iv': put['impliedVolatility'],
                    'expiration': put['expiration'],
                    'severity': 'HIGH' if put['vol_oi_ratio'] >= 3.0 else 'MEDIUM'
                })

    # 4. Calculate Put/Call Ratio
    total_put_volume = puts_df['volume'].sum()

    print(f"\n📊 Overall Put Volume: {total_put_volume:.0f}")

    # 5. Premium flow analysis ($ volume)
    puts_df['premium_flow'] = puts_df['volume'] * puts_df['lastPrice']
    total_put_premium = puts_df['premium_flow'].sum()

    print(f"💰 Total Put Premium Flow: ${total_put_premium:,.0f}")

    # 6. Largest premium flows (smart money)
    top_premium_puts = puts_df.sort_values('premium_flow', ascending=False).head(10)
    print(f"\n💎 Largest Put Premium Flows (Smart Money):")
    for idx, put in top_premium_puts.iterrows():
        if put['premium_flow'] > 0:
            print(f"   ${put['strike']:.2f} strike | {put['expiration']} | "
                  f"Premium: ${put['premium_flow']:,.0f} | Vol: {put['volume']:.0f}")

            if put['premium_flow'] > 10000:  # $10k+ flow
                signals.append({
                    'type': 'LARGE_PUT_FLOW',
                    'strike': put['strike'],
                    'premium_flow': put['premium_flow'],
                    'volume': put['volume'],
                    'expiration': put['expiration'],
                    'severity': 'HIGH' if put['premium_flow'] > 50000 else 'MEDIUM'
                })

    return signals

def calculate_put_call_ratio(puts_df, calls_df):
    """Calculate put/call ratio - high ratio indicates bearish sentiment"""

    print("\n" + "=" * 80)
    print("📈 PUT/CALL RATIO ANALYSIS")
    print("=" * 80)

    if puts_df is None or calls_df is None:
        print("❌ Missing data")
        return None

    total_put_volume = puts_df['volume'].sum()
    total_call_volume = calls_df['volume'].sum()

    total_put_oi = puts_df['openInterest'].sum()
    total_call_oi = calls_df['openInterest'].sum()

    pc_ratio_volume = total_put_volume / (total_call_volume + 1)
    pc_ratio_oi = total_put_oi / (total_call_oi + 1)

    print(f"\nPut Volume: {total_put_volume:.0f}")
    print(f"Call Volume: {total_call_volume:.0f}")
    print(f"📊 Put/Call Ratio (Volume): {pc_ratio_volume:.2f}")

    print(f"\nPut Open Interest: {total_put_oi:.0f}")
    print(f"Call Open Interest: {total_call_oi:.0f}")
    print(f"📊 Put/Call Ratio (OI): {pc_ratio_oi:.2f}")

    # Interpret the ratio
    if pc_ratio_volume > 1.0:
        print(f"\n🚨 BEARISH SIGNAL: P/C ratio {pc_ratio_volume:.2f} indicates more put than call activity")
        severity = 'HIGH' if pc_ratio_volume > 1.5 else 'MEDIUM'
    elif pc_ratio_volume > 0.7:
        print(f"\n⚠️  CAUTIOUS: P/C ratio {pc_ratio_volume:.2f} shows elevated put activity")
        severity = 'MEDIUM'
    else:
        print(f"\n✅ NEUTRAL/BULLISH: P/C ratio {pc_ratio_volume:.2f} shows more call activity")
        severity = 'LOW'

    return {
        'pc_ratio_volume': pc_ratio_volume,
        'pc_ratio_oi': pc_ratio_oi,
        'put_volume': total_put_volume,
        'call_volume': total_call_volume,
        'severity': severity
    }

def calculate_profitable_puts(puts_df, current_price, drop_pct=10):
    """Calculate which puts would have been most profitable from a 10% drop"""

    print("\n" + "=" * 80)
    print(f"💰 PROFITABILITY ANALYSIS - {drop_pct}% DROP")
    print("=" * 80)

    if puts_df is None or len(puts_df) == 0:
        print("❌ No put data available")
        return []

    # Calculate price after 10% drop
    price_after_drop = current_price * (1 - drop_pct/100)

    print(f"\nCurrent Price: ${current_price:.2f}")
    print(f"Price After {drop_pct}% Drop: ${price_after_drop:.2f}")

    # Filter to near-term options (first expiration)
    first_exp = puts_df['expiration'].iloc[0]
    near_term_puts = puts_df[puts_df['expiration'] == first_exp].copy()

    print(f"Analyzing {len(near_term_puts)} puts expiring {first_exp}")

    # Calculate intrinsic value after drop
    near_term_puts['intrinsic_after_drop'] = near_term_puts['strike'] - price_after_drop
    near_term_puts['intrinsic_after_drop'] = near_term_puts['intrinsic_after_drop'].apply(lambda x: max(0, x))

    # Calculate profit (intrinsic value - premium paid)
    near_term_puts['profit'] = near_term_puts['intrinsic_after_drop'] - near_term_puts['lastPrice']
    near_term_puts['profit_pct'] = (near_term_puts['profit'] / near_term_puts['lastPrice']) * 100

    # Filter to profitable puts
    profitable_puts = near_term_puts[near_term_puts['profit'] > 0].sort_values('profit_pct', ascending=False)

    print(f"\n🎯 Most Profitable Put Recommendations:")
    print("=" * 80)

    recommendations = []

    for idx, put in profitable_puts.head(10).iterrows():
        roi = put['profit_pct']
        print(f"\n${put['strike']:.2f} Strike Put:")
        print(f"  Entry Price: ${put['lastPrice']:.2f}")
        print(f"  Value After Drop: ${put['intrinsic_after_drop']:.2f}")
        print(f"  Profit Per Contract: ${put['profit']:.2f}")
        print(f"  ROI: {roi:.1f}%")
        print(f"  Volume: {put['volume']:.0f} | OI: {put['openInterest']:.0f}")

        # Calculate position sizing
        contracts_for_1k = int(1000 / (put['lastPrice'] * 100))
        potential_profit_1k = contracts_for_1k * put['profit'] * 100

        print(f"  💵 $1,000 Position: {contracts_for_1k} contracts = ${potential_profit_1k:,.0f} profit")

        recommendations.append({
            'strike': put['strike'],
            'entry_price': put['lastPrice'],
            'value_after_drop': put['intrinsic_after_drop'],
            'profit_per_contract': put['profit'],
            'roi_pct': roi,
            'volume': put['volume'],
            'open_interest': put['openInterest'],
            'expiration': first_exp
        })

    return recommendations

def generate_prediction_framework(signals, pc_ratio, recommendations):
    """Generate framework for predicting future drops"""

    print("\n" + "=" * 80)
    print("🎯 PREDICTION FRAMEWORK FOR FUTURE DROPS")
    print("=" * 80)

    print("\n📋 Key Signals to Monitor:")
    print("\n1. PUT/CALL RATIO")
    print(f"   ⚠️  Alert when P/C ratio > 1.0 (current: {pc_ratio.get('pc_ratio_volume', 0):.2f})")
    print(f"   🚨 Strong signal when P/C ratio > 1.5")

    print("\n2. UNUSUAL PUT VOLUME")
    print("   ⚠️  Watch for Volume/OI ratio > 2.0x on ATM puts")
    print("   🚨 Strong signal when Vol/OI > 3.0x")

    print("\n3. LARGE PREMIUM FLOWS")
    print("   ⚠️  Monitor put positions with $10k+ premium flow")
    print("   🚨 Strong signal with $50k+ premium flow")

    print("\n4. SMART MONEY INDICATORS")
    print("   - Multiple large put buyers in same strike/expiration")
    print("   - Concentrated activity in near-term expirations")
    print("   - Increasing put volume over multiple days")

    high_severity_signals = [s for s in signals if s.get('severity') == 'HIGH']
    medium_severity_signals = [s for s in signals if s.get('severity') == 'MEDIUM']

    print(f"\n📊 Current Signal Count:")
    print(f"   🔴 HIGH Severity: {len(high_severity_signals)}")
    print(f"   🟡 MEDIUM Severity: {len(medium_severity_signals)}")

    print("\n🎲 Recommendation Criteria:")
    print("   ✅ Recommend PUTS when:")
    print("      - P/C ratio > 1.2 AND")
    print("      - 2+ high severity unusual activity signals AND")
    print("      - Large premium flow concentrated in specific strikes")

    print("\n💡 Optimal Put Strategy:")
    if recommendations:
        best_strike = recommendations[0]['strike']
        print(f"   - Strike: ${best_strike:.2f} (ATM or slightly OTM)")
        print(f"   - Expiration: Near-term (1-4 weeks out)")
        print(f"   - Position Size: 1-2% of portfolio")
        print(f"   - Expected ROI on 10% drop: {recommendations[0]['roi_pct']:.0f}%+")

    # Decision framework
    signal_score = len(high_severity_signals) * 3 + len(medium_severity_signals)
    pc_score = 3 if pc_ratio.get('pc_ratio_volume', 0) > 1.5 else (2 if pc_ratio.get('pc_ratio_volume', 0) > 1.0 else 0)
    total_score = signal_score + pc_score

    print(f"\n🎯 CURRENT BEARISH SCORE: {total_score}/15")
    if total_score >= 8:
        recommendation = "🚨 STRONG BEARISH - RECOMMEND PUTS"
    elif total_score >= 5:
        recommendation = "⚠️  MODERATE BEARISH - CONSIDER PUTS"
    else:
        recommendation = "✅ NEUTRAL - NO PUT RECOMMENDATION"

    print(f"   {recommendation}")

    return {
        'signal_score': signal_score,
        'pc_score': pc_score,
        'total_score': total_score,
        'recommendation': recommendation,
        'high_severity_count': len(high_severity_signals),
        'medium_severity_count': len(medium_severity_signals)
    }

def main():
    """Main analysis function"""

    # 1. Fetch HOOD data
    hood, current_price, hist = fetch_hood_data()

    # 2. Get options chain
    puts_df, calls_df = analyze_options_chain(hood, current_price)

    if puts_df is None or calls_df is None:
        print("\n❌ Unable to fetch options data. Analysis incomplete.")
        return

    # 3. Identify unusual put activity
    signals = identify_unusual_put_activity(puts_df, current_price)

    # 4. Calculate put/call ratio
    pc_ratio = calculate_put_call_ratio(puts_df, calls_df)

    # 5. Calculate profitable puts
    recommendations = calculate_profitable_puts(puts_df, current_price, drop_pct=10)

    # 6. Generate prediction framework
    framework = generate_prediction_framework(signals, pc_ratio or {}, recommendations)

    # 7. Summary
    print("\n" + "=" * 80)
    print("📝 EXECUTIVE SUMMARY")
    print("=" * 80)

    print(f"\n🎯 Analysis Results:")
    print(f"   - Bearish Signals Detected: {len(signals)}")
    print(f"   - Put/Call Ratio: {pc_ratio.get('pc_ratio_volume', 0):.2f}")
    print(f"   - Bearish Score: {framework['total_score']}/15")
    print(f"   - Recommendation: {framework['recommendation']}")

    if recommendations:
        print(f"\n💰 Best Put Trade:")
        best = recommendations[0]
        print(f"   - Strike: ${best['strike']:.2f}")
        print(f"   - Entry: ${best['entry_price']:.2f}")
        print(f"   - Potential ROI: {best['roi_pct']:.0f}%")
        print(f"   - Expiration: {best['expiration']}")

    print("\n" + "=" * 80)
    print("✅ Analysis Complete!")
    print("=" * 80)

    # Save results to JSON
    results = {
        'timestamp': datetime.now().isoformat(),
        'ticker': 'HOOD',
        'current_price': current_price,
        'signals': signals,
        'put_call_ratio': pc_ratio,
        'recommendations': recommendations,
        'framework': framework
    }

    output_file = '/home/user/options-trader/hood_analysis_results.json'
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n📁 Results saved to: {output_file}")

if __name__ == '__main__':
    main()
