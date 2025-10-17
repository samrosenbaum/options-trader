"""
Example integration of enhanced screening criteria into the options scanner

This demonstrates how to apply the new multi-layer filtering framework:
1. Stock-level filters
2. Options-specific filters
3. Trade structure filters
4. Enhanced scoring
"""

from typing import Dict, List, Optional, Any
import pandas as pd
import yfinance as yf

from src.scanner.screening_criteria import (
    StockScreener,
    OptionsScreener,
    TradeStructureFilter,
    TradeScoreCalculator,
    RiskManagement,
    DIRECTIONAL_STRUCTURE,
    INCOME_STRUCTURE
)


def apply_enhanced_screening(
    symbol: str,
    options_data: pd.DataFrame,
    stock_price: float,
    market_cap: float,
    avg_volume: float,
    strategy_preference: str = "auto"  # "directional", "income", or "auto"
) -> List[Dict[str, Any]]:
    """
    Apply enhanced screening criteria to options data

    Args:
        symbol: Stock ticker
        options_data: DataFrame with option chain data
        stock_price: Current stock price
        market_cap: Market capitalization
        avg_volume: Average daily volume
        strategy_preference: Which strategy to filter for

    Returns:
        List of filtered and scored opportunities
    """
    opportunities = []

    # STEP 1: Stock-level filters
    stock_passes, stock_reasons = StockScreener.passes_stock_filters(
        market_cap=market_cap,
        avg_volume=avg_volume,
        price=stock_price
    )

    if not stock_passes:
        print(f"❌ {symbol} failed stock filters: {', '.join(stock_reasons)}")
        return []

    # STEP 2: Get price history and analyze trend
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="3mo")  # Need 50+ days for EMA
        trend_analysis = StockScreener.analyze_trend(hist)
    except Exception as e:
        print(f"⚠️ Could not analyze trend for {symbol}: {e}")
        trend_analysis = None

    if not trend_analysis:
        print(f"⚠️ {symbol} insufficient price history for trend analysis")
        # Don't reject - just proceed with neutral score
        trend_alignment_score = 30.0
        trend_direction = "NEUTRAL"
    else:
        trend_alignment_score = trend_analysis.alignment_score
        trend_direction = trend_analysis.direction
        print(f"📊 {symbol} trend: {trend_direction} (score: {trend_alignment_score:.1f})")

    # STEP 3: Filter each option in the chain
    for _, option in options_data.iterrows():
        # Extract option data
        strike = float(option.get('strike', 0))
        option_type = option.get('type', 'call')
        premium = float(option.get('lastPrice', 0))
        bid = float(option.get('bid', 0))
        ask = float(option.get('ask', 0))
        volume = int(option.get('volume', 0))
        open_interest = int(option.get('openInterest', 0))
        delta = float(option.get('delta', 0))
        iv = float(option.get('impliedVolatility', 0))
        dte = int(option.get('daysToExpiration', 0))

        # Get probability of profit (if available)
        probability_of_profit = float(option.get('probabilityOfProfit', 0.5))

        # Calculate IV rank if available
        iv_rank = option.get('ivRank')  # This would come from IVRankHistory

        # Options-specific filters
        options_passes, options_reasons = OptionsScreener.passes_options_filters(
            open_interest=open_interest,
            volume=volume,
            bid=bid,
            ask=ask,
            last_price=premium,
            iv_rank=iv_rank
        )

        if not options_passes:
            continue  # Skip this option

        # Determine trade structure fit
        if strategy_preference == "auto":
            structure_type = TradeStructureFilter.determine_best_structure(
                delta=delta,
                days_to_expiration=dte,
                probability_of_profit=probability_of_profit
            )
            if not structure_type:
                continue  # Doesn't fit either structure

            structure = DIRECTIONAL_STRUCTURE if structure_type == "directional" else INCOME_STRUCTURE
        elif strategy_preference == "directional":
            structure = DIRECTIONAL_STRUCTURE
            structure_passes, structure_reasons = TradeStructureFilter.passes_structure_filters(
                delta, dte, probability_of_profit, structure
            )
            if not structure_passes:
                continue
            structure_type = "directional"
        else:  # income
            structure = INCOME_STRUCTURE
            structure_passes, structure_reasons = TradeStructureFilter.passes_structure_filters(
                delta, dte, probability_of_profit, structure
            )
            if not structure_passes:
                continue
            structure_type = "income"

        # Calculate enhanced trade score
        bid_ask_spread_pct = OptionsScreener.calculate_bid_ask_spread_pct(bid, ask, premium)

        # Estimate returns
        expected_return = premium * structure.target_return * 100  # Dollar amount
        max_loss = premium * 100  # Full premium loss

        score_breakdown = TradeScoreCalculator.calculate_trade_score(
            trend_alignment_score=trend_alignment_score,
            probability_of_profit=probability_of_profit,
            expected_return=expected_return,
            max_loss=max_loss,
            open_interest=open_interest,
            volume=volume,
            bid_ask_spread_pct=bid_ask_spread_pct
        )

        # Calculate position sizing (example with $10k account, 2% risk)
        position_size = RiskManagement.calculate_position_size(
            account_value=10000,
            risk_per_trade_pct=0.02,
            option_price=premium,
            max_loss=premium
        )

        # Build opportunity object
        opportunity = {
            'symbol': symbol,
            'optionType': option_type,
            'strike': strike,
            'premium': premium,
            'stockPrice': stock_price,
            'expiration': option.get('expiration'),
            'daysToExpiration': dte,

            # Enhanced fields
            'strategyType': structure_type,
            'trendDirection': trend_direction,
            'trendAlignmentScore': trend_alignment_score,

            # Scoring
            'enhancedScore': score_breakdown['total_score'],
            'technicalScore': score_breakdown['technical_score'],
            'probabilityScore': score_breakdown['probability_score'],
            'riskRewardScore': score_breakdown['risk_reward_score'],
            'liquidityScore': score_breakdown['liquidity_score'],

            # Greeks and metrics
            'delta': delta,
            'impliedVolatility': iv,
            'probabilityOfProfit': probability_of_profit,
            'bidAskSpreadPct': bid_ask_spread_pct * 100,

            # Liquidity
            'volume': volume,
            'openInterest': open_interest,

            # Position sizing
            'recommendedContracts': position_size['contracts'],
            'capitalRequired': position_size['dollar_amount'],
            'riskPercent': position_size['risk_percent'],

            # Risk management
            'stopLoss': premium * (1 - RiskManagement.STOP_LOSS_PCT),
            'profitTarget1': premium * (1 + RiskManagement.PROFIT_TARGET_PCT),
            'profitTarget2': premium * (1 + RiskManagement.FULL_EXIT_PCT),
        }

        opportunities.append(opportunity)

    # Sort by enhanced score
    opportunities.sort(key=lambda x: x['enhancedScore'], reverse=True)

    return opportunities


