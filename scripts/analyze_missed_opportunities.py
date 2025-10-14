#!/usr/bin/env python3
"""
Retrospective Options Analysis Tool

Analyzes what options made money today and determines why our scanner missed them.
This helps us understand:
1. What patterns are profitable in the current market
2. Which filters are too restrictive
3. What sentiment indicators we should be tracking

Usage:
    python scripts/analyze_missed_opportunities.py --date 2025-10-14
    python scripts/analyze_missed_opportunities.py --lookback-days 7
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import pandas as pd
import yfinance as yf

from src.config import get_settings
from scripts.bulk_options_fetcher import BulkOptionsFetcher


class MissedOpportunityAnalyzer:
    """Analyze options that gained value but weren't surfaced by scanner."""

    def __init__(self):
        self.settings = get_settings()
        self.fetcher = BulkOptionsFetcher(self.settings)

    def get_top_movers_today(self, min_price_change: float = 2.0, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get stocks that moved significantly today.

        Args:
            min_price_change: Minimum price change % to consider
            limit: Maximum number of symbols to return

        Returns:
            List of {symbol, price_change_pct, volume_ratio, direction}
        """
        print(f"\n🔍 Finding stocks that moved >{min_price_change}% today...", file=sys.stderr)

        movers = []
        symbols = self.fetcher.priority_symbols[:100]  # Sample from our universe

        for symbol in symbols:
            try:
                ticker = yf.Ticker(symbol)
                hist = ticker.history(period="5d")

                if len(hist) < 2:
                    continue

                today = hist.iloc[-1]
                yesterday = hist.iloc[-2]

                price_change = ((today['Close'] - yesterday['Close']) / yesterday['Close']) * 100
                volume_ratio = today['Volume'] / hist['Volume'].mean() if hist['Volume'].mean() > 0 else 0

                if abs(price_change) >= min_price_change:
                    movers.append({
                        'symbol': symbol,
                        'price_change_pct': price_change,
                        'volume_ratio': volume_ratio,
                        'direction': 'up' if price_change > 0 else 'down',
                        'close': today['Close'],
                        'volume': today['Volume']
                    })

            except Exception as e:
                print(f"⚠️  Error fetching {symbol}: {e}", file=sys.stderr)
                continue

        # Sort by absolute price change
        movers.sort(key=lambda x: abs(x['price_change_pct']), reverse=True)

        print(f"✅ Found {len(movers)} significant movers", file=sys.stderr)
        return movers[:limit]

    def analyze_options_performance(self, symbol: str, days_ago: int = 1) -> Optional[Dict[str, Any]]:
        """
        Analyze which options on this symbol would have been profitable.

        Args:
            symbol: Stock symbol
            days_ago: How many days ago to simulate buying

        Returns:
            Dict with profitable options and their returns
        """
        try:
            ticker = yf.Ticker(symbol)

            # Get current options
            expirations = ticker.options
            if not expirations:
                return None

            # Analyze near-term options (first expiration)
            exp_date = expirations[0]
            opt_chain = ticker.option_chain(exp_date)

            # Get historical prices to simulate buying days ago
            hist = ticker.history(period=f"{days_ago + 5}d")
            if len(hist) < days_ago + 1:
                return None

            buy_price = hist.iloc[-days_ago - 1]['Close']
            current_price = hist.iloc[-1]['Close']
            price_move_pct = ((current_price - buy_price) / buy_price) * 100

            profitable_calls = []
            profitable_puts = []

            # Analyze calls
            for _, row in opt_chain.calls.iterrows():
                strike = row['strike']
                current_premium = row.get('lastPrice', 0)
                volume = row.get('volume', 0)
                oi = row.get('openInterest', 0)

                # Estimate what premium was days ago (rough approximation)
                # This is simplified - real analysis would need historical options data
                moneyness = (buy_price - strike) / buy_price
                intrinsic_value_then = max(0, buy_price - strike)
                intrinsic_value_now = max(0, current_price - strike)

                if current_premium > 0:
                    # Estimate historical premium
                    estimated_premium_then = current_premium - (intrinsic_value_now - intrinsic_value_then)

                    if estimated_premium_then > 0:
                        estimated_return_pct = ((current_premium - estimated_premium_then) / estimated_premium_then) * 100

                        if estimated_return_pct > 20:  # 20% return threshold
                            profitable_calls.append({
                                'strike': strike,
                                'estimated_return_pct': estimated_return_pct,
                                'current_premium': current_premium,
                                'volume': volume,
                                'open_interest': oi,
                                'delta_approx': 1 / (1 + abs(moneyness)) if abs(moneyness) < 0.5 else 0.1
                            })

            # Analyze puts (if stock moved down)
            if price_move_pct < 0:
                for _, row in opt_chain.puts.iterrows():
                    strike = row['strike']
                    current_premium = row.get('lastPrice', 0)
                    volume = row.get('volume', 0)
                    oi = row.get('openInterest', 0)

                    moneyness = (strike - buy_price) / buy_price
                    intrinsic_value_then = max(0, strike - buy_price)
                    intrinsic_value_now = max(0, strike - current_price)

                    if current_premium > 0:
                        estimated_premium_then = current_premium - (intrinsic_value_now - intrinsic_value_then)

                        if estimated_premium_then > 0:
                            estimated_return_pct = ((current_premium - estimated_premium_then) / estimated_premium_then) * 100

                            if estimated_return_pct > 20:
                                profitable_puts.append({
                                    'strike': strike,
                                    'estimated_return_pct': estimated_return_pct,
                                    'current_premium': current_premium,
                                    'volume': volume,
                                    'open_interest': oi,
                                    'delta_approx': 1 / (1 + abs(moneyness)) if abs(moneyness) < 0.5 else 0.1
                                })

            if not profitable_calls and not profitable_puts:
                return None

            return {
                'symbol': symbol,
                'price_move_pct': price_move_pct,
                'profitable_calls': sorted(profitable_calls, key=lambda x: x['estimated_return_pct'], reverse=True)[:5],
                'profitable_puts': sorted(profitable_puts, key=lambda x: x['estimated_return_pct'], reverse=True)[:5],
                'expiration': exp_date
            }

        except Exception as e:
            print(f"⚠️  Error analyzing {symbol}: {e}", file=sys.stderr)
            return None

    def check_scanner_filters(self, opportunity: Dict[str, Any]) -> Dict[str, bool]:
        """
        Check which filters would have rejected this opportunity.

        Returns:
            Dict of {filter_name: would_pass}
        """
        filters = {}

        # Volume filter (min 10)
        filters['volume'] = opportunity.get('volume', 0) >= 10

        # Open interest filter (min 50)
        filters['open_interest'] = opportunity.get('open_interest', 0) >= 50

        # Delta filter (min 0.015)
        filters['delta'] = opportunity.get('delta_approx', 0) >= 0.015

        # Estimated return translates to probability
        # Very rough: 50%+ return ~= 20% probability, 100%+ return ~= 30%+ probability
        est_return = opportunity.get('estimated_return_pct', 0)
        est_probability = min(0.5, 0.1 + (est_return / 200))
        filters['probability'] = est_probability >= 0.12  # 12% minimum

        return filters

    def generate_report(self, lookback_days: int = 1):
        """Generate comprehensive missed opportunities report."""

        print("\n" + "="*80)
        print(f"📊 MISSED OPPORTUNITIES ANALYSIS - Last {lookback_days} Day(s)")
        print("="*80)

        # Step 1: Find stocks that moved
        movers = self.get_top_movers_today()

        if not movers:
            print("\n❌ No significant movers found", file=sys.stderr)
            return

        print(f"\n📈 Top Movers:")
        for i, mover in enumerate(movers[:10], 1):
            direction = "🟢" if mover['direction'] == 'up' else "🔴"
            print(f"{i}. {direction} {mover['symbol']}: {mover['price_change_pct']:+.2f}% "
                  f"(Vol: {mover['volume_ratio']:.1f}x avg)")

        # Step 2: Analyze options on top movers
        print(f"\n🔍 Analyzing options performance on top {min(20, len(movers))} movers...\n")

        missed_opportunities = []

        for mover in movers[:20]:
            analysis = self.analyze_options_performance(mover['symbol'], days_ago=lookback_days)
            if analysis:
                missed_opportunities.append(analysis)

        if not missed_opportunities:
            print("❌ No profitable options found in sample", file=sys.stderr)
            return

        # Step 3: Report findings
        print(f"\n💰 PROFITABLE OPTIONS THAT COULD HAVE BEEN TRADED:")
        print("="*80)

        total_profitable = 0
        filter_rejections = {
            'volume': 0,
            'open_interest': 0,
            'delta': 0,
            'probability': 0
        }

        for opp in missed_opportunities:
            print(f"\n{opp['symbol']} ({opp['price_move_pct']:+.2f}% move)")
            print(f"  Expiration: {opp['expiration']}")

            if opp['profitable_calls']:
                print(f"  📞 Profitable Calls:")
                for call in opp['profitable_calls']:
                    print(f"    ${call['strike']:.2f} strike: {call['estimated_return_pct']:+.1f}% return "
                          f"(Vol: {call['volume']}, OI: {call['open_interest']})")

                    # Check filters
                    filters = self.check_scanner_filters(call)
                    failed_filters = [name for name, passed in filters.items() if not passed]

                    if failed_filters:
                        print(f"      ❌ Would be rejected by: {', '.join(failed_filters)}")
                        for filter_name in failed_filters:
                            filter_rejections[filter_name] += 1
                    else:
                        print(f"      ✅ Would pass all filters!")

                    total_profitable += 1

            if opp['profitable_puts']:
                print(f"  📉 Profitable Puts:")
                for put in opp['profitable_puts']:
                    print(f"    ${put['strike']:.2f} strike: {put['estimated_return_pct']:+.1f}% return "
                          f"(Vol: {put['volume']}, OI: {put['open_interest']})")

                    filters = self.check_scanner_filters(put)
                    failed_filters = [name for name, passed in filters.items() if not passed]

                    if failed_filters:
                        print(f"      ❌ Would be rejected by: {', '.join(failed_filters)}")
                        for filter_name in failed_filters:
                            filter_rejections[filter_name] += 1
                    else:
                        print(f"      ✅ Would pass all filters!")

                    total_profitable += 1

        # Step 4: Summary and recommendations
        print("\n" + "="*80)
        print("📊 SUMMARY & RECOMMENDATIONS")
        print("="*80)
        print(f"\nTotal profitable options found: {total_profitable}")
        print(f"\nFilter Rejection Breakdown:")
        for filter_name, count in sorted(filter_rejections.items(), key=lambda x: x[1], reverse=True):
            if count > 0:
                pct = (count / total_profitable) * 100
                print(f"  {filter_name}: {count} rejections ({pct:.1f}%)")

        print(f"\n💡 RECOMMENDATIONS:")
        if filter_rejections['volume'] > total_profitable * 0.3:
            print("  • Consider relaxing volume requirement below 10")
        if filter_rejections['open_interest'] > total_profitable * 0.3:
            print("  • Consider relaxing open interest requirement below 50")
        if filter_rejections['delta'] > total_profitable * 0.3:
            print("  • Consider lowering delta threshold below 0.015")
        if filter_rejections['probability'] > total_profitable * 0.3:
            print("  • Scanner may be missing high-volatility opportunities")

        print(f"\n  • Focus on stocks with {sum(1 for m in movers if m['volume_ratio'] > 2)}/"
              f"{len(movers)} showing unusual volume")
        print(f"  • Add sentiment pre-screening to find these movers BEFORE market close")


def main():
    parser = argparse.ArgumentParser(description="Analyze missed trading opportunities")
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=1,
        help="Number of days to look back (default: 1)"
    )
    parser.add_argument(
        "--min-move",
        type=float,
        default=2.0,
        help="Minimum price move %% to analyze (default: 2.0)"
    )

    args = parser.parse_args()

    analyzer = MissedOpportunityAnalyzer()
    analyzer.generate_report(lookback_days=args.lookback_days)


if __name__ == "__main__":
    main()
