"""
Custom Scanner - User-configurable options filtering

Allows users to define their own criteria for finding options:
- Volume and open interest thresholds
- Greek ranges (delta, gamma, theta, vega)
- IV and DTE ranges
- Spread and liquidity filters
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple, Optional
from datetime import date

from src.models import OptionContract, OptionGreeks, OptionScore, ScoreBreakdown, ScoringResult


@dataclass
class CustomFilterCriteria:
    """User-defined filter criteria for custom scanner"""

    # Volume & Liquidity
    min_volume: Optional[int] = None
    min_open_interest: Optional[int] = None
    max_spread_percent: Optional[float] = None  # as decimal (0.05 = 5%)

    # Greeks Ranges
    min_delta: Optional[float] = None
    max_delta: Optional[float] = None
    min_gamma: Optional[float] = None
    max_gamma: Optional[float] = None
    min_theta: Optional[float] = None
    max_theta: Optional[float] = None
    min_vega: Optional[float] = None
    max_vega: Optional[float] = None

    # IV & Time
    min_iv: Optional[float] = None  # as decimal
    max_iv: Optional[float] = None
    min_dte: Optional[int] = None
    max_dte: Optional[int] = None

    # Option Type
    option_type: Optional[str] = None  # "call", "put", or None for both

    # Strike filters
    min_strike: Optional[float] = None
    max_strike: Optional[float] = None

    # Price range
    min_price: Optional[float] = None
    max_price: Optional[float] = None


class CustomScanner:
    """Simple scanner that filters based on user-defined criteria"""

    def __init__(self, criteria: CustomFilterCriteria):
        self.criteria = criteria

    def passes_filters(
        self,
        contract: OptionContract,
        greeks: OptionGreeks
    ) -> Tuple[bool, List[str], int]:
        """
        Check if option passes all user-defined filters

        Returns:
            (passes, reasons, match_count) - bool, list of failure reasons, and number of criteria matched
        """
        reasons = []
        match_count = 0
        total_criteria = 0

        # Volume filters
        if self.criteria.min_volume is not None:
            total_criteria += 1
            if contract.volume < self.criteria.min_volume:
                reasons.append(f"Volume {contract.volume:,} < {self.criteria.min_volume:,} minimum")
            else:
                match_count += 1

        if self.criteria.min_open_interest is not None:
            total_criteria += 1
            if contract.open_interest < self.criteria.min_open_interest:
                reasons.append(f"OI {contract.open_interest:,} < {self.criteria.min_open_interest:,} minimum")
            else:
                match_count += 1

        # Spread filter
        if self.criteria.max_spread_percent is not None:
            total_criteria += 1
            if contract.last_price > 0:
                spread_pct = (contract.ask - contract.bid) / contract.last_price
                if spread_pct > self.criteria.max_spread_percent:
                    reasons.append(
                        f"Spread {spread_pct*100:.1f}% > {self.criteria.max_spread_percent*100:.1f}% max"
                    )
                else:
                    match_count += 1

        # Delta filters
        if self.criteria.min_delta is not None:
            total_criteria += 1
            abs_delta = abs(greeks.delta)
            if abs_delta < self.criteria.min_delta:
                reasons.append(f"Delta {abs_delta:.3f} < {self.criteria.min_delta:.3f} minimum")
            else:
                match_count += 1

        if self.criteria.max_delta is not None:
            total_criteria += 1
            abs_delta = abs(greeks.delta)
            if abs_delta > self.criteria.max_delta:
                reasons.append(f"Delta {abs_delta:.3f} > {self.criteria.max_delta:.3f} maximum")
            else:
                match_count += 1

        # Gamma filters
        if self.criteria.min_gamma is not None:
            total_criteria += 1
            if abs(greeks.gamma) < self.criteria.min_gamma:
                reasons.append(f"Gamma {abs(greeks.gamma):.4f} < {self.criteria.min_gamma:.4f} minimum")
            else:
                match_count += 1

        if self.criteria.max_gamma is not None:
            total_criteria += 1
            if abs(greeks.gamma) > self.criteria.max_gamma:
                reasons.append(f"Gamma {abs(greeks.gamma):.4f} > {self.criteria.max_gamma:.4f} maximum")
            else:
                match_count += 1

        # Theta filters (note: theta is usually negative)
        if self.criteria.min_theta is not None:
            total_criteria += 1
            if greeks.theta < self.criteria.min_theta:
                reasons.append(f"Theta {greeks.theta:.3f} < {self.criteria.min_theta:.3f} minimum")
            else:
                match_count += 1

        if self.criteria.max_theta is not None:
            total_criteria += 1
            if greeks.theta > self.criteria.max_theta:
                reasons.append(f"Theta {greeks.theta:.3f} > {self.criteria.max_theta:.3f} maximum")
            else:
                match_count += 1

        # Vega filters
        if self.criteria.min_vega is not None:
            total_criteria += 1
            if abs(greeks.vega) < self.criteria.min_vega:
                reasons.append(f"Vega {abs(greeks.vega):.3f} < {self.criteria.min_vega:.3f} minimum")
            else:
                match_count += 1

        if self.criteria.max_vega is not None:
            total_criteria += 1
            if abs(greeks.vega) > self.criteria.max_vega:
                reasons.append(f"Vega {abs(greeks.vega):.3f} > {self.criteria.max_vega:.3f} maximum")
            else:
                match_count += 1

        # IV filters
        if self.criteria.min_iv is not None:
            total_criteria += 1
            if contract.implied_volatility < self.criteria.min_iv:
                reasons.append(
                    f"IV {contract.implied_volatility*100:.1f}% < {self.criteria.min_iv*100:.1f}% minimum"
                )
            else:
                match_count += 1

        if self.criteria.max_iv is not None:
            total_criteria += 1
            if contract.implied_volatility > self.criteria.max_iv:
                reasons.append(
                    f"IV {contract.implied_volatility*100:.1f}% > {self.criteria.max_iv*100:.1f}% maximum"
                )
            else:
                match_count += 1

        # DTE filters
        dte = contract.days_to_expiration
        if self.criteria.min_dte is not None:
            total_criteria += 1
            if dte < self.criteria.min_dte:
                reasons.append(f"DTE {dte} < {self.criteria.min_dte} minimum")
            else:
                match_count += 1

        if self.criteria.max_dte is not None:
            total_criteria += 1
            if dte > self.criteria.max_dte:
                reasons.append(f"DTE {dte} > {self.criteria.max_dte} maximum")
            else:
                match_count += 1

        # Option type filter
        if self.criteria.option_type is not None:
            total_criteria += 1
            if contract.option_type != self.criteria.option_type:
                reasons.append(f"Type {contract.option_type} != {self.criteria.option_type} required")
            else:
                match_count += 1

        # Strike filters
        if self.criteria.min_strike is not None:
            total_criteria += 1
            if contract.strike < self.criteria.min_strike:
                reasons.append(f"Strike ${contract.strike:.2f} < ${self.criteria.min_strike:.2f} minimum")
            else:
                match_count += 1

        if self.criteria.max_strike is not None:
            total_criteria += 1
            if contract.strike > self.criteria.max_strike:
                reasons.append(f"Strike ${contract.strike:.2f} > ${self.criteria.max_strike:.2f} maximum")
            else:
                match_count += 1

        # Price filters
        if self.criteria.min_price is not None:
            total_criteria += 1
            if contract.last_price < self.criteria.min_price:
                reasons.append(f"Price ${contract.last_price:.2f} < ${self.criteria.min_price:.2f} minimum")
            else:
                match_count += 1

        if self.criteria.max_price is not None:
            total_criteria += 1
            if contract.last_price > self.criteria.max_price:
                reasons.append(f"Price ${contract.last_price:.2f} > ${self.criteria.max_price:.2f} maximum")
            else:
                match_count += 1

        passes = len(reasons) == 0
        return passes, reasons, match_count

    def score_option(
        self,
        contract: OptionContract,
        greeks: OptionGreeks
    ) -> ScoringResult:
        """
        Score an option based on how well it matches the criteria

        Returns a simple score based on percentage of criteria matched
        """
        passes, failure_reasons, match_count = self.passes_filters(contract, greeks)

        # Calculate match percentage
        total_criteria = self._count_active_criteria()
        if total_criteria == 0:
            match_percentage = 100.0
        else:
            match_percentage = (match_count / total_criteria) * 100.0

        # Build score
        tags = []
        reasons = []

        if passes:
            tags.append("custom-match")
            reasons.append(f"Matches all {total_criteria} criteria")

            # Add descriptive tags based on what matched
            if self.criteria.min_volume or self.criteria.min_open_interest:
                tags.append("high-liquidity")
            if self.criteria.min_delta or self.criteria.max_delta:
                tags.append("delta-filtered")
            if self.criteria.min_iv or self.criteria.max_iv:
                tags.append("iv-filtered")
        else:
            reasons.extend(failure_reasons[:3])  # Top 3 failure reasons
            tags.append("partial-match")

        breakdown = ScoreBreakdown(
            scorer="custom",
            weight=1.0,
            raw_score=match_percentage,
            weighted_score=match_percentage,
            reasons=reasons,
            tags=tags
        )

        score = OptionScore(
            total_score=match_percentage,
            breakdowns=[breakdown],
            reasons=reasons,
            tags=tags,
            metadata={
                "match_count": match_count,
                "total_criteria": total_criteria,
                "match_percentage": match_percentage,
                "passes_all": passes
            }
        )

        return ScoringResult(
            contract=contract,
            greeks=greeks,
            score=score
        )

    def _count_active_criteria(self) -> int:
        """Count how many filter criteria are active (not None)"""
        count = 0

        if self.criteria.min_volume is not None:
            count += 1
        if self.criteria.min_open_interest is not None:
            count += 1
        if self.criteria.max_spread_percent is not None:
            count += 1
        if self.criteria.min_delta is not None:
            count += 1
        if self.criteria.max_delta is not None:
            count += 1
        if self.criteria.min_gamma is not None:
            count += 1
        if self.criteria.max_gamma is not None:
            count += 1
        if self.criteria.min_theta is not None:
            count += 1
        if self.criteria.max_theta is not None:
            count += 1
        if self.criteria.min_vega is not None:
            count += 1
        if self.criteria.max_vega is not None:
            count += 1
        if self.criteria.min_iv is not None:
            count += 1
        if self.criteria.max_iv is not None:
            count += 1
        if self.criteria.min_dte is not None:
            count += 1
        if self.criteria.max_dte is not None:
            count += 1
        if self.criteria.option_type is not None:
            count += 1
        if self.criteria.min_strike is not None:
            count += 1
        if self.criteria.max_strike is not None:
            count += 1
        if self.criteria.min_price is not None:
            count += 1
        if self.criteria.max_price is not None:
            count += 1

        return count