def print_opportunity_summary(opportunity: Dict[str, Any]):
    """Print a formatted summary of an opportunity"""
    print(f"\n{'='*80}")
    print(f"🎯 {opportunity['symbol']} ${opportunity['strike']} {opportunity['optionType'].upper()}")
    print(f"   Strategy: {opportunity['strategyType'].upper()} | Trend: {opportunity['trendDirection']}")
    print(f"\n📊 SCORES (Total: {opportunity['enhancedScore']:.1f}/100)")
    print(f"   Technical:    {opportunity['technicalScore']:.1f}/100")
    print(f"   Probability:  {opportunity['probabilityScore']:.1f}/100")
    print(f"   Risk/Reward:  {opportunity['riskRewardScore']:.1f}/100")
    print(f"   Liquidity:    {opportunity['liquidityScore']:.1f}/100")
    print(f"\n💰 TRADE DETAILS")
    print(f"   Premium:      ${opportunity['premium']:.2f}")
    print(f"   Stock Price:  ${opportunity['stockPrice']:.2f}")
    print(f"   DTE:          {opportunity['daysToExpiration']} days")
    print(f"   Delta:        {opportunity['delta']:.3f}")
    print(f"   PoP:          {opportunity['probabilityOfProfit']*100:.1f}%")
    print(f"\n📦 POSITION SIZING")
    print(f"   Contracts:    {opportunity['recommendedContracts']}")
    print(f"   Capital:      ${opportunity['capitalRequired']:.2f}")
    print(f"   Risk:         {opportunity['riskPercent']:.1f}%")
    print(f"\n🎯 TARGETS")
    print(f"   Stop Loss:    ${opportunity['stopLoss']:.2f} (-50%)")
    print(f"   Target 1:     ${opportunity['profitTarget1']:.2f} (+50%)")
    print(f"   Target 2:     ${opportunity['profitTarget2']:.2f} (+100%)")
    print(f"\n💧 LIQUIDITY")
    print(f"   Volume:       {opportunity['volume']:,}")
    print(f"   OI:           {opportunity['openInterest']:,}")
    print(f"   Spread:       {opportunity['bidAskSpreadPct']:.2f}%")
    print(f"{'='*80}\n")


# Example usage
if __name__ == "__main__":
    # Example: Scan AAPL for directional opportunities
    print("🚀 Enhanced Options Scanner Example\n")

    # Mock data for demonstration
    # In real implementation, this would come from your scanner service
    sample_option = pd.DataFrame([{
        'strike': 180.0,
        'type': 'call',
        'lastPrice': 5.50,
        'bid': 5.40,
        'ask': 5.60,
        'volume': 1500,
        'openInterest': 3000,
        'delta': 0.50,
        'impliedVolatility': 0.35,
        'daysToExpiration': 60,
        'expiration': '2025-12-17',
        'probabilityOfProfit': 0.52,
    }])

    opportunities = apply_enhanced_screening(
        symbol="AAPL",
        options_data=sample_option,
        stock_price=175.50,
        market_cap=2_800_000_000_000,  # $2.8T
        avg_volume=50_000_000,
        strategy_preference="auto"
    )

    if opportunities:
        print(f"✅ Found {len(opportunities)} qualifying opportunities\n")
        for opp in opportunities[:5]:  # Show top 5
            print_opportunity_summary(opp)
    else:
        print("❌ No opportunities met the screening criteria")
