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
from src.config import AppSettings, get_settings
from src.scanner.historical_moves import HistoricalMoveAnalyzer
from src.scanner.iv_rank_history import IVRankHistory
from src.scanner.universe import build_scan_universe
from src.scanner.service import ScanResult, SmartOptionsScanner
from src.backtesting.strategy_validator import StrategyValidator

# Import our new institutional-grade components
from src.integration.enhanced_scanner import EnhancedOptionsScanner, EnhancedOpportunity
from src.validation.data_quality import DataQuality
from src.math.probability import ProbabilityCalculator
from src.math.greeks import GreeksCalculator


class InstitutionalOptionsScanner(SmartOptionsScanner):
    """Enhanced scanner that combines existing functionality with institutional-grade components."""

    def __init__(self, max_symbols: Optional[int] = None, **kwargs):
        """Initialize scanner with both legacy and enhanced components."""
        super().__init__(max_symbols, **kwargs)

        # Initialize enhanced components
        self.enhanced_scanner = EnhancedOptionsScanner(
            data_quality_config={
                'max_spread_pct': 0.15,  # 15% maximum spread - strict for good execution
                'min_volume': 10,  # Minimum 10 volume for reliable fills
                'min_open_interest': 50,  # Minimum 50 OI for liquidity
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
        self.historical_analyzer = HistoricalMoveAnalyzer(
            db_path="data/historical_moves.db",
            lookback_days=365
        )

        # Initialize strategy validator for backtesting
        self.strategy_validator = StrategyValidator(lookback_days=365)

        print("🚀 Enhanced scanner initialized with institutional-grade components + backtesting", file=sys.stderr)

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
                
        # Apply institutional-grade filtering
        filtered_opportunities = self._apply_institutional_filters(enhanced_opportunities)
        
        # Re-sort by risk-adjusted score
        filtered_opportunities.sort(key=lambda x: x.get('riskAdjustedScore', x.get('score', 0)), reverse=True)
        
        print(f"✅ Enhanced analysis complete: {len(filtered_opportunities)} institutional-grade opportunities", file=sys.stderr)
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
            enhanced_opportunities = self.enhanced_scanner.scan_opportunities(
                [enhanced_opp_data],
                min_quality=DataQuality.MEDIUM,  # Maintain quality standards for profitability
                min_composite_score=50.0,  # Strong composite score ensures good opportunities
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

            # Add backtesting validation
            backtest_result = self._validate_strategy(
                symbol=legacy_opp['symbol'],
                option_type=legacy_opp['optionType'],
                strike=legacy_opp['strike'],
                stock_price=legacy_opp['stockPrice'],
                premium=legacy_opp['premium'],
                days_to_expiration=legacy_opp.get('daysToExpiration', 30),
                implied_volatility=legacy_opp.get('impliedVolatility', 0.5)
            )
            if backtest_result:
                result['backtestValidation'] = backtest_result.to_dict()

            return result
            
        except Exception as e:
            print(f"Error in _enhance_opportunity for {legacy_opp.get('symbol', 'unknown')}: {e}", file=sys.stderr)
            return None

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

    def _apply_institutional_filters(self, opportunities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Apply institutional-grade filtering criteria."""
        
        filtered = []
        
        for opp in opportunities:
            enhanced_analysis = opp.get('enhancedAnalysis', {})
            
            # Data quality filter
            data_quality = enhanced_analysis.get('dataQuality', {})
            quality_level = data_quality.get('quality', 'UNKNOWN')
            
            if quality_level == 'REJECTED':  # Only reject truly bad data (removed 'LOW')
                print(f"🚫 Filtered out {opp['symbol']} due to {quality_level} data quality", file=sys.stderr)
                continue

            # Probability filter - require reasonable probability of profit
            prob_analysis = enhanced_analysis.get('probabilityAnalysis', {})
            prob_of_profit = prob_analysis.get('probabilityOfProfit', 0)

            if prob_of_profit < 0.12:  # 12% minimum - relaxed to allow more opportunities (has fallback mode)
                print(f"🚫 Filtered out {opp['symbol']} due to low probability ({prob_of_profit:.1%})", file=sys.stderr)
                continue

            # Risk-adjusted score filter
            risk_adjusted_score = opp.get('riskAdjustedScore', opp.get('score', 0))
            if risk_adjusted_score < 35:  # Relaxed threshold with fallback mode for safety
                print(f"🚫 Filtered out {opp['symbol']} due to low risk-adjusted score ({risk_adjusted_score:.1f})", file=sys.stderr)
                continue

            # Greeks sanity check
            greeks = enhanced_analysis.get('greeks', {})
            delta = abs(greeks.get('delta', 0))

            # Skip options with extremely low delta (won't move with stock)
            if delta < 0.015:  # Lowered from 0.02 to 0.015
                print(f"🚫 Filtered out {opp['symbol']} due to low delta ({delta:.3f})", file=sys.stderr)
                continue
                
            filtered.append(opp)
            
        print(f"📈 Institutional filters: {len(opportunities)} → {len(filtered)} opportunities", file=sys.stderr)
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
    force_refresh: bool = False,
    batch_builder = None,
    allow_relaxed_fallback: bool | None = None,
) -> ScanResult:
    """Run enhanced scan with institutional-grade components."""

    print("🚀 Starting enhanced institutional-grade scan...", file=sys.stderr)

    scanner = InstitutionalOptionsScanner(max_symbols=max_symbols, batch_builder=batch_builder)
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
        force_refresh=args.force_refresh,
        allow_relaxed_fallback=allow_relaxed
    )
    
    print(result.to_json(indent=args.json_indent))


if __name__ == "__main__":
    cli()