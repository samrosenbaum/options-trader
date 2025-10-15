"""Data quality validation and scoring for options trading data.

This module provides comprehensive validation of options data to ensure only high-quality
opportunities are presented to traders. It checks for stale prices, wide spreads, low liquidity,
and other data quality issues that could impact trading decisions.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Dict, List, Optional, Any
import math
import pandas as pd
import numpy as np


class DataQuality(Enum):
    """Data quality levels for options data."""
    INSTITUTIONAL = "institutional"  # 95-100 points
    HIGH = "high"            # 80-94 points
    MEDIUM = "medium"        # 60-79 points
    LOW = "low"             # 40-59 points
    REJECTED = "rejected"    # <40 points


@dataclass
class QualityIssue:
    """Represents a specific data quality issue."""
    severity: str  # "critical", "warning", "info"
    message: str
    impact_points: float
    field: str
    value: Any = None


@dataclass
class QualityReport:
    """Comprehensive data quality report for an options opportunity."""
    symbol: str
    strike: float
    option_type: str
    expiration: str
    
    quality: DataQuality
    score: float  # 0-100
    
    issues: List[QualityIssue]
    warnings: List[QualityIssue] 
    metadata: Dict[str, Any]
    
    @property
    def is_tradeable(self) -> bool:
        """Whether this opportunity meets minimum quality standards."""
        return self.quality not in [DataQuality.REJECTED, DataQuality.LOW]
    
    @property
    def critical_issues(self) -> List[QualityIssue]:
        """Issues that completely disqualify the opportunity."""
        return [issue for issue in self.issues if issue.severity == "critical"]
    
    @property
    def summary(self) -> str:
        """Human-readable quality summary."""
        if self.quality == DataQuality.INSTITUTIONAL:
            return f"Institutional grade ({self.score:.0f}/100) - Excellent data quality"
        elif self.quality == DataQuality.HIGH:
            return f"High quality ({self.score:.0f}/100) - Good for trading"
        elif self.quality == DataQuality.MEDIUM:
            return f"Medium quality ({self.score:.0f}/100) - Acceptable with caution"
        elif self.quality == DataQuality.LOW:
            return f"Low quality ({self.score:.0f}/100) - Not recommended"
        else:
            return f"Rejected ({self.score:.0f}/100) - Do not trade"


class OptionsDataQualityValidator:
    """Comprehensive validator for options data quality."""

    def __init__(self,
                 max_spread_pct: float = 0.20,
                 min_volume: int = 5,
                 min_open_interest: int = 10,
                 max_price_age_minutes: int = 15,
                 max_iv_threshold: float = 3.0):
        """Initialize validator with quality thresholds.
        
        Args:
            max_spread_pct: Maximum bid-ask spread as % of mid price (20% default)
            min_volume: Minimum daily volume (5 default)
            min_open_interest: Minimum open interest (10 default) 
            max_price_age_minutes: Maximum age of stock price during market hours (15 min)
            max_iv_threshold: Maximum implied volatility (300%)
        """
        self.max_spread_pct = max_spread_pct
        self.min_volume = min_volume
        self.min_open_interest = min_open_interest
        self.max_price_age_minutes = max_price_age_minutes
        self.max_iv_threshold = max_iv_threshold

    def validate_option(self, option: Dict[str, Any]) -> QualityReport:
        """Backward compatible wrapper around :meth:`validate_opportunity`.

        Historically the validator exposed a ``validate_option`` method.  The
        higher level scanner and tests still invoke this entry point, so the
        refactor that introduced :meth:`validate_opportunity` unintentionally
        removed the public API that callers depend on.  This thin wrapper keeps
        the existing behavior while allowing the more descriptive method name to
        be used internally going forward.
        """

        return self.validate_opportunity(option)

    def validate_opportunity(self, opportunity: Dict[str, Any]) -> QualityReport:
        """Validate a single options opportunity and return comprehensive quality report."""

        symbol = opportunity.get('symbol', 'UNKNOWN')
        strike = opportunity.get('strike', 0)
        option_type = opportunity.get('type', 'unknown')
        expiration = opportunity.get('expiration', 'unknown')
        
        score = 100.0
        issues: List[QualityIssue] = []
        warnings: List[QualityIssue] = []
        metadata = {}
        
        # Validate stock price freshness
        price_issues = self._validate_stock_price(opportunity)
        issues.extend([i for i in price_issues if i.severity == "critical"])
        warnings.extend([i for i in price_issues if i.severity in ["warning", "info"]])
        score -= sum(i.impact_points for i in price_issues)
        
        # Validate option pricing data
        pricing_issues = self._validate_option_pricing(opportunity)
        issues.extend([i for i in pricing_issues if i.severity == "critical"])
        warnings.extend([i for i in pricing_issues if i.severity in ["warning", "info"]])
        score -= sum(i.impact_points for i in pricing_issues)
        
        # Validate liquidity
        liquidity_issues = self._validate_liquidity(opportunity)
        issues.extend([i for i in liquidity_issues if i.severity == "critical"])
        warnings.extend([i for i in liquidity_issues if i.severity in ["warning", "info"]])
        score -= sum(i.impact_points for i in liquidity_issues)
        
        # Validate implied volatility
        iv_issues = self._validate_implied_volatility(opportunity)
        issues.extend([i for i in iv_issues if i.severity == "critical"])
        warnings.extend([i for i in iv_issues if i.severity in ["warning", "info"]])
        score -= sum(i.impact_points for i in iv_issues)
        
        # Validate contract specifications
        spec_issues = self._validate_contract_specs(opportunity)
        issues.extend([i for i in spec_issues if i.severity == "critical"])
        warnings.extend([i for i in spec_issues if i.severity in ["warning", "info"]])
        score -= sum(i.impact_points for i in spec_issues)
        
        # Calculate metadata for reporting
        metadata = self._calculate_metadata(opportunity, score)
        
        # Determine final quality level
        score = max(0.0, score)
        if score >= 95:
            quality = DataQuality.INSTITUTIONAL
        elif score >= 80:
            quality = DataQuality.HIGH  
        elif score >= 60:
            quality = DataQuality.MEDIUM
        elif score >= 40:
            quality = DataQuality.LOW
        else:
            quality = DataQuality.REJECTED
            
        return QualityReport(
            symbol=symbol,
            strike=strike,
            option_type=option_type,
            expiration=expiration,
            quality=quality,
            score=score,
            issues=issues,
            warnings=warnings,
            metadata=metadata
        )
    
    def _validate_stock_price(self, opp: Dict[str, Any]) -> List[QualityIssue]:
        """Validate stock price data quality."""
        issues = []
        
        stock_price = opp.get('stockPrice')
        if not stock_price or stock_price <= 0:
            issues.append(QualityIssue(
                severity="critical",
                message="Missing or invalid stock price",
                impact_points=50.0,
                field="stockPrice",
                value=stock_price
            ))
            return issues
        
        # Check price age
        price_age_seconds = opp.get('_price_age_seconds')
        if price_age_seconds is not None:
            age_minutes = price_age_seconds / 60.0
            is_market_open = self._is_market_hours()

            # During market hours, prices should be fresh
            if is_market_open and age_minutes > self.max_price_age_minutes:
                if age_minutes > 60:  # Over 1 hour old
                    issues.append(QualityIssue(
                        severity="critical",
                        message=f"Stock price is {age_minutes:.0f} minutes old - too stale",
                        impact_points=40.0,
                        field="_price_age_seconds",
                        value=price_age_seconds
                    ))
                else:
                    issues.append(QualityIssue(
                        severity="warning",
                        message=f"Stock price is {age_minutes:.0f} minutes old",
                        impact_points=15.0,
                        field="_price_age_seconds",
                        value=price_age_seconds
                    ))
            elif not is_market_open and age_minutes > 1440:  # More than 24 hours old when markets closed
                # When markets are closed, be more lenient - only warn if data is >24 hours old
                issues.append(QualityIssue(
                    severity="warning",
                    message=f"Stock price is {age_minutes / 60:.1f} hours old (markets closed)",
                    impact_points=5.0,  # Reduced penalty when markets closed
                    field="_price_age_seconds",
                    value=price_age_seconds
                ))
        
        # Check price source quality
        price_source = opp.get('_price_source', '')
        is_market_open = self._is_market_hours()

        if 'STALE' in price_source.upper() and is_market_open:
            # Only penalize stale sources during market hours
            issues.append(QualityIssue(
                severity="warning",
                message=f"Price from stale source: {price_source}",
                impact_points=20.0,
                field="_price_source",
                value=price_source
            ))
        elif 'previousClose' in price_source and is_market_open:
            # Using previous close during market hours is bad
            issues.append(QualityIssue(
                severity="critical",
                message="Using previous day's close during market hours",
                impact_points=35.0,
                field="_price_source",
                value=price_source
            ))
        elif 'previousClose' in price_source and not is_market_open:
            # Using previous close when markets are closed is fine, just note it
            issues.append(QualityIssue(
                severity="info",
                message=f"Using previous close (markets closed)",
                impact_points=0.0,  # No penalty
                field="_price_source",
                value=price_source
            ))
            
        return issues
    
    def _validate_option_pricing(self, opp: Dict[str, Any]) -> List[QualityIssue]:
        """Validate option price data quality."""
        issues = []
        
        bid = opp.get('bid', 0)
        ask = opp.get('ask', 0) 
        last_price = opp.get('lastPrice', 0)
        
        # Check for missing prices
        if bid <= 0 and ask <= 0 and last_price <= 0:
            issues.append(QualityIssue(
                severity="critical",
                message="No valid option prices available",
                impact_points=50.0,
                field="pricing",
                value={"bid": bid, "ask": ask, "lastPrice": last_price}
            ))
            return issues
        
        # Check bid-ask spread quality
        if bid > 0 and ask > 0:
            mid_price = (bid + ask) / 2
            spread = ask - bid
            spread_pct = spread / mid_price if mid_price > 0 else float('inf')
            
            if spread_pct > 0.50:  # 50% spread is excessive
                issues.append(QualityIssue(
                    severity="critical",
                    message=f"Excessive bid-ask spread: {spread_pct:.1%}",
                    impact_points=40.0,
                    field="spread",
                    value=spread_pct
                ))
            elif spread_pct > self.max_spread_pct:
                issues.append(QualityIssue(
                    severity="warning",
                    message=f"Wide bid-ask spread: {spread_pct:.1%}",
                    impact_points=15.0,
                    field="spread",
                    value=spread_pct
                ))
            
            # Check for crossed markets (bid > ask)
            if bid >= ask:
                issues.append(QualityIssue(
                    severity="critical",
                    message=f"Crossed market: bid ({bid}) >= ask ({ask})",
                    impact_points=50.0,
                    field="crossed_market",
                    value={"bid": bid, "ask": ask}
                ))
        
        # Validate last price reasonableness
        if last_price > 0 and bid > 0 and ask > 0:
            if last_price < bid * 0.5 or last_price > ask * 2:
                issues.append(QualityIssue(
                    severity="warning",
                    message=f"Last price ({last_price}) seems inconsistent with bid-ask",
                    impact_points=10.0,
                    field="lastPrice",
                    value=last_price
                ))
                
        return issues
    
    def _validate_liquidity(self, opp: Dict[str, Any]) -> List[QualityIssue]:
        """Validate option liquidity."""
        issues = []

        volume = opp.get('volume', 0)
        open_interest = opp.get('openInterest', 0)
        is_market_open = self._is_market_hours()

        # Check volume - be lenient when markets are closed
        if volume == 0 and is_market_open:
            issues.append(QualityIssue(
                severity="critical",
                message="Zero volume - no trading activity",
                impact_points=40.0,
                field="volume",
                value=volume
            ))
        elif volume == 0 and not is_market_open:
            # Zero volume is normal when markets are closed
            issues.append(QualityIssue(
                severity="info",
                message="Zero volume (markets closed - normal)",
                impact_points=0.0,  # No penalty
                field="volume",
                value=volume
            ))
        elif volume < self.min_volume and is_market_open:
            issues.append(QualityIssue(
                severity="warning",
                message=f"Low volume: {volume} (min recommended: {self.min_volume})",
                impact_points=20.0,
                field="volume",
                value=volume
            ))

        # Check open interest - more important than volume
        if open_interest == 0:
            # Zero OI is always concerning, but less critical when markets are closed
            severity = "warning" if not is_market_open else "critical"
            impact = 15.0 if not is_market_open else 40.0
            issues.append(QualityIssue(
                severity=severity,
                message="Zero open interest - illiquid contract",
                impact_points=impact,
                field="openInterest",
                value=open_interest
            ))
        elif open_interest < self.min_open_interest:
            issues.append(QualityIssue(
                severity="warning",
                message=f"Low open interest: {open_interest} (min recommended: {self.min_open_interest})",
                impact_points=10.0,  # Reduced from 15.0
                field="openInterest",
                value=open_interest
            ))

        return issues
    
    def _validate_implied_volatility(self, opp: Dict[str, Any]) -> List[QualityIssue]:
        """Validate implied volatility data."""
        issues = []
        
        iv = opp.get('impliedVolatility', 0)
        
        if iv <= 0:
            issues.append(QualityIssue(
                severity="critical",
                message="Missing or invalid implied volatility",
                impact_points=30.0,
                field="impliedVolatility",
                value=iv
            ))
        elif iv > self.max_iv_threshold:
            issues.append(QualityIssue(
                severity="warning",
                message=f"Extremely high IV: {iv:.1%} (may be erroneous)",
                impact_points=20.0,
                field="impliedVolatility",
                value=iv
            ))
        elif iv > 2.0:  # 200% IV is very high but possible
            issues.append(QualityIssue(
                severity="info",
                message=f"Very high IV: {iv:.1%}",
                impact_points=5.0,
                field="impliedVolatility",
                value=iv
            ))
            
        return issues
    
    def _validate_contract_specs(self, opp: Dict[str, Any]) -> List[QualityIssue]:
        """Validate contract specifications."""
        issues = []
        
        strike = opp.get('strike', 0)
        stock_price = opp.get('stockPrice', 0)
        
        if strike <= 0:
            issues.append(QualityIssue(
                severity="critical",
                message="Invalid strike price",
                impact_points=30.0,
                field="strike",
                value=strike
            ))
            return issues
        
        # Check if option is extremely far out of the money
        if stock_price > 0:
            moneyness = abs(strike - stock_price) / stock_price
            if moneyness > 0.50:  # More than 50% OTM
                issues.append(QualityIssue(
                    severity="warning",
                    message=f"Deep OTM option: {moneyness:.1%} from stock price",
                    impact_points=10.0,
                    field="moneyness",
                    value=moneyness
                ))
        
        # Check expiration
        expiration_str = opp.get('expiration', '')
        if expiration_str:
            try:
                from datetime import datetime
                exp_date = datetime.fromisoformat(expiration_str.replace('Z', '+00:00'))
                days_to_exp = (exp_date.date() - datetime.now().date()).days
                
                if days_to_exp < 0:
                    issues.append(QualityIssue(
                        severity="critical",
                        message="Option has already expired",
                        impact_points=100.0,
                        field="expiration",
                        value=expiration_str
                    ))
                elif days_to_exp == 0:
                    issues.append(QualityIssue(
                        severity="critical",
                        message="Option expires today - extreme time risk",
                        impact_points=50.0,
                        field="expiration", 
                        value=expiration_str
                    ))
                elif days_to_exp == 1:
                    issues.append(QualityIssue(
                        severity="warning",
                        message="Option expires tomorrow - high time risk",
                        impact_points=25.0,
                        field="expiration",
                        value=expiration_str
                    ))
            except (ValueError, AttributeError):
                issues.append(QualityIssue(
                    severity="warning",
                    message="Could not parse expiration date",
                    impact_points=10.0,
                    field="expiration",
                    value=expiration_str
                ))
                
        return issues
    
    def _calculate_metadata(self, opp: Dict[str, Any], score: float) -> Dict[str, Any]:
        """Calculate additional metadata for the quality report."""
        metadata = {}
        
        # Spread metrics
        bid = opp.get('bid', 0)
        ask = opp.get('ask', 0)
        if bid > 0 and ask > 0:
            spread = ask - bid
            mid = (bid + ask) / 2
            metadata['spread_dollars'] = spread
            metadata['spread_pct'] = spread / mid if mid > 0 else None
            metadata['mid_price'] = mid
        
        # Liquidity metrics  
        volume = opp.get('volume', 0)
        oi = opp.get('openInterest', 0)
        if oi > 0:
            metadata['volume_oi_ratio'] = volume / oi
        
        # Price freshness
        age_seconds = opp.get('_price_age_seconds')
        if age_seconds is not None:
            metadata['price_age_minutes'] = age_seconds / 60.0
            
        metadata['validation_timestamp'] = datetime.now(timezone.utc).isoformat()
        metadata['validator_version'] = '1.0'
        
        return metadata
    
    def _is_market_hours(self) -> bool:
        """Check if current time is during market hours (9:30 AM - 4 PM ET)."""
        now = datetime.now(timezone.utc)
        # Convert to Eastern Time
        eastern_offset = timedelta(hours=5)  # EST offset from UTC
        # Note: This is simplified - real implementation should handle DST
        eastern_time = now - eastern_offset
        
        # Market is open Monday-Friday 9:30 AM - 4:00 PM ET
        if eastern_time.weekday() >= 5:  # Saturday = 5, Sunday = 6
            return False
            
        time_only = eastern_time.time()
        market_open = datetime.strptime("09:30", "%H:%M").time()
        market_close = datetime.strptime("16:00", "%H:%M").time()
        
        return market_open <= time_only <= market_close


class DataQualityFilter:
    """Filter opportunities based on data quality requirements."""
    
    def __init__(self, validator: OptionsDataQualityValidator):
        self.validator = validator
        
    def filter_opportunities(self, 
                           opportunities: List[Dict[str, Any]], 
                           min_quality: DataQuality = DataQuality.MEDIUM) -> List[Dict[str, Any]]:
        """Filter opportunities to only include those meeting minimum quality standards."""
        
        quality_levels = {
            DataQuality.INSTITUTIONAL: 95,
            DataQuality.HIGH: 80,
            DataQuality.MEDIUM: 60,
            DataQuality.LOW: 40,
            DataQuality.REJECTED: 0
        }
        
        min_score = quality_levels[min_quality]
        filtered_opportunities = []
        
        for opp in opportunities:
            quality_report = self.validator.validate_opportunity(opp)
            
            if quality_report.score >= min_score:
                # Add quality metadata to the opportunity
                opp['_quality_report'] = quality_report
                opp['_data_quality_score'] = quality_report.score
                opp['_data_quality_level'] = quality_report.quality.value
                filtered_opportunities.append(opp)
        
        return filtered_opportunities
    
    def get_quality_statistics(self, opportunities: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Get statistics about data quality across all opportunities."""
        
        if not opportunities:
            return {}
            
        quality_reports = []
        for opp in opportunities:
            quality_reports.append(self.validator.validate_opportunity(opp))
            
        scores = [r.score for r in quality_reports]
        qualities = [r.quality.value for r in quality_reports]
        
        from collections import Counter
        quality_counts = Counter(qualities)
        
        return {
            'total_opportunities': len(opportunities),
            'avg_quality_score': np.mean(scores),
            'median_quality_score': np.median(scores),
            'min_quality_score': np.min(scores),
            'max_quality_score': np.max(scores),
            'quality_distribution': dict(quality_counts),
            'tradeable_opportunities': len([r for r in quality_reports if r.is_tradeable]),
            'critical_issues_count': sum(len(r.critical_issues) for r in quality_reports),
            'warnings_count': sum(len(r.warnings) for r in quality_reports)
        }


# Alias for backward compatibility
OptionsDataValidator = OptionsDataQualityValidator

__all__ = [
    "DataQuality",
    "QualityIssue", 
    "QualityReport",
    "OptionsDataQualityValidator",
    "OptionsDataValidator",  # Alias for backward compatibility
    "DataQualityFilter"
]