"""Enhanced options scanner integrating data quality, unified calculations, and backtesting.

This module serves as the main integration point for the new institutional-grade
components, providing a unified interface for the enhanced options scanning system.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
import pandas as pd
import numpy as np
import logging

from ..validation.data_quality import (
    OptionsDataQualityValidator, 
    DataQualityFilter, 
    DataQuality, 
    QualityReport
)
from ..math.probability import (
    OptionsProbabilityCalculator, 
    ProbabilityResult,
    ProbabilityCalibrator
)
from ..math.greeks import (
    BlackScholesGreeksCalculator, 
    OptionGreeks,
    GreeksValidator
)
from ..backtesting.engine import (
    BacktestEngine, 
    BacktestConfig, 
    PerformanceMetrics
)

logger = logging.getLogger(__name__)


@dataclass
class EnhancedOpportunity:
    """Enhanced opportunity with comprehensive analysis."""
    
    # Basic option data
    symbol: str
    option_type: str
    strike: float
    expiration: str
    bid: float
    ask: float
    last_price: float
    volume: int
    open_interest: int
    implied_volatility: float
    stock_price: float
    
    # Enhanced calculations
    probability_analysis: ProbabilityResult
    greeks: OptionGreeks
    quality_report: QualityReport
    
    # Scoring and ranking
    composite_score: float
    score_breakdown: Dict[str, float]
    risk_adjusted_score: float
    
    # Market context
    market_regime: str = ""
    sector: str = ""
    data_source: str = ""
    timestamp: datetime = None
    
    # Metadata
    tags: List[str] = None
    warnings: List[str] = None
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []
        if self.warnings is None:
            self.warnings = []
        if self.timestamp is None:
            self.timestamp = datetime.now()


class EnhancedOptionsScanner:
    """Institutional-grade options scanner with comprehensive analysis."""
    
    def __init__(self, 
                 data_quality_config: Dict[str, Any] = None,
                 probability_config: Dict[str, Any] = None,
                 greeks_config: Dict[str, Any] = None):
        """Initialize the enhanced scanner with configuration.
        
        Args:
            data_quality_config: Configuration for data quality validation
            probability_config: Configuration for probability calculations  
            greeks_config: Configuration for Greeks calculations
        """
        
        # Initialize components
        dq_config = data_quality_config or {}
        self.data_validator = OptionsDataQualityValidator(
            max_spread_pct=dq_config.get('max_spread_pct', 0.20),
            min_volume=dq_config.get('min_volume', 5),
            min_open_interest=dq_config.get('min_open_interest', 10),
            max_price_age_minutes=dq_config.get('max_price_age_minutes', 15),
            max_iv_threshold=dq_config.get('max_iv_threshold', 3.0)
        )
        
        self.quality_filter = DataQualityFilter(self.data_validator)
        
        prob_config = probability_config or {}
        self.probability_calculator = OptionsProbabilityCalculator(
            risk_free_rate=prob_config.get('risk_free_rate', 0.05)
        )
        
        greeks_config = greeks_config or {}
        self.greeks_calculator = BlackScholesGreeksCalculator(
            risk_free_rate=greeks_config.get('risk_free_rate', 0.05)
        )
        
        self.greeks_validator = GreeksValidator()
        
        # Calibration tracking
        self.probability_calibrator = ProbabilityCalibrator()
        
        # Performance tracking
        self.scan_history: List[Dict[str, Any]] = []
        
    def scan_opportunities(
        self,
        raw_opportunities: List[Dict[str, Any]],
        min_quality: DataQuality = DataQuality.MEDIUM,
        min_composite_score: float = 60.0,
        max_results: int = 50
    ) -> List[EnhancedOpportunity]:
        """Scan and analyze options opportunities with comprehensive validation.
        
        Args:
            raw_opportunities: List of raw option data dictionaries
            min_quality: Minimum data quality level to accept
            min_composite_score: Minimum composite score threshold
            max_results: Maximum number of results to return
            
        Returns:
            List of enhanced opportunities ranked by quality and score
        """
        
        logger.info(f"Scanning {len(raw_opportunities)} raw opportunities")
        
        # Step 1: Data quality filtering
        quality_filtered = self.quality_filter.filter_opportunities(
            raw_opportunities, min_quality
        )
        
        logger.info(f"After quality filtering: {len(quality_filtered)} opportunities")
        
        if not quality_filtered:
            return []
        
        # Step 2: Enhanced analysis for each opportunity
        enhanced_opportunities = []
        
        for opp in quality_filtered:
            try:
                enhanced_opp = self._analyze_single_opportunity(opp)
                if enhanced_opp and enhanced_opp.composite_score >= min_composite_score:
                    enhanced_opportunities.append(enhanced_opp)
            except Exception as e:
                logger.warning(f"Failed to analyze opportunity {opp.get('symbol', 'unknown')}: {e}")
                continue
        
        # Step 3: Sort by risk-adjusted score
        enhanced_opportunities.sort(key=lambda x: x.risk_adjusted_score, reverse=True)
        
        # Step 4: Apply result limits
        final_results = enhanced_opportunities[:max_results]
        
        # Step 5: Record scan statistics
        self._record_scan_statistics(raw_opportunities, quality_filtered, final_results)
        
        logger.info(f"Final results: {len(final_results)} enhanced opportunities")
        
        return final_results
    
    def _analyze_single_opportunity(self, opp: Dict[str, Any]) -> Optional[EnhancedOpportunity]:
        """Perform comprehensive analysis on a single opportunity."""
        
        # Extract basic data
        symbol = opp['symbol']
        option_type = opp['type']
        strike = float(opp['strike'])
        stock_price = float(opp['stockPrice'])
        premium = (float(opp['bid']) + float(opp['ask'])) / 2.0
        implied_vol = float(opp['impliedVolatility'])
        
        # Calculate days to expiration
        expiration_date = pd.to_datetime(opp['expiration'])
        days_to_exp = (expiration_date.date() - datetime.now().date()).days
        
        if days_to_exp <= 0:
            return None  # Skip expired options
            
        # Get quality report (should already exist from filtering)
        quality_report = opp.get('_quality_report')
        if not quality_report:
            quality_report = self.data_validator.validate_opportunity(opp)
            
        # Calculate comprehensive probabilities
        try:
            prob_result = self.probability_calculator.calculate_comprehensive_probabilities(
                option_type=option_type,
                stock_price=stock_price,
                strike=strike,
                premium=premium,
                implied_vol=implied_vol,
                days_to_expiration=days_to_exp,
                dividend_yield=opp.get('dividend_yield', 0.0)
            )
        except Exception as e:
            logger.warning(f"Probability calculation failed for {symbol}: {e}")
            return None
            
        # Calculate Greeks
        try:
            time_to_exp_years = days_to_exp / 365.0
            greeks = self.greeks_calculator.calculate_all_greeks(
                option_type=option_type,
                stock_price=stock_price,
                strike_price=strike,
                time_to_expiration=time_to_exp_years,
                volatility=implied_vol,
                dividend_yield=opp.get('dividend_yield', 0.0)
            )
        except Exception as e:
            logger.warning(f"Greeks calculation failed for {symbol}: {e}")
            return None
            
        # Validate Greeks
        greeks_validation = self.greeks_validator.validate_greeks(greeks)
        warnings = []
        if not all(greeks_validation.values()):
            failed_checks = [k for k, v in greeks_validation.items() if not v]
            warnings.append(f"Greeks validation failed: {failed_checks}")
            
        # Calculate composite score
        composite_score = self._calculate_composite_score(opp, prob_result, greeks, quality_report)
        
        # Calculate risk-adjusted score
        risk_adjusted_score = self._calculate_risk_adjusted_score(
            composite_score, prob_result, greeks, quality_report
        )
        
        # Determine market regime (simplified)
        market_regime = self._determine_market_regime(opp)
        
        # Create enhanced opportunity
        enhanced_opp = EnhancedOpportunity(
            symbol=symbol,
            option_type=option_type,
            strike=strike,
            expiration=opp['expiration'],
            bid=float(opp['bid']),
            ask=float(opp['ask']),
            last_price=float(opp.get('lastPrice', 0)),
            volume=int(opp['volume']),
            open_interest=int(opp['openInterest']),
            implied_volatility=implied_vol,
            stock_price=stock_price,
            probability_analysis=prob_result,
            greeks=greeks,
            quality_report=quality_report,
            composite_score=composite_score,
            score_breakdown=self._get_score_breakdown(opp, prob_result, greeks),
            risk_adjusted_score=risk_adjusted_score,
            market_regime=market_regime,
            sector=opp.get('sector', ''),
            data_source=opp.get('_price_source', 'unknown'),
            warnings=warnings,
            tags=self._generate_tags(opp, prob_result, greeks, quality_report)
        )
        
        return enhanced_opp
    
    def _calculate_composite_score(
        self, 
        opp: Dict[str, Any], 
        prob_result: ProbabilityResult,
        greeks: OptionGreeks,
        quality_report: QualityReport
    ) -> float:
        """Calculate composite score combining multiple factors."""
        
        # Base score from existing system (if available)
        base_score = float(opp.get('score', 50.0))
        
        # Data quality adjustment
        quality_multiplier = self._get_quality_multiplier(quality_report.quality)
        
        # Probability adjustment  
        prob_score = prob_result.probability_of_profit * 100
        
        # Expected value adjustment
        ev_score = max(0, min(20, prob_result.expected_value / 10.0))  # Cap at 20 points
        
        # Greeks-based adjustments
        delta_score = abs(greeks.delta) * 10  # Higher delta = more responsive
        gamma_risk = min(5, greeks.gamma * 1000)  # Gamma risk (can be positive or negative)
        theta_decay = max(-10, greeks.theta * 100)  # Theta decay penalty
        
        # Combine scores
        composite = (
            base_score * 0.4 +           # 40% existing scoring
            prob_score * 0.3 +           # 30% probability 
            ev_score * 0.1 +             # 10% expected value
            delta_score * 0.1 +          # 10% delta responsiveness
            gamma_risk * 0.05 +          # 5% gamma (can add or subtract)
            theta_decay * 0.05           # 5% theta decay
        ) * quality_multiplier
        
        return max(0.0, min(100.0, composite))
    
    def _calculate_risk_adjusted_score(
        self,
        composite_score: float,
        prob_result: ProbabilityResult,
        greeks: OptionGreeks,
        quality_report: QualityReport
    ) -> float:
        """Calculate risk-adjusted score considering downside protection."""
        
        # Start with composite score
        risk_adjusted = composite_score
        
        # Adjust for probability confidence interval
        prob_uncertainty = abs(prob_result.confidence_interval[1] - prob_result.confidence_interval[0])
        uncertainty_penalty = prob_uncertainty * 10  # Penalize high uncertainty
        risk_adjusted -= uncertainty_penalty
        
        # Adjust for maximum loss potential
        max_loss_pct = abs(prob_result.max_loss) / (abs(prob_result.max_loss) + prob_result.max_gain) if prob_result.max_gain > 0 else 0.5
        loss_penalty = max_loss_pct * 15  # Penalize high max loss
        risk_adjusted -= loss_penalty
        
        # Adjust for data quality
        if quality_report.quality == DataQuality.INSTITUTIONAL:
            risk_adjusted += 5  # Bonus for excellent data
        elif quality_report.quality in [DataQuality.LOW, DataQuality.REJECTED]:
            risk_adjusted -= 10  # Penalty for poor data
            
        # Adjust for time decay risk (high theta)
        if abs(greeks.theta) > 0.05:  # High time decay
            risk_adjusted -= abs(greeks.theta) * 50
            
        return max(0.0, min(100.0, risk_adjusted))
    
    def _get_quality_multiplier(self, quality: DataQuality) -> float:
        """Get quality multiplier for composite score."""
        
        multipliers = {
            DataQuality.INSTITUTIONAL: 1.1,
            DataQuality.HIGH: 1.0, 
            DataQuality.MEDIUM: 0.9,
            DataQuality.LOW: 0.7,
            DataQuality.REJECTED: 0.5
        }
        
        return multipliers.get(quality, 0.8)
    
    def _get_score_breakdown(
        self, 
        opp: Dict[str, Any],
        prob_result: ProbabilityResult,
        greeks: OptionGreeks
    ) -> Dict[str, float]:
        """Get detailed breakdown of score components."""
        
        return {
            'base_score': float(opp.get('score', 50.0)),
            'probability_score': prob_result.probability_of_profit * 100,
            'expected_value_score': max(0, min(20, prob_result.expected_value / 10.0)),
            'delta_score': abs(greeks.delta) * 10,
            'gamma_score': min(5, greeks.gamma * 1000),
            'theta_penalty': max(-10, greeks.theta * 100),
            'data_quality_score': float(opp.get('_data_quality_score', 60.0))
        }
    
    def _determine_market_regime(self, opp: Dict[str, Any]) -> str:
        """Determine current market regime (simplified implementation)."""
        
        # This is a placeholder - in production you'd use VIX, market trends, etc.
        iv = float(opp.get('impliedVolatility', 0.3))
        
        if iv > 0.5:
            return "high_volatility"
        elif iv < 0.2:
            return "low_volatility" 
        else:
            return "normal_volatility"
    
    def _generate_tags(
        self,
        opp: Dict[str, Any],
        prob_result: ProbabilityResult, 
        greeks: OptionGreeks,
        quality_report: QualityReport
    ) -> List[str]:
        """Generate descriptive tags for the opportunity."""
        
        tags = []
        
        # Probability-based tags
        if prob_result.probability_of_profit > 0.7:
            tags.append("high_probability")
        elif prob_result.probability_of_profit < 0.4:
            tags.append("low_probability")
            
        # Greeks-based tags
        if abs(greeks.delta) > 0.7:
            tags.append("high_delta")
        if greeks.gamma > 0.02:
            tags.append("high_gamma")
        if abs(greeks.theta) > 0.05:
            tags.append("high_time_decay")
        if greeks.vega > 0.15:
            tags.append("vol_sensitive")
            
        # Data quality tags
        if quality_report.quality == DataQuality.INSTITUTIONAL:
            tags.append("premium_data")
        elif quality_report.quality in [DataQuality.LOW, DataQuality.REJECTED]:
            tags.append("data_concerns")
            
        # Risk tags
        if prob_result.expected_value > 50:
            tags.append("positive_expectancy")
        elif prob_result.expected_value < -20:
            tags.append("negative_expectancy")
            
        # Moneyness tags
        moneyness = abs(prob_result.current_moneyness)
        if moneyness < 0.02:
            tags.append("near_atm")
        elif moneyness > 0.1:
            tags.append("deep_otm")
            
        return tags
    
    def _record_scan_statistics(
        self,
        raw_opportunities: List[Dict[str, Any]],
        quality_filtered: List[Dict[str, Any]],
        final_results: List[EnhancedOpportunity]
    ) -> None:
        """Record statistics about the scan for analysis."""
        
        stats = {
            'timestamp': datetime.now(),
            'raw_count': len(raw_opportunities),
            'quality_filtered_count': len(quality_filtered),
            'final_count': len(final_results),
            'quality_filter_rate': len(quality_filtered) / len(raw_opportunities) if raw_opportunities else 0,
            'final_filter_rate': len(final_results) / len(quality_filtered) if quality_filtered else 0,
        }
        
        if final_results:
            scores = [opp.composite_score for opp in final_results]
            stats.update({
                'avg_composite_score': np.mean(scores),
                'max_composite_score': np.max(scores),
                'min_composite_score': np.min(scores)
            })
        
        self.scan_history.append(stats)
        
        # Keep only last 100 scans
        if len(self.scan_history) > 100:
            self.scan_history = self.scan_history[-100:]
    
    def get_scan_statistics(self) -> Dict[str, Any]:
        """Get statistics about recent scans."""
        
        if not self.scan_history:
            return {}
        
        recent_scans = self.scan_history[-10:]  # Last 10 scans
        
        return {
            'total_scans': len(self.scan_history),
            'recent_scans': len(recent_scans),
            'avg_opportunities_processed': np.mean([s['raw_count'] for s in recent_scans]),
            'avg_quality_filter_rate': np.mean([s['quality_filter_rate'] for s in recent_scans]),
            'avg_final_filter_rate': np.mean([s['final_filter_rate'] for s in recent_scans]),
            'avg_final_opportunities': np.mean([s['final_count'] for s in recent_scans])
        }
    
    def add_historical_outcome(
        self,
        opportunity: EnhancedOpportunity,
        actual_outcome: bool,
        days_held: int
    ) -> None:
        """Add historical outcome for probability calibration."""
        
        self.probability_calibrator.add_historical_outcome(
            predicted_probability=opportunity.probability_analysis.probability_of_profit,
            actual_outcome=actual_outcome,
            days_held=days_held,
            option_type=opportunity.option_type,
            metadata={
                'symbol': opportunity.symbol,
                'composite_score': opportunity.composite_score,
                'data_quality': opportunity.quality_report.quality.value
            }
        )
    
    def get_calibration_metrics(self) -> Dict[str, Any]:
        """Get probability model calibration metrics."""
        
        return self.probability_calibrator.calculate_calibration_metrics()
    
    def run_backtest_validation(
        self,
        historical_opportunities: pd.DataFrame,
        historical_prices: pd.DataFrame,
        config: BacktestConfig = None
    ) -> PerformanceMetrics:
        """Run backtest validation of the enhanced scanner."""
        
        if config is None:
            config = BacktestConfig(
                start_date=historical_opportunities['date'].min(),
                end_date=historical_opportunities['date'].max(),
                initial_capital=100000.0,
                min_score_threshold=60.0
            )
        
        # Convert enhanced opportunities to backtest format
        backtest_data = self._prepare_backtest_data(historical_opportunities)
        
        # Run backtest
        engine = BacktestEngine(config)
        performance = engine.run_backtest(backtest_data, historical_prices)
        
        return performance
    
    def _prepare_backtest_data(self, historical_opportunities: pd.DataFrame) -> pd.DataFrame:
        """Convert enhanced opportunities to backtest-compatible format."""
        
        # This would map the enhanced opportunity format to the backtest format
        # For now, return the data as-is, assuming it's already compatible
        return historical_opportunities


__all__ = [
    "EnhancedOpportunity",
    "EnhancedOptionsScanner"
]