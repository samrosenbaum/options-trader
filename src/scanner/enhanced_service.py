#!/usr/bin/env python3
"""
Enhanced Options Scanner Service with Institutional-Grade Components

This service integrates the new institutional-grade components with the existing
scanner infrastructure while maintaining backward compatibility.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from math import isfinite
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pandas as pd

from scripts.bulk_options_fetcher import BulkOptionsFetcher
from src.analysis import SwingSignal, SwingSignalAnalyzer
from src.analysis.rejection_tracker import RejectionTracker
from src.config import AppSettings, get_settings
from src.scanner.historical_moves import HistoricalMoveAnalyzer
from src.scanner.iv_rank_history import IVRankHistory
from src.scanner.universe import build_scan_universe
from src.scanner.service import ScanResult, SmartOptionsScanner
from src.backtesting.strategy_validator import StrategyValidator
from src.scanner.sentiment_prescreener import SentimentPreScreener

# Import our new institutional-grade components
from src.integration.enhanced_scanner import EnhancedOptionsScanner, EnhancedOpportunity
from src.validation.data_quality import DataQuality
from src.math.probability import ProbabilityCalculator
from src.math.greeks import GreeksCalculator


class InstitutionalOptionsScanner(SmartOptionsScanner):
    """Enhanced scanner that combines existing functionality with institutional-grade components."""

    def __init__(
        self,
        max_symbols: Optional[int] = None,
        max_results: int = 20,
        max_per_symbol: int = 5,
        **kwargs
    ):
        """
        Initialize scanner with both legacy and enhanced components.

        Args:
            max_symbols: Maximum symbols to scan
            max_results: Maximum total opportunities to return
            max_per_symbol: Maximum opportunities per symbol (for diversity)
        """
        super().__init__(max_symbols, **kwargs)

        self.max_results = max_results
        self.max_per_symbol = max_per_symbol

        # Initialize enhanced components
        self.enhanced_scanner = EnhancedOptionsScanner(
            data_quality_config={
                'max_spread_pct': 0.15,  # 15% maximum spread - strict for good execution
                'min_volume': 5,  # Lowered from 10 - options make money daily!
                'min_open_interest': 10,  # Lowered from 50 - more realistic for smaller stocks
                'max_price_age_minutes': 15  # Fresh data for accurate pricing
            },
            probability_config={
                'risk_free_rate': 0.045,  # 4.5% risk-free rate
                'use_confidence_intervals': True
            },
            greeks_config={
                'risk_free_rate': 0.045,
                'dividend_yield': 0.0  # Default, will be adjusted per symbol
            }
        )

        # Initialize historical move analyzer
        # Use 90 days for institutional-grade analysis
        # Fast enough with proper error handling + timeouts
        self.historical_analyzer = HistoricalMoveAnalyzer(
            db_path="data/historical_moves.db",
            lookback_days=90
        )

        # Initialize strategy validator for backtesting (keep enabled - it's valuable)
        self.strategy_validator = StrategyValidator(lookback_days=90)

        # Initialize sentiment pre-screener for targeted symbol selection
        self.sentiment_prescreener = SentimentPreScreener(iv_history=self.iv_history)

        # Check environment variable for pre-screening mode
        import os
        # TEMPORARILY DISABLED for speed - sentiment pre-screening adds 30-60s
        # Re-enable when we implement progressive results or caching
        self.use_sentiment_prescreening = os.getenv('USE_SENTIMENT_PRESCREENING', '0') == '1'

        print("🚀 Enhanced scanner initialized with institutional-grade components + backtesting", file=sys.stderr)
        if self.use_sentiment_prescreening:
            print("📊 Sentiment pre-screening ENABLED - will prioritize hot symbols", file=sys.stderr)
        else:
            print("⚡ Using fast mode: pre-screening disabled for speed", file=sys.stderr)

    def _next_symbol_batch(self) -> List[str]:
        """
        Override symbol batch selection to use sentiment pre-screening.

        Returns symbols with high market activity instead of round-robin.
        """
        if not self.use_sentiment_prescreening:
            # Fall back to parent's round-robin behavior
            return super()._next_symbol_batch()

        try:
            # Get hot symbols from sentiment pre-screener
            hot_symbols = self.sentiment_prescreener.get_hot_symbols(
                universe=self.fetcher.priority_symbols,
                max_results=min(20, self.symbol_limit or 20),  # Reduced from 50 to 20 for speed
                include_gainers=True,
                include_losers=True,
                include_volume=True,
                include_iv=True,
                include_earnings=True
            )

            if hot_symbols:
                print(f"🎯 Pre-screened {len(hot_symbols)} hot symbols from {len(self.fetcher.priority_symbols)} universe", file=sys.stderr)
                self.current_batch_symbols = hot_symbols
                return hot_symbols
            else:
                print("⚠️  Pre-screening found no hot symbols, using standard selection", file=sys.stderr)
                return super()._next_symbol_batch()

        except Exception as e:
            print(f"⚠️  Pre-screening failed ({e}), using standard selection", file=sys.stderr)
            return super()._next_symbol_batch()

    def analyze_opportunities(
        self,
        options_data: Optional[pd.DataFrame],
        *,
        allow_relaxed_fallback: bool = True,
    ) -> List[Dict[str, Any]]:
        """Enhanced opportunity analysis using both legacy and new components."""

        if options_data is None or options_data.empty:
            return []

        # Get legacy opportunities first
        legacy_opportunities = super().analyze_opportunities(
            options_data,
            allow_relaxed_fallback=allow_relaxed_fallback,
        )
        
        if not legacy_opportunities:
            print("📊 No legacy opportunities found", file=sys.stderr)
            return []

        print(f"🔍 Enhancing {len(legacy_opportunities)} opportunities with institutional-grade analysis...", file=sys.stderr)
        
        # Convert legacy opportunities to enhanced format
        enhanced_opportunities = []
        for legacy_opp in legacy_opportunities:
            try:
                enhanced_opp = self._enhance_opportunity(legacy_opp, options_data)
                if enhanced_opp:
                    enhanced_opportunities.append(enhanced_opp)
            except Exception as e:
                print(f"⚠️  Error enhancing opportunity {legacy_opp.get('symbol', 'unknown')}: {e}", file=sys.stderr)
                # Fall back to legacy opportunity
                enhanced_opportunities.append(legacy_opp)
                
        print(f"📋 Before institutional filtering: {len(enhanced_opportunities)} opportunities", file=sys.stderr)

        # Apply institutional-grade filtering
        filtered_opportunities = self._apply_institutional_filters(
            enhanced_opportunities,
            max_results=self.max_results,
            max_per_symbol=self.max_per_symbol
        )

        print(f"📊 After institutional filtering: {len(filtered_opportunities)} opportunities", file=sys.stderr)

        # Re-sort by risk-adjusted score
        filtered_opportunities.sort(key=lambda x: x.get('riskAdjustedScore', x.get('score', 0)), reverse=True)

        if len(filtered_opportunities) > 0:
            print(f"✅ Enhanced analysis complete: {len(filtered_opportunities)} institutional-grade opportunities", file=sys.stderr)
            # Log top 3 opportunities
            for i, opp in enumerate(filtered_opportunities[:3], 1):
                print(f"  {i}. {opp['symbol']} - Score: {opp.get('riskAdjustedScore', 0):.1f} - Type: {opp['optionType']} ${opp['strike']}", file=sys.stderr)
        else:
            print("⚠️  No opportunities passed institutional-grade filters!", file=sys.stderr)
            print(f"   Original count: {len(legacy_opportunities)} → Enhanced: {len(enhanced_opportunities)} → Filtered: 0", file=sys.stderr)

        return filtered_opportunities

    def _enhance_opportunity(self, legacy_opp: Dict[str, Any], options_data: pd.DataFrame) -> Optional[Dict[str, Any]]:
        """Enhance a legacy opportunity with institutional-grade analysis."""
        
        try:
            # Build enhanced opportunity using the field names expected by the
            # institutional-grade scanner.  The enhanced scanner operates on the
            # raw option schema (``type``, ``stockPrice`` etc.) whereas the
            # legacy scanner exposes a user-facing schema (``optionType``,
            # ``stock_price`` ...).  The previous implementation mixed these
            # conventions which meant the enhanced scanner never saw the fields
            # it required (``type`` in particular), so every opportunity was
            # silently discarded during analysis.  Mapping the legacy result back
            # to the raw schema ensures the new pipeline receives the correct
            # inputs while we continue to surface the existing, user-friendly
            # structure to the rest of the app.

            option_type = legacy_opp['optionType']
            # Probability/greeks calculations work with per-share pricing.  The
            # legacy scanner stores contract values (per 100 shares), so convert
            # back to per-share amounts before handing off to the enhanced
            # components.
            bid_per_share = legacy_opp['bid'] / 100
            ask_per_share = legacy_opp['ask'] / 100
            last_price_per_share = legacy_opp['premium'] / 100

            enhanced_opp_data = {
                'symbol': legacy_opp['symbol'],
                'type': option_type.lower() if isinstance(option_type, str) else option_type,
                'strike': legacy_opp['strike'],
                'expiration': legacy_opp['expiration'],
                'bid': bid_per_share,
                'ask': ask_per_share,
                'lastPrice': last_price_per_share,
                'volume': legacy_opp['volume'],
                'openInterest': legacy_opp['openInterest'],
                'impliedVolatility': legacy_opp['impliedVolatility'],
                'stockPrice': legacy_opp['stockPrice'],
                'score': legacy_opp['score'],
                # Include data quality metadata if available
                '_price_source': legacy_opp.get('_dataQuality', {}).get('priceSource'),
                '_price_age_seconds': legacy_opp.get('_dataQuality', {}).get('priceAgeSeconds'),
                '_price_timestamp': legacy_opp.get('_dataQuality', {}).get('priceTimestamp'),
            }
            
            # Run enhanced analysis
            # Note: Using LOW quality minimum to allow more opportunities through
            # The institutional filters will do final quality checks
            enhanced_opportunities = self.enhanced_scanner.scan_opportunities(
                [enhanced_opp_data],
                min_quality=DataQuality.LOW,  # Let institutional filters do the heavy lifting
                min_composite_score=0.0,  # DISABLED - let institutional filters do ALL filtering with min 10 fallback
                max_results=1
            )
            
            if not enhanced_opportunities:
                return None
                
            enhanced_opp = enhanced_opportunities[0]
            
            # Merge enhanced data back into legacy format
            result = legacy_opp.copy()
            
            # Add institutional-grade metrics
            result['enhancedAnalysis'] = {
                'dataQuality': {
                    'quality': enhanced_opp.quality_report.quality.value,
                    'score': enhanced_opp.quality_report.score,
                    'summary': enhanced_opp.quality_report.summary,
                    'issues': [issue.message for issue in enhanced_opp.quality_report.issues],
                    'warnings': [warning.message for warning in enhanced_opp.quality_report.warnings]
                },
                'probabilityAnalysis': {
                    'probabilityOfProfit': enhanced_opp.probability_analysis.probability_of_profit,
                    'probabilityITM': enhanced_opp.probability_analysis.probability_itm,
                    'probabilityTouch': enhanced_opp.probability_analysis.probability_touch,
                    'expectedValue': enhanced_opp.probability_analysis.expected_value,
                    'confidenceInterval': enhanced_opp.probability_analysis.confidence_interval,
                    'breakeven': enhanced_opp.probability_analysis.breakeven_price,
                    'maxLoss': enhanced_opp.probability_analysis.max_loss,
                    'method': enhanced_opp.probability_analysis.method
                },
                'greeks': {
                    'delta': enhanced_opp.greeks.delta,
                    'gamma': enhanced_opp.greeks.gamma,
                    'theta': enhanced_opp.greeks.theta,
                    'vega': enhanced_opp.greeks.vega,
                    'rho': enhanced_opp.greeks.rho,
                    'lambda': enhanced_opp.greeks.lambda_,
                    # Advanced Greeks
                    'charm': enhanced_opp.greeks.charm,
                    'color': enhanced_opp.greeks.color,
                    'speed': enhanced_opp.greeks.speed,
                    'zomma': enhanced_opp.greeks.zomma,
                    'ultima': enhanced_opp.greeks.ultima,
                },
                'riskMetrics': {
                    'compositeScore': enhanced_opp.composite_score,
                    'riskAdjustedScore': enhanced_opp.risk_adjusted_score,
                    'scoreBreakdown': enhanced_opp.score_breakdown,
                }
            }
            
            # Update top-level scores with enhanced versions
            result['riskAdjustedScore'] = enhanced_opp.risk_adjusted_score
            result['enhancedProbabilityOfProfit'] = enhanced_opp.probability_analysis.probability_of_profit * 100  # Convert to percentage
            result['enhancedExpectedValue'] = enhanced_opp.probability_analysis.expected_value
            
            # Add enhanced tags
            result['enhancedTags'] = enhanced_opp.tags
            if enhanced_opp.warnings:
                result['enhancedWarnings'] = enhanced_opp.warnings

            # Add historical move analysis
            historical_context = self._get_historical_context(
                symbol=legacy_opp['symbol'],
                strike=legacy_opp['strike'],
                stock_price=legacy_opp['stockPrice'],
                option_type=legacy_opp['optionType'],
                expiration=legacy_opp['expiration'],
                premium=legacy_opp['premium']
            )
            if historical_context and historical_context.get('available'):
                result['historicalContext'] = historical_context

            # Add backtesting validation (skip if disabled for speed)
            disable_backtesting = os.getenv('DISABLE_BACKTESTING', '0') == '1'
            if not disable_backtesting:
                backtest_result = self._validate_strategy(
                    symbol=legacy_opp['symbol'],
                    option_type=legacy_opp['optionType'],
                    strike=legacy_opp['strike'],
                    stock_price=legacy_opp['stockPrice'],
                    premium=legacy_opp['premium'] / 100,  # Convert per-contract to per-share
                    days_to_expiration=legacy_opp.get('daysToExpiration', 30),
                    implied_volatility=legacy_opp.get('impliedVolatility', 0.5)
                )
                if backtest_result:
                    result['backtestValidation'] = backtest_result.to_dict()

                    # Update risk level based on backtest data
                    result['riskLevel'] = self._assess_risk_with_backtest(
                        current_risk=result.get('riskLevel', 'medium'),
                        backtest_result=backtest_result,
                        probability=result.get('probabilityOfProfit', 50)
                    )

                    # Recalculate Kelly fraction using backtest win rate instead of theoretical probability
                    if 'positionSizing' in result:
                        updated_sizing = self._recalculate_kelly_with_backtest(
                            position_sizing=result['positionSizing'],
                            backtest_win_rate=backtest_result.win_rate,
                            sample_size=backtest_result.similar_trades_found
                        )
                    if updated_sizing:
                        result['positionSizing'] = updated_sizing

            return result
            
        except Exception as e:
            print(f"Error in _enhance_opportunity for {legacy_opp.get('symbol', 'unknown')}: {e}", file=sys.stderr)
            return None

    def _recalculate_kelly_with_backtest(
        self,
        position_sizing: Dict[str, Any],
        backtest_win_rate: float,
        sample_size: int
    ) -> Optional[Dict[str, Any]]:
        """
        Recalculate Kelly fraction using backtest win rate instead of theoretical probability.

        Args:
            position_sizing: Original position sizing dict
            backtest_win_rate: Historical win rate (0.0 to 1.0)
            sample_size: Number of similar trades in backtest

        Returns:
            Updated position sizing dict or None if calculation fails
        """
        try:
            from math import log1p, log, ceil, isfinite

            # Only use backtest data if we have sufficient sample size
            if sample_size < 20:
                return None

            # Get original inputs
            inputs = position_sizing.get('inputs', {})
            payoff_ratio = inputs.get('payoffRatio', 0)
            cost_basis = inputs.get('costBasis', 0)

            if payoff_ratio <= 0 or cost_basis <= 0:
                return None

            # Use backtest win rate (capped at 95% for Kelly safety)
            win_probability = min(0.95, max(0.05, backtest_win_rate))
            loss_probability = 1.0 - win_probability

            # Recalculate Kelly fraction with backtest win rate
            kelly_fraction = (win_probability * (payoff_ratio + 1.0) - 1.0) / payoff_ratio
            if not isfinite(kelly_fraction):
                return None
            kelly_fraction = max(0.0, kelly_fraction)

            # Recalculate expected edge
            expected_edge = win_probability * payoff_ratio - loss_probability

            # If edge is negative with backtest data, something is wrong
            if expected_edge <= 0.0:
                return position_sizing  # Keep original

            # Apply same dampening factors as original calculation
            score_factor = inputs.get('scoreFactor', 0.75)
            probability_factor = max(0.5, min(1.0, 0.4 + win_probability * 0.6))
            volatility_factor = inputs.get('volatilityFactor', 0.7)
            reward_factor = inputs.get('rewardFactor', 0.9)
            risk_level = inputs.get('riskLevel', 'medium')

            risk_level_multiplier = {
                "low": 1.0,
                "medium": 0.7,
                "high": 0.45,
                "extreme": 0.25
            }.get(str(risk_level).lower(), 0.6)

            # Calculate base fraction with all dampening
            base_fraction = kelly_fraction
            base_fraction *= score_factor
            base_fraction *= probability_factor
            base_fraction *= volatility_factor
            base_fraction *= reward_factor
            base_fraction *= risk_level_multiplier

            # Cap at 5% max and Kelly * 1.1
            max_fraction = 0.05
            base_fraction = min(base_fraction, kelly_fraction * 1.1)
            recommended_fraction = max(0.0, min(max_fraction, base_fraction))

            # Drawdown protection (same as original)
            drawdown_confidence = 0.95
            try:
                losing_streak_95 = max(1, int(ceil(log(1.0 - drawdown_confidence) / log(loss_probability))))
            except (ValueError, ZeroDivisionError):
                losing_streak_95 = 1

            projected_drawdown = 1.0 - (1.0 - recommended_fraction) ** losing_streak_95
            max_drawdown = 0.25
            if projected_drawdown > max_drawdown:
                adjustment = max_drawdown / projected_drawdown
                recommended_fraction *= adjustment

            recommended_fraction = min(max_fraction, recommended_fraction)
            conservative_fraction = max(0.0, min(max_fraction, recommended_fraction * 0.6))
            aggressive_fraction = max(recommended_fraction, min(max_fraction, recommended_fraction * 1.4, kelly_fraction))

            # Expected log growth
            expected_log_growth = (
                win_probability * log1p(recommended_fraction * payoff_ratio)
                + loss_probability * log1p(-recommended_fraction)
            )

            # Determine risk budget tier
            risk_budget_tier = (
                "aggressive" if recommended_fraction >= 0.03
                else "balanced" if recommended_fraction >= 0.015
                else "conservative"
            )

            # Update position sizing with backtest-driven values
            updated = position_sizing.copy()
            updated['recommendedFraction'] = round(recommended_fraction, 4)
            updated['conservativeFraction'] = round(conservative_fraction, 4)
            updated['aggressiveFraction'] = round(aggressive_fraction, 4)
            updated['kellyFraction'] = round(kelly_fraction, 4)
            updated['expectedLogGrowth'] = round(expected_log_growth, 6)
            updated['expectedEdge'] = round(expected_edge, 4)
            updated['riskBudgetTier'] = risk_budget_tier

            # Update rationale to mention backtest
            updated['rationale'] = [
                f"Kelly fraction of {kelly_fraction * 100:.1f}% based on {win_probability * 100:.0f}% BACKTEST win rate "
                f"(from {sample_size} similar trades) and a {payoff_ratio:.2f}x payoff profile.",
                f"Position sized to {recommended_fraction * 100:.1f}% with expected log growth of "
                f"{expected_log_growth * 100:.2f}% per trade.",
                "Risk-of-ruin controls keep the 95% losing streak drawdown under 25% of capital."
            ]

            # Update inputs to show we used backtest
            updated['inputs'] = inputs.copy()
            updated['inputs']['winProbability'] = round(win_probability, 4)
            updated['inputs']['lossProbability'] = round(loss_probability, 4)
            updated['inputs']['backtestDriven'] = True
            updated['inputs']['backtestSampleSize'] = sample_size

            print(f"   💰 Updated Kelly: {kelly_fraction*100:.1f}% → Recommended: {recommended_fraction*100:.1f}% (using {win_probability*100:.0f}% backtest win rate)", file=sys.stderr)

            return updated

        except Exception as e:
            print(f"⚠️  Could not recalculate Kelly with backtest: {e}", file=sys.stderr)
            return None

    def _assess_risk_with_backtest(
        self,
        current_risk: str,
        backtest_result: Any,
        probability: float
    ) -> str:
        """
        Re-assess risk level using backtest data.

        A 0% historical win rate should override other signals and mark as HIGH risk.
        """
        if not backtest_result:
            return current_risk

        win_rate = backtest_result.win_rate
        sample_size = backtest_result.similar_trades_found

        # If we have meaningful backtest data
        if sample_size >= 50:  # Statistically significant
            # 0-10% win rate = EXTREME risk
            if win_rate <= 0.10:
                return "extreme"
            # 10-30% win rate = HIGH risk
            elif win_rate <= 0.30:
                return "high"
            # 30-45% win rate = MEDIUM risk
            elif win_rate <= 0.45:
                return "medium"
            # 45%+ win rate but still check probability
            elif win_rate >= 0.45 and probability >= 50:
                return "low"

        # If sample size is small but win rate is 0, still mark as high risk
        if sample_size >= 20 and win_rate == 0:
            return "high"

        # Otherwise keep current assessment
        return current_risk

    def _get_historical_context(
        self,
        symbol: str,
        strike: float,
        stock_price: float,
        option_type: str,
        expiration: str,
        premium: float
    ) -> Optional[Dict[str, Any]]:
        """Get historical move context for an opportunity."""
        try:
            from datetime import datetime

            # Calculate required move for breakeven
            breakeven_move_pct = (premium / stock_price) * 100  # premium is per contract (x100)

            # Calculate days to expiration
            exp_date = datetime.strptime(expiration, '%Y-%m-%d')
            days_to_exp = (exp_date - datetime.now()).days

            # Determine direction based on option type
            direction = "up" if option_type.lower() == "call" else "down"

            # Get historical move analysis
            context = self.historical_analyzer.get_move_context(
                symbol=symbol,
                target_move_pct=breakeven_move_pct,
                timeframe_days=days_to_exp,
                direction=direction,
                current_price=stock_price
            )

            return context

        except Exception as e:
            print(f"⚠️  Could not get historical context for {symbol}: {e}", file=sys.stderr)
            return {'available': False, 'message': f'Historical data unavailable: {str(e)}'}

    def _validate_strategy(
        self,
        symbol: str,
        option_type: str,
        strike: float,
        stock_price: float,
        premium: float,
        days_to_expiration: int,
        implied_volatility: float
    ) -> Optional[Any]:
        """Validate strategy using backtesting on similar historical patterns."""
        try:
            from datetime import datetime

            # Calculate days to expiration if needed
            if days_to_expiration <= 0:
                # Default to 30 days if not available
                days_to_expiration = 30

            result = self.strategy_validator.validate_strategy(
                symbol=symbol,
                option_type=option_type,
                strike=strike,
                stock_price=stock_price,
                premium=premium,
                days_to_expiration=days_to_expiration,
                implied_volatility=implied_volatility
            )

            if result and result.similar_trades_found >= 5:
                print(f"📈 Backtest for {symbol}: {result.win_rate:.1%} win rate over {result.similar_trades_found} similar trades", file=sys.stderr)
                return result
            else:
                print(f"⚠️  Insufficient backtest data for {symbol} (found {result.similar_trades_found if result else 0} similar trades)", file=sys.stderr)
                return None

        except Exception as e:
            print(f"⚠️  Could not validate strategy for {symbol}: {e}", file=sys.stderr)
            return None

    def _calculate_filter_score(self, opp: Dict[str, Any]) -> float:
        """
        Calculate how close an opportunity is to passing filters.
        Used for "best available" fallback when strict filters return nothing.

        Returns:
            Score 0-100 indicating filter compliance
        """
        score = 0.0
        enhanced_analysis = opp.get('enhancedAnalysis', {})

        # Data quality (30 points)
        data_quality = enhanced_analysis.get('dataQuality', {})
        quality_score = data_quality.get('score', 0)
        score += (quality_score / 100) * 30

        # Probability of profit (30 points)
        prob_analysis = enhanced_analysis.get('probabilityAnalysis', {})
        prob_of_profit = prob_analysis.get('probabilityOfProfit', 0)
        score += min(30, prob_of_profit * 100)

        # Risk-adjusted score (25 points)
        risk_adjusted_score = opp.get('riskAdjustedScore', opp.get('score', 0))
        score += min(25, (risk_adjusted_score / 100) * 25)

        # Delta (15 points)
        greeks = enhanced_analysis.get('greeks', {})
        delta = abs(greeks.get('delta', 0))
        score += min(15, delta * 100)

        return min(100, score)

    def _apply_institutional_filters(
        self,
        opportunities: List[Dict[str, Any]],
        min_results: int = 10,  # Increased from 5 - ensure enough opportunities surface
        max_results: int = 20,
        max_per_symbol: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Apply institutional-grade filtering criteria with "best available" fallback.

        Args:
            opportunities: List of opportunities to filter
            min_results: Minimum number of results to return (triggers fallback)
            max_results: Maximum number of total results to return
            max_per_symbol: Maximum opportunities per symbol (for diversity)

        Returns:
            Filtered opportunities, or best available if strict filters yield too few
        """

        filtered = []
        rejected_with_scores = []

        for opp in opportunities:
            enhanced_analysis = opp.get('enhancedAnalysis', {})

            # Data quality filter
            data_quality = enhanced_analysis.get('dataQuality', {})
            quality_level = data_quality.get('quality', 'UNKNOWN')

            if quality_level == 'REJECTED':
                print(f"🚫 Filtered out {opp['symbol']} due to {quality_level} data quality", file=sys.stderr)
                continue

            # Probability filter
            prob_analysis = enhanced_analysis.get('probabilityAnalysis', {})
            prob_of_profit = prob_analysis.get('probabilityOfProfit', 0)

            # Risk-adjusted score filter
            risk_adjusted_score = opp.get('riskAdjustedScore', opp.get('score', 0))

            # Greeks sanity check
            greeks = enhanced_analysis.get('greeks', {})
            delta = abs(greeks.get('delta', 0))

            # Check backtest data - if strong historical performance, relax other filters
            backtest = opp.get('backtestValidation', {})
            backtest_win_rate = backtest.get('winRate', 0) / 100  # Convert from percentage
            backtest_sample_size = backtest.get('similarTradesFound', 0)

            # Strong backtest data = proven strategy, lower bar on other metrics
            has_strong_backtest = (
                backtest_sample_size >= 100 and backtest_win_rate >= 0.50  # 50%+ with 100+ trades
            ) or (
                backtest_sample_size >= 50 and backtest_win_rate >= 0.60   # 60%+ with 50+ trades
            ) or (
                backtest_sample_size >= 20 and backtest_win_rate >= 0.70   # 70%+ with 20+ trades
            )

            # Check if passes all filters (EXTREMELY relaxed - nearly disabled to surface opportunities)
            passes_probability = prob_of_profit >= 0.01  # 1% probability (extremely low bar)
            passes_risk_score = risk_adjusted_score >= 5  # Very low bar (was 15, 20, 35)
            passes_delta = delta >= 0.001  # 0.1% delta minimum (extremely low bar)

            # If strong backtest, only require probability check (relaxed)
            if has_strong_backtest:
                if prob_of_profit >= 0.08:  # Lower bar for proven strategies
                    print(f"✅ {opp['symbol']} passed via STRONG BACKTEST: {backtest_win_rate:.1%} win rate over {backtest_sample_size} trades", file=sys.stderr)
                    filtered.append(opp)
                    continue

            # Otherwise require all standard filters
            if passes_probability and passes_risk_score and passes_delta:
                filtered.append(opp)
            else:
                # Track rejected opportunities with their scores for fallback
                filter_score = self._calculate_filter_score(opp)
                opp['_filter_score'] = filter_score
                opp['_filter_failures'] = []

                if not passes_probability:
                    opp['_filter_failures'].append(f"probability {prob_of_profit:.1%}")
                if not passes_risk_score:
                    opp['_filter_failures'].append(f"risk-score {risk_adjusted_score:.1f}")
                if not passes_delta:
                    opp['_filter_failures'].append(f"delta {delta:.3f}")

                rejected_with_scores.append(opp)
                print(f"🚫 Filtered out {opp['symbol']} due to: {', '.join(opp['_filter_failures'])}", file=sys.stderr)

                # Log rejection for retrospective analysis
                try:
                    # Build option data dict from opportunity
                    option_data = {
                        'symbol': opp.get('symbol'),
                        'strike': opp.get('strike'),
                        'expiration': opp.get('expiration'),
                        'type': opp.get('optionType', 'call'),
                        'stock_price': opp.get('stockPrice'),
                        'lastPrice': opp.get('premium', 0) / 100,  # Convert to per-share
                        'volume': opp.get('volume'),
                        'openInterest': opp.get('openInterest'),
                        'impliedVolatility': opp.get('impliedVolatility'),
                        'delta': greeks.get('delta')
                    }

                    self.rejection_tracker.log_rejection(
                        symbol=opp.get('symbol', 'UNKNOWN'),
                        option_data=option_data,
                        rejection_reason=', '.join(opp['_filter_failures']),
                        filter_stage="institutional_filters",
                        scores={
                            'probability_score': prob_of_profit * 100,  # Convert to percentage
                            'risk_adjusted_score': risk_adjusted_score,
                            'quality_score': data_quality.get('score')
                        }
                    )
                except Exception as e:
                    # Don't fail scanning if logging fails
                    print(f"⚠️  Failed to log institutional filter rejection: {e}", file=sys.stderr)
                    pass

        # Fallback mode: If we don't have enough results, return best available
        if len(filtered) < min_results and rejected_with_scores:
            print(f"\n⚠️  Only {len(filtered)} opportunities passed strict filters", file=sys.stderr)
            print(f"🔄 FALLBACK MODE: Selecting best {min_results} available opportunities", file=sys.stderr)

            # Sort all opportunities by:
            # 1. Filter score (quality) - descending
            # 2. Premium (affordability) - ascending
            all_opportunities = filtered + rejected_with_scores
            all_opportunities.sort(
                key=lambda x: (
                    -x.get('_filter_score', x.get('riskAdjustedScore', 0)),  # Higher is better (use negative for desc)
                    x.get('premium', 999999)  # Lower premium is better (asc)
                )
            )

            # Take top N
            fallback_results = all_opportunities[:min_results]

            # Mark fallback opportunities
            for opp in fallback_results:
                if '_filter_failures' in opp:
                    opp['_fallback'] = True
                    opp['_fallback_reason'] = f"Relaxed: {', '.join(opp['_filter_failures'])}"
                    print(f"📊 FALLBACK: Including {opp['symbol']} (filter score: {opp.get('_filter_score', 0):.1f})",
                          file=sys.stderr)

            print(f"✅ Fallback complete: Returning {len(fallback_results)} best available opportunities\n", file=sys.stderr)
            return fallback_results

        print(f"📈 Institutional filters: {len(opportunities)} → {len(filtered)} opportunities", file=sys.stderr)

        # Sort by premium (ascending) to show affordable options first
        filtered.sort(key=lambda x: x.get('premium', 999999))

        # Apply symbol diversity - limit opportunities per symbol
        if max_per_symbol > 0:
            diversified = []
            symbol_counts = {}

            for opp in filtered:
                symbol = opp.get('symbol', 'UNKNOWN')
                count = symbol_counts.get(symbol, 0)

                if count < max_per_symbol:
                    diversified.append(opp)
                    symbol_counts[symbol] = count + 1

            if len(diversified) < len(filtered):
                print(f"🎯 Symbol diversity: {len(filtered)} → {len(diversified)} opportunities (max {max_per_symbol} per symbol)", file=sys.stderr)
                filtered = diversified

        # Limit total results
        if len(filtered) > max_results:
            print(f"📊 Limiting results: {len(filtered)} → {max_results} opportunities", file=sys.stderr)
            filtered = filtered[:max_results]

        return filtered

    def get_enhanced_statistics(self) -> Dict[str, Any]:
        """Get enhanced scanner statistics."""
        
        base_stats = {}
        try:
            base_stats = self.enhanced_scanner.get_scan_statistics() or {}
        except Exception:
            pass
            
        calibration_stats = {}
        try:
            calibration_stats = self.enhanced_scanner.get_calibration_metrics() or {}
        except Exception:
            pass
            
        return {
            'scanStatistics': base_stats,
            'calibrationMetrics': calibration_stats,
            'enhancedComponentsActive': True,
            'institutionalGradeFiltering': True
        }


def run_enhanced_scan(
    max_symbols: Optional[int] = None,
    *,
    max_results: int = 20,
    max_per_symbol: int = 5,
    force_refresh: bool = False,
    batch_builder = None,
    allow_relaxed_fallback: bool | None = None,
) -> ScanResult:
    """Run enhanced scan with institutional-grade components."""

    print("🚀 Starting enhanced institutional-grade scan...", file=sys.stderr)

    scanner = InstitutionalOptionsScanner(
        max_symbols=max_symbols,
        max_results=max_results,
        max_per_symbol=max_per_symbol,
        batch_builder=batch_builder
    )
    result = scanner.scan_for_opportunities(
        force_refresh=force_refresh,
        allow_relaxed_fallback=allow_relaxed_fallback,
    )
    
    # Add enhanced statistics to metadata
    enhanced_stats = scanner.get_enhanced_statistics()
    result.metadata.update({
        'enhancedScanner': True,
        'institutionalGrade': True,
        'enhancedStatistics': enhanced_stats
    })
    
    return result


def cli(argv: Optional[Sequence[str]] = None) -> None:
    """Command line interface for enhanced scanner."""
    
    parser = argparse.ArgumentParser(description="Enhanced institutional-grade options scanner")
    parser.add_argument(
        "--max-symbols",
        type=int,
        default=None,
        help="Limit the number of symbols to scan"
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=20,
        help="Maximum total opportunities to return (default: 20)"
    )
    parser.add_argument(
        "--max-per-symbol",
        type=int,
        default=5,
        help="Maximum opportunities per symbol for diversity (default: 5, 0=unlimited)"
    )
    parser.add_argument(
        "--force-refresh",
        action="store_true",
        help="Force refresh of data (ignore cache)"
    )
    parser.add_argument(
        "--json-indent",
        type=int,
        default=None,
        help="Pretty print JSON with indentation"
    )
    parser.add_argument(
        "--strict-only",
        action="store_true",
        default=None,
        help="Disable relaxed fallback filters and only return strict matches"
    )

    args = parser.parse_args(argv)

    symbol_limit = args.max_symbols if args.max_symbols and args.max_symbols > 0 else None
    allow_relaxed = None if args.strict_only is None else not args.strict_only
    result = run_enhanced_scan(
        symbol_limit,
        max_results=args.max_results,
        max_per_symbol=args.max_per_symbol,
        force_refresh=args.force_refresh,
        allow_relaxed_fallback=allow_relaxed
    )
    
    print(result.to_json(indent=args.json_indent))


if __name__ == "__main__":
    cli()