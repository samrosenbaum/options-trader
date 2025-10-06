#!/usr/bin/env python3
"""
Smart Options Scanner - Uses cached data and intelligent fetching
"""

import json
import time
import pandas as pd
from datetime import datetime, timedelta
from bulk_options_fetcher import BulkOptionsFetcher

class SmartOptionsScanner:
    def __init__(self):
        self.fetcher = BulkOptionsFetcher()
        self.cache_file = "options_cache.json"
        self.last_fetch_time = None
        
    def is_market_hours(self):
        """Check if market is currently open"""
        now = datetime.now()
        market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)
        
        # Simple check - in real implementation, handle weekends/holidays
        return market_open <= now <= market_close
    
    def should_refresh_data(self):
        """Determine if we need fresh data"""
        if not self.is_market_hours():
            return False
        
        if self.last_fetch_time is None:
            return True
        
        # Refresh every 5 minutes during market hours
        time_since_fetch = (datetime.now() - self.last_fetch_time).total_seconds()
        return time_since_fetch > 300  # 5 minutes
    
    def get_current_options_data(self):
        """Get current options data, using cache if appropriate"""
        if self.should_refresh_data():
            print("🔄 Market is open and data needs refresh - fetching fresh data...")
            data = self.fetcher.get_fresh_options_data(use_cache=False)
            self.last_fetch_time = datetime.now()
        else:
            print("📂 Using cached data (market closed or recent fetch)")
            data = self.fetcher.get_fresh_options_data(use_cache=True)
        
        return data
    
    def analyze_opportunities(self, options_data):
        """Analyze options data for opportunities"""
        if options_data is None or options_data.empty:
            return []
        
        opportunities = []
        
        # Filter for liquid options
        liquid_options = options_data[
            (options_data['volume'] > 100) &
            (options_data['openInterest'] > 500) &
            (options_data['lastPrice'] > 0.20)
        ]
        
        print(f"📊 Analyzing {len(liquid_options)} liquid options...")
        
        for idx, option in liquid_options.iterrows():
            score = self.calculate_opportunity_score(option)
            
            if score >= 70:  # High-scoring opportunities only
                opportunity = {
                    'symbol': option['symbol'],
                    'optionType': option['type'],
                    'strike': float(option['strike']),
                    'expiration': option['expiration'],
                    'premium': float(option['lastPrice']),
                    'bid': float(option['bid']),
                    'ask': float(option['ask']),
                    'volume': int(option['volume']),
                    'openInterest': int(option['openInterest']),
                    'impliedVolatility': float(option['impliedVolatility']) if pd.notna(option['impliedVolatility']) else 0.3,
                    'stockPrice': float(option['stockPrice']),
                    'score': score,
                    'confidence': min(95, score * 0.9),
                    'reasoning': self.generate_reasoning(option, score),
                    'catalysts': ['Technical Analysis', 'Volume Analysis'],
                    'patterns': ['Options Flow', 'Liquidity Analysis'],
                    'riskLevel': self.assess_risk_level(option),
                    'potentialReturn': self.calculate_potential_return(option),
                    'maxReturn': self.calculate_max_return(option),
                    'maxLoss': float(option['lastPrice'] * 100),
                    'breakeven': self.calculate_breakeven(option),
                    'ivRank': self.calculate_iv_rank(option),
                    'volumeRatio': float(option['volume'] / max(option['openInterest'], 1)),
                    'greeks': self.calculate_greeks_approximation(option),
                    'daysToExpiration': self.calculate_days_to_expiration(option['expiration']),
                    'returnsAnalysis': self.calculate_returns_analysis(option)
                }
                opportunities.append(opportunity)
        
        return opportunities
    
    def calculate_opportunity_score(self, option):
        """Calculate opportunity score based on multiple factors"""
        score = 0
        
        # Volume analysis
        volume_ratio = option['volume'] / max(option['openInterest'], 1)
        if volume_ratio > 3:
            score += 30
        elif volume_ratio > 2:
            score += 20
        elif volume_ratio > 1:
            score += 10
        
        # Liquidity analysis
        spread_pct = (option['ask'] - option['bid']) / max(option['lastPrice'], 0.01)
        if spread_pct < 0.05:
            score += 25
        elif spread_pct < 0.10:
            score += 15
        elif spread_pct < 0.20:
            score += 10
        
        # IV analysis
        if pd.notna(option['impliedVolatility']):
            iv = option['impliedVolatility']
            if iv > 0.4:  # High IV
                score += 20
            elif iv > 0.25:  # Medium IV
                score += 15
            else:  # Low IV
                score += 10
        
        # Moneyness analysis
        if option['type'] == 'call':
            moneyness = (option['strike'] - option['stockPrice']) / option['stockPrice']
        else:
            moneyness = (option['stockPrice'] - option['strike']) / option['stockPrice']
        
        if -0.05 < moneyness < 0.05:  # Near the money
            score += 20
        elif -0.10 < moneyness < 0.10:  # Close to the money
            score += 15
        
        return min(100, score)
    
    def generate_reasoning(self, option, score):
        """Generate reasoning for the opportunity"""
        reasoning = []
        
        volume_ratio = option['volume'] / max(option['openInterest'], 1)
        if volume_ratio > 2:
            reasoning.append(f"Unusual volume ({volume_ratio:.1f}x open interest)")
        
        spread_pct = (option['ask'] - option['bid']) / max(option['lastPrice'], 0.01)
        if spread_pct < 0.10:
            reasoning.append("Good liquidity (tight spread)")
        
        if pd.notna(option['impliedVolatility']):
            iv = option['impliedVolatility']
            if iv > 0.4:
                reasoning.append(f"High implied volatility ({iv:.1%})")
        
        return reasoning
    
    def assess_risk_level(self, option):
        """Assess risk level based on option characteristics"""
        if option['lastPrice'] < 1.0:
            return 'high'
        elif option['lastPrice'] < 5.0:
            return 'medium'
        else:
            return 'low'
    
    def calculate_potential_return(self, option):
        """Calculate potential return on 10% move"""
        # Simplified calculation
        return option['lastPrice'] * 10  # 10x return estimate
    
    def calculate_max_return(self, option):
        """Calculate maximum potential return"""
        return option['lastPrice'] * 20  # 20x return estimate
    
    def calculate_breakeven(self, option):
        """Calculate breakeven price"""
        if option['type'] == 'call':
            return option['strike'] + option['lastPrice']
        else:
            return option['strike'] - option['lastPrice']
    
    def calculate_iv_rank(self, option):
        """Calculate IV rank (simplified)"""
        if pd.notna(option['impliedVolatility']):
            # Simplified IV rank calculation
            return min(100, option['impliedVolatility'] * 100)
        return 50
    
    def calculate_greeks_approximation(self, option):
        """Calculate approximate Greeks"""
        return {
            'delta': 0.5,  # Simplified
            'gamma': 0.01,
            'theta': -0.05,
            'vega': 0.1
        }
    
    def calculate_days_to_expiration(self, expiration_date):
        """Calculate days to expiration"""
        try:
            exp_date = pd.to_datetime(expiration_date)
            return (exp_date - datetime.now()).days
        except:
            return 30
    
    def calculate_returns_analysis(self, option):
        """Calculate returns for different move scenarios"""
        return [
            {'move': '10%', 'return': option['lastPrice'] * 8},
            {'move': '20%', 'return': option['lastPrice'] * 15},
            {'move': '30%', 'return': option['lastPrice'] * 25}
        ]
    
    def scan_for_opportunities(self):
        """Main scanning function"""
        print("🔍 Starting smart options scan...")
        
        # Get current options data
        options_data = self.get_current_options_data()
        
        if options_data is None:
            print("❌ No options data available")
            return []
        
        # Analyze for opportunities
        opportunities = self.analyze_opportunities(options_data)
        
        print(f"✅ Found {len(opportunities)} high-scoring opportunities")
        
        return opportunities

def main():
    scanner = SmartOptionsScanner()
    opportunities = scanner.scan_for_opportunities()
    
    if opportunities:
        print(f"\n📊 Top opportunities:")
        for i, opp in enumerate(opportunities[:5]):
            print(f"{i+1}. {opp['symbol']} {opp['optionType']} {opp['strike']} - Score: {opp['score']}")
    
    # Output as JSON for API consumption
    print(json.dumps(opportunities, indent=2))

if __name__ == "__main__":
    main()
