#!/usr/bin/env python3
"""
Enhanced Options Scanner Service

Integrates sophisticated screening criteria into the scanner:
- Stock-level filters (market cap, volume, price, EMA trend)
- Options-specific filters (bid-ask spread, IV rank, liquidity)
- Trade structure matching (directional vs income)
- Enhanced scoring (technical, probability, risk/reward, liquidity)
"""

import sys
import json
from typing import Dict, List, Any, Optional
import pandas as pd
import yfinance as yf
from datetime import datetime

# Add project root to path
sys.path.insert(0, '.')

from src.scanner.screening_criteria import (
    StockScreener,
    OptionsScreener,
    TradeStructureFilter,
    TradeScoreCalculator,
    RiskManagement,
    DIRECTIONAL_STRUCTURE,
    INCOME_STRUCTURE
)


def get_stock_info(symbol: str) -> Optional[Dict[str, Any]]:
    """Fetch stock information for filtering"""
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info

        return {
            'market_cap': info.get('marketCap', 0),
            'avg_volume': info.get('averageVolume', 0),
            'current_price': info.get('currentPrice', info.get('regularMarketPrice', 0))
        }
    except Exception as e:
        print(f"Error fetching info for {symbol}: {e}", file=sys.stderr)
        return None


def get_price_history(symbol: str, period: str = "3mo") -> Optional[pd.DataFrame]:
    """Fetch price history for trend analysis"""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period)

        if hist.empty or len(hist) < 50:
            return None

        # Rename columns to match expected format
        hist.columns = [col.lower() for col in hist.columns]
        return hist

    except Exception as e:
        print(f"Error fetching history for {symbol}: {e}", file=sys.stderr)
        return None


def apply_enhanced_filters(
    opportunities: List[Dict[str, Any]],
    strategy_preference: str = "auto"
) -> List[Dict[str, Any]]:
    """
    Apply enhanced screening criteria to scanner results

    Args:
        opportunities: Raw opportunities from scanner
        strategy_preference: "directional", "income", or "auto"

    Returns:
        Filtered and enhanced opportunities with scores
    """
    enhanced_opportunities = []

    # Group opportunities by symbol for efficiency
    symbols_seen = set()
    symbol_cache = {}

    for opp in opportunities:
        symbol = opp.get('symbol', '')

        if not symbol:
            continue

        # Get stock info (cached per symbol)
        if symbol not in symbol_cache:
            stock_info = get_stock_info(symbol)
            if not stock_info:
                symbol_cache[symbol] = None
                continue

            # Apply stock-level filters
            stock_passes, stock_reasons = StockScreener.passes_stock_filters(
                market_cap=stock_info['market_cap'],
                avg_volume=stock_info['avg_volume'],
                price=stock_info['current_price']
            )

            if not stock_passes:
                print(f"❌ {symbol} failed stock filters: {', '.join(stock_reasons)}", file=sys.stderr)
                symbol_cache[symbol] = None
                continue

            # Get trend analysis
            price_history = get_price_history(symbol)
            trend_analysis = StockScreener.analyze_trend(price_history) if price_history is not None else None

            symbol_cache[symbol] = {
                'stock_info': stock_info,
                'trend_analysis': trend_analysis
            }

        cached = symbol_cache[symbol]
        if cached is None:
            continue

        stock_info = cached['stock_info']
        trend_analysis = cached['trend_analysis']

        # Set default trend values if analysis failed
        if trend_analysis:
            trend_direction = trend_analysis.direction
            trend_alignment_score = trend_analysis.alignment_score
        else:
            trend_direction = "NEUTRAL"
            trend_alignment_score = 30.0

        # Extract option data
        premium = float(opp.get('premium', 0))
        bid = float(opp.get('bid', premium * 0.95))
        ask = float(opp.get('ask', premium * 1.05))
        volume = int(opp.get('volume', 0))
        open_interest = int(opp.get('openInterest', 0))
        delta = float(opp.get('greeks', {}).get('delta', 0))
        dte = int(opp.get('daysToExpiration', 0))
        probability_of_profit = float(opp.get('probabilityOfProfit') or 0.5)

        # Apply options-specific filters
        options_passes, options_reasons = OptionsScreener.passes_options_filters(
            open_interest=open_interest,
            volume=volume,
            bid=bid,
            ask=ask,
            last_price=premium,
            iv_rank=opp.get('ivRank')  # May be None
        )

        if not options_passes:
            continue

        # Determine trade structure
        if strategy_preference == "auto":
            structure_type = TradeStructureFilter.determine_best_structure(
                delta=delta,
                days_to_expiration=dte,
                probability_of_profit=probability_of_profit
            )
            if not structure_type:
                continue  # Doesn't fit either structure
        elif strategy_preference == "directional":
            structure_passes, _ = TradeStructureFilter.passes_structure_filters(
                delta, dte, probability_of_profit, DIRECTIONAL_STRUCTURE
            )
            if not structure_passes:
                continue
            structure_type = "directional"
        else:  # income
            structure_passes, _ = TradeStructureFilter.passes_structure_filters(
                delta, dte, probability_of_profit, INCOME_STRUCTURE
            )
            if not structure_passes:
                continue
            structure_type = "income"

        # Calculate bid-ask spread
        bid_ask_spread_pct = OptionsScreener.calculate_bid_ask_spread_pct(bid, ask, premium)

        # Calculate enhanced score
        structure = DIRECTIONAL_STRUCTURE if structure_type == "directional" else INCOME_STRUCTURE
        expected_return = premium * structure.target_return * 100
        max_loss = premium * 100

        score_breakdown = TradeScoreCalculator.calculate_trade_score(
            trend_alignment_score=trend_alignment_score,
            probability_of_profit=probability_of_profit,
            expected_return=expected_return,
            max_loss=max_loss,
            open_interest=open_interest,
            volume=volume,
            bid_ask_spread_pct=bid_ask_spread_pct
        )

        # Only include if score meets threshold
        if score_breakdown['total_score'] < 60:
            continue

        # Calculate position sizing (example with $10k account, 2% risk)
        position_size = RiskManagement.calculate_position_size(
            account_value=10000,
            risk_per_trade_pct=0.02,
            option_price=premium,
            max_loss=premium
        )

        # Enhance the opportunity with new fields
        enhanced_opp = opp.copy()
        enhanced_opp.update({
            # Strategy classification
            'strategyType': structure_type,
            'trendDirection': trend_direction,
            'trendAlignmentScore': round(trend_alignment_score, 2),

            # Enhanced scoring
            'enhancedScore': score_breakdown['total_score'],
            'technicalScore': score_breakdown['technical_score'],
            'probabilityScore': score_breakdown['probability_score'],
            'riskRewardScore': score_breakdown['risk_reward_score'],
            'liquidityScore': score_breakdown['liquidity_score'],

            # Liquidity metrics
            'bidAskSpreadPct': round(bid_ask_spread_pct * 100, 2),

            # Position sizing
            'recommendedContracts': position_size['contracts'],
            'capitalRequired': position_size['dollar_amount'],
            'riskPercent': position_size['risk_percent'],

            # Risk management levels
            'stopLoss': round(premium * (1 - RiskManagement.STOP_LOSS_PCT), 2),
            'profitTarget1': round(premium * (1 + RiskManagement.PROFIT_TARGET_PCT), 2),
            'profitTarget2': round(premium * (1 + RiskManagement.FULL_EXIT_PCT), 2),
        })

        # Add trend data if available
        if trend_analysis:
            enhanced_opp['trendData'] = {
                'ema20': round(trend_analysis.ema_20, 2),
                'ema50': round(trend_analysis.ema_50, 2),
                'currentPrice': round(trend_analysis.current_price, 2)
            }

        enhanced_opportunities.append(enhanced_opp)

    # Sort by enhanced score
    enhanced_opportunities.sort(key=lambda x: x['enhancedScore'], reverse=True)

    return enhanced_opportunities


def main():
    """
    Main entry point

    Reads scanner results from stdin, applies enhanced filters, outputs to stdout
    """
    try:
        # Read scanner results from stdin
        input_data = sys.stdin.read()
        scanner_results = json.loads(input_data)

        opportunities = scanner_results.get('opportunities', [])
        strategy_preference = scanner_results.get('strategy', 'auto')

        print(f"Applying enhanced filters to {len(opportunities)} opportunities...", file=sys.stderr)

        # Apply enhanced screening
        enhanced_opps = apply_enhanced_filters(opportunities, strategy_preference)

        print(f"✅ Enhanced scan complete: {len(enhanced_opps)}/{len(opportunities)} passed filters", file=sys.stderr)

        # Output enhanced results
        output = {
            'opportunities': enhanced_opps,
            'metadata': {
                'totalInput': len(opportunities),
                'totalOutput': len(enhanced_opps),
                'filtersPassed': len(enhanced_opps),
                'filtersApplied': [
                    'stock_level_filters',
                    'ema_trend_analysis',
                    'options_quality_filters',
                    'trade_structure_matching',
                    'enhanced_scoring'
                ],
                'timestamp': datetime.now().isoformat()
            }
        }

        print(json.dumps(output, indent=2, default=str))

    except Exception as e:
        print(f"Error in enhanced scanner: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
