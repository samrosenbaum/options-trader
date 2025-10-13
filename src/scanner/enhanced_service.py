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
                'max_spread_pct': 0.15,  # 15% maximum spread
                'min_volume': 10,
                'min_open_interest': 50,
                'max_price_age_minutes': 10
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
        
        print("🚀 Enhanced scanner initialized with institutional-grade components", file=sys.stderr)

    def analyze_opportunities(self, options_data: Optional[pd.DataFrame]) -> List[Dict[str, Any]]:
        """Enhanced opportunity analysis using both legacy and new components."""
        
        if options_data is None or options_data.empty:
            return []

        # Get legacy opportunities first
        legacy_opportunities = super().analyze_opportunities(options_data)
        
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
                min_quality=DataQuality.MEDIUM,
                min_composite_score=50.0,  # Lower threshold for individual enhancement
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
                
            return result
            
        except Exception as e:
            print(f"Error in _enhance_opportunity for {legacy_opp.get('symbol', 'unknown')}: {e}", file=sys.stderr)
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

            if prob_of_profit < 0.15:  # 15% minimum probability (lowered from 25%)
                print(f"🚫 Filtered out {opp['symbol']} due to low probability ({prob_of_profit:.1%})", file=sys.stderr)
                continue

            # Risk-adjusted score filter
            risk_adjusted_score = opp.get('riskAdjustedScore', opp.get('score', 0))
            if risk_adjusted_score < 40:  # Lowered from 60 to 40
                print(f"🚫 Filtered out {opp['symbol']} due to low risk-adjusted score ({risk_adjusted_score:.1f})", file=sys.stderr)
                continue

            # Greeks sanity check
            greeks = enhanced_analysis.get('greeks', {})
            delta = abs(greeks.get('delta', 0))

            # Skip options with extremely low delta (won't move with stock)
            if delta < 0.02:  # Lowered from 0.05 to 0.02
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
) -> ScanResult:
    """Run enhanced scan with institutional-grade components."""
    
    print("🚀 Starting enhanced institutional-grade scan...", file=sys.stderr)
    
    scanner = InstitutionalOptionsScanner(max_symbols=max_symbols, batch_builder=batch_builder)
    result = scanner.scan_for_opportunities(force_refresh=force_refresh)
    
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
    
    args = parser.parse_args(argv)
    
    symbol_limit = args.max_symbols if args.max_symbols and args.max_symbols > 0 else None
    result = run_enhanced_scan(symbol_limit, force_refresh=args.force_refresh)
    
    print(result.to_json(indent=args.json_indent))


if __name__ == "__main__":
    cli()