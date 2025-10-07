#!/usr/bin/env python3
"""Smart Options Scanner - Uses cached data and intelligent fetching"""

import argparse
import json
import time
from math import isfinite

import pandas as pd
from datetime import datetime

from bulk_options_fetcher import BulkOptionsFetcher
from src.config import get_settings

class SmartOptionsScanner:
    def __init__(self, max_symbols: int | None = None):
        settings = get_settings()
        self.symbol_limit = max_symbols if max_symbols is not None else settings.fetcher.max_priority_symbols
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
            data = self.fetcher.get_fresh_options_data(use_cache=False, max_symbols=self.symbol_limit)
            self.last_fetch_time = datetime.now()
        else:
            print("📂 Using cached data (market closed or recent fetch)")
            data = self.fetcher.get_fresh_options_data(use_cache=True, max_symbols=self.symbol_limit)
        
        return data
    
    def analyze_opportunities(self, options_data):
        """Analyze options data for opportunities"""
        if options_data is None or options_data.empty:
            return []
        
        opportunities = []

        # Normalize numeric columns to avoid dtype issues
        numeric_columns = ['volume', 'openInterest', 'lastPrice', 'bid', 'ask', 'impliedVolatility', 'stockPrice']
        for col in numeric_columns:
            if col in options_data.columns:
                options_data[col] = pd.to_numeric(options_data[col], errors='coerce')

        # Filter for liquid, tradeable contracts
        liquid_options = options_data[
            (options_data['volume'] > 200)
            & (options_data['openInterest'] > 1000)
            & (options_data['lastPrice'] > 0.25)
            & (options_data['bid'] > 0)
            & (options_data['ask'] > 0)
        ]

        print(f"📊 Analyzing {len(liquid_options)} liquid options...")

        for _, option in liquid_options.iterrows():
            returns_analysis, metrics = self.calculate_returns_analysis(option)
            probability_score = self.calculate_probability_score(option, metrics)
            score = self.calculate_opportunity_score(option, metrics, probability_score)

            best_roi = metrics['bestRoiPercent']
            if best_roi <= 0:
                continue

            high_asymmetry = best_roi >= 220
            high_conviction = probability_score >= 28 and metrics['tenMoveRoiPercent'] >= 40

            if score >= 75 and (high_asymmetry or high_conviction):
                volume_ratio = float(option['volume'] / max(option['openInterest'], 1))
                spread_pct = (option['ask'] - option['bid']) / max(option['lastPrice'], 0.01)
                probability_percent = self.estimate_probability_percent(probability_score)

                reasoning = self.generate_reasoning(option, score, metrics, probability_score, volume_ratio, spread_pct)
                catalysts = ['Volume/Flow Confirmation', 'Favourable Risk-Reward Setup']
                patterns = ['Liquidity Analysis', 'Risk/Reward Modeling']
                if best_roi >= 250:
                    patterns.append('Asymmetrical Upside')
                if probability_percent >= 70:
                    catalysts.append('High Conviction Setup')

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
                    'impliedVolatility': float(option['impliedVolatility']) if pd.notna(option['impliedVolatility']) else 0.0,
                    'stockPrice': float(option['stockPrice']),
                    'score': score,
                    'confidence': min(95, (score * 0.35) + (probability_percent * 0.65)),
                    'reasoning': reasoning,
                    'catalysts': catalysts,
                    'patterns': patterns,
                    'riskLevel': self.assess_risk_level(option, metrics, probability_score),
                    'potentialReturn': metrics['tenMoveRoiPercent'],
                    'potentialReturnAmount': metrics['tenMoveNetProfit'],
                    'maxReturn': metrics['bestRoiPercent'],
                    'maxReturnAmount': metrics['bestNetProfit'],
                    'maxLossPercent': 100.0,
                    'maxLossAmount': metrics['costBasis'],
                    'maxLoss': metrics['costBasis'],
                    'breakeven': metrics['breakevenPrice'],
                    'breakevenPrice': metrics['breakevenPrice'],
                    'breakevenMovePercent': metrics['breakevenMovePercent'],
                    'ivRank': self.calculate_iv_rank(option),
                    'volumeRatio': volume_ratio,
                    'probabilityOfProfit': probability_percent,
                    'profitProbabilityExplanation': self.build_probability_explanation(option, metrics, probability_percent, volume_ratio),
                    'riskRewardRatio': metrics['bestRoiPercent'] / 100 if metrics['bestRoiPercent'] > 0 else None,
                    'shortTermRiskRewardRatio': metrics['tenMoveRoiPercent'] / 100 if metrics['tenMoveRoiPercent'] > 0 else None,
                    'greeks': self.calculate_greeks_approximation(option),
                    'daysToExpiration': self.calculate_days_to_expiration(option['expiration']),
                    'returnsAnalysis': returns_analysis,
                }
                opportunities.append(opportunity)

        return opportunities

    def calculate_opportunity_score(self, option, metrics, probability_score):
        """Calculate opportunity score based on liquidity, risk/reward and probability."""

        score = 0.0

        volume_ratio = option['volume'] / max(option['openInterest'], 1)
        if volume_ratio > 4:
            score += 18
        elif volume_ratio > 3:
            score += 15
        elif volume_ratio > 2:
            score += 12
        elif volume_ratio > 1.5:
            score += 8

        spread_pct = (option['ask'] - option['bid']) / max(option['lastPrice'], 0.01)
        if spread_pct < 0.05:
            score += 18
        elif spread_pct < 0.1:
            score += 12
        elif spread_pct < 0.2:
            score += 6

        best_roi = max(0.0, metrics['bestRoiPercent'])
        short_term_roi = max(0.0, metrics['tenMoveRoiPercent'])

        score += min(35, best_roi / 4)
        score += min(12, short_term_roi / 6)
        score += probability_score

        iv = option['impliedVolatility']
        if pd.notna(iv):
            if 0.2 <= iv <= 0.6:
                score += 5
            elif iv > 0.8:
                score -= 3

        return float(max(0.0, min(100.0, score)))

    def generate_reasoning(self, option, score, metrics, probability_score, volume_ratio, spread_pct):
        """Generate natural language reasoning for the opportunity."""

        reasoning = []

        if volume_ratio > 2:
            reasoning.append(f"Unusual demand with {volume_ratio:.1f}x open interest volume")

        if spread_pct < 0.1:
            reasoning.append("Tight bid/ask spread supporting fast entries and exits")

        breakeven_move = metrics['breakevenMovePercent']
        if isfinite(breakeven_move):
            if breakeven_move <= 0:
                reasoning.append("Already trading beyond breakeven levels")
            elif breakeven_move <= 5:
                reasoning.append(f"Requires only a {breakeven_move:.1f}% move to break even")
            elif breakeven_move <= 8:
                reasoning.append(f"Reasonable {breakeven_move:.1f}% move needed to break even")

        if metrics['bestRoiPercent'] >= 200:
            reasoning.append(f"Models show {metrics['bestRoiPercent']:.0f}% upside on a strong move")

        probability_percent = self.estimate_probability_percent(probability_score)
        if probability_percent >= 65:
            reasoning.append(f"Probability model flags ~{probability_percent:.0f}% chance of profit")

        dte = self.calculate_days_to_expiration(option['expiration'])
        if dte > 0:
            reasoning.append(f"{dte} days until expiration provides time for the thesis to play out")

        if not reasoning:
            reasoning.append("Balanced mix of liquidity, upside, and probability")

        return reasoning

    def assess_risk_level(self, option, metrics, probability_score):
        """Assess risk profile combining ROI potential and probability."""

        breakeven_move = metrics['breakevenMovePercent']
        probability_percent = self.estimate_probability_percent(probability_score)

        if breakeven_move <= 5 and probability_percent >= 70:
            return 'low'
        if metrics['bestRoiPercent'] >= 250 and probability_percent >= 55:
            return 'medium'
        if option['lastPrice'] < 1.0 and probability_percent < 50:
            return 'high'
        return 'medium'

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
    
    def calculate_probability_score(self, option, metrics):
        """Score the likelihood of hitting breakeven based on context."""

        score = 0.0

        breakeven_move = metrics['breakevenMovePercent']
        if breakeven_move <= 0:
            score += 32
        elif breakeven_move <= 4:
            score += 28
        elif breakeven_move <= 6:
            score += 24
        elif breakeven_move <= 8:
            score += 18
        elif breakeven_move <= 12:
            score += 12
        elif breakeven_move <= 18:
            score += 8

        volume = option['volume']
        open_interest = option['openInterest']
        if volume > 5000 and open_interest > 10000:
            score += 6
        elif volume > 1000 and open_interest > 3000:
            score += 4

        dte = self.calculate_days_to_expiration(option['expiration'])
        if 7 <= dte <= 45:
            score += 6
        elif dte < 7:
            score -= 4

        iv = option['impliedVolatility']
        if pd.notna(iv):
            if iv < 0.2:
                score += 2
            elif iv > 0.7:
                score -= 4

        return float(max(0.0, min(40.0, score)))

    def estimate_probability_percent(self, probability_score):
        return max(5.0, min(92.0, probability_score * 2.4))

    def build_probability_explanation(self, option, metrics, probability_percent, volume_ratio):
        explanation_parts = []

        breakeven_move = metrics['breakevenMovePercent']
        if breakeven_move <= 0:
            move_text = "Already beyond breakeven with supportive flow"
        else:
            move_text = f"Needs {breakeven_move:.1f}% move with {volume_ratio:.1f}x volume/interest support"
        explanation_parts.append(move_text)

        dte = self.calculate_days_to_expiration(option['expiration'])
        if dte:
            explanation_parts.append(f"{dte} days to expiration")

        iv = option['impliedVolatility']
        if pd.notna(iv):
            explanation_parts.append(f"IV at {iv:.0%} provides {'amplified' if iv > 0.4 else 'controlled'} pricing")

        explanation_parts.append(f"Modeled probability ≈ {probability_percent:.0f}%")

        return '. '.join(explanation_parts)

    def calculate_greeks_approximation(self, option):
        """Calculate approximate Greeks using simple heuristics."""

        stock_price = float(option['stockPrice'])
        strike = float(option['strike'])
        iv = float(option['impliedVolatility']) if pd.notna(option['impliedVolatility']) else 0.3
        dte = max(self.calculate_days_to_expiration(option['expiration']), 1)

        time_factor = max(0.2, min(1.0, dte / 45))

        if option['type'] == 'call':
            moneyness = (stock_price - strike) / max(stock_price, 0.01)
            delta = 0.5 + moneyness * 2.2
        else:
            moneyness = (strike - stock_price) / max(stock_price, 0.01)
            delta = -0.5 - moneyness * 2.2

        delta = max(-0.95, min(0.95, delta))
        gamma = max(0.005, min(0.15, (0.12 / max(dte / 30, 1)) * (1 - abs(moneyness))))
        theta = -max(0.02, min(0.25, (iv * 0.4 + 0.03) / max(dte / 45, 0.5)))
        vega = max(0.05, min(0.4, (0.2 + time_factor) * (1 - abs(delta))))

        return {
            'delta': float(delta),
            'gamma': float(gamma),
            'theta': float(theta),
            'vega': float(vega)
        }

    def calculate_days_to_expiration(self, expiration_date):
        """Calculate days to expiration"""
        try:
            exp_date = pd.to_datetime(expiration_date)
            days = (exp_date - datetime.now()).days
            return max(int(days), 0)
        except Exception:
            return 30

    def calculate_returns_analysis(self, option):
        """Return ROI scenarios (in percent) and supporting metrics."""

        stock_price = float(option['stockPrice'])
        strike = float(option['strike'])
        premium = float(option['lastPrice'])
        cost_basis = premium * 100
        breakeven_price = self.calculate_breakeven(option)

        if option['type'] == 'call':
            breakeven_move_pct = ((breakeven_price - stock_price) / max(stock_price, 0.01)) * 100
        else:
            breakeven_move_pct = ((stock_price - breakeven_price) / max(stock_price, 0.01)) * 100

        moves = [0.10, 0.15, 0.20, 0.30]
        scenarios = []
        scenario_metrics = []

        for move in moves:
            if option['type'] == 'call':
                target_price = stock_price * (1 + move)
                intrinsic = max(0.0, target_price - strike)
            else:
                target_price = stock_price * (1 - move)
                intrinsic = max(0.0, strike - target_price)

            payoff = intrinsic * 100
            net_profit = payoff - cost_basis
            roi_percent = (net_profit / cost_basis) * 100 if cost_basis else 0.0

            scenarios.append({'move': f"{int(move * 100)}%", 'return': roi_percent})
            scenario_metrics.append({
                'move': move,
                'roi_percent': roi_percent,
                'net_profit': net_profit,
                'target_price': target_price,
            })

        best = max(scenario_metrics, key=lambda item: item['roi_percent']) if scenario_metrics else {
            'roi_percent': 0.0,
            'net_profit': 0.0,
            'move': moves[0],
        }

        ten_move = next((item for item in scenario_metrics if abs(item['move'] - 0.10) < 1e-6), scenario_metrics[0])
        fifteen_move = next((item for item in scenario_metrics if abs(item['move'] - 0.15) < 1e-6), scenario_metrics[0])

        metrics = {
            'costBasis': cost_basis,
            'breakevenMovePercent': breakeven_move_pct,
            'breakevenPrice': breakeven_price,
            'bestRoiPercent': best['roi_percent'],
            'bestNetProfit': best['net_profit'],
            'bestMovePercent': best['move'] * 100,
            'tenMoveRoiPercent': ten_move['roi_percent'],
            'tenMoveNetProfit': ten_move['net_profit'],
            'fifteenMoveRoiPercent': fifteen_move['roi_percent'],
            'fifteenMoveNetProfit': fifteen_move['net_profit'],
        }

        return scenarios, metrics
    
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

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan for high potential options setups")
    parser.add_argument(
        "--max-symbols",
        type=int,
        default=None,
        help=(
            "Limit the number of symbols fetched from the priority/watchlist universe. "
            "Use 0 or omit the flag to scan the full list."
        ),
    )
    return parser.parse_args()


def _normalize_symbol_limit(raw_limit: int | None) -> int | None:
    if raw_limit is None:
        return None
    if raw_limit <= 0:
        return None
    return raw_limit


def main():
    args = _parse_args()
    symbol_limit = _normalize_symbol_limit(args.max_symbols)
    scanner = SmartOptionsScanner(max_symbols=symbol_limit)
    opportunities = scanner.scan_for_opportunities()
    
    if opportunities:
        print(f"\n📊 Top opportunities:")
        for i, opp in enumerate(opportunities[:5]):
            print(f"{i+1}. {opp['symbol']} {opp['optionType']} {opp['strike']} - Score: {opp['score']}")
    
    # Output as JSON for API consumption
    print(json.dumps(opportunities, indent=2))

if __name__ == "__main__":
    main()
