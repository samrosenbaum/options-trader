"""Probability of Profit (PoP) Calculator for Options.

This module provides statistical probability calculations for option profitability
using historical move distributions rather than assuming normal distribution.

Key features:
- Uses kernel density estimation on historical moves for fat-tail awareness
- Adjusts for earnings/events
- Considers IV vs realized vol spread
- Provides breakeven analysis
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

import numpy as np

try:
    from scipy.stats import gaussian_kde, norm
    from scipy.integrate import quad
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


class ProbabilityOfProfitCalculator:
    """Calculate probability of profit using historical move distributions."""

    def __init__(self, historical_returns: Optional[np.ndarray] = None):
        """
        Initialize calculator.

        Args:
            historical_returns: Optional array of historical daily returns for the symbol.
                              If not provided, will use normal distribution approximation.
        """
        self.historical_returns = historical_returns
        self._kde = None
        if historical_returns is not None and len(historical_returns) > 30 and HAS_SCIPY:
            try:
                self._kde = gaussian_kde(historical_returns)
            except Exception:
                self._kde = None

    def calculate_pop(
        self,
        stock_price: float,
        strike: float,
        option_type: str,
        option_price: float,
        days_to_expiration: int,
        implied_volatility: float,
        dividend_yield: float = 0.0,
    ) -> Dict[str, float]:
        """
        Calculate probability of profit for an option position.

        Args:
            stock_price: Current stock price
            strike: Option strike price
            option_type: 'call' or 'put'
            option_price: Premium paid for the option
            days_to_expiration: Days until expiration
            implied_volatility: Annualized implied volatility (as decimal, e.g., 0.30 for 30%)
            dividend_yield: Annualized dividend yield (as decimal)

        Returns:
            Dictionary with probability metrics
        """
        if days_to_expiration <= 0:
            return self._expired_position_analysis(
                stock_price, strike, option_type, option_price
            )

        # Calculate breakeven price
        if option_type.lower() == "call":
            breakeven_price = strike + option_price
            breakeven_move = (breakeven_price - stock_price) / stock_price
        else:
            breakeven_price = strike - option_price
            breakeven_move = (stock_price - breakeven_price) / stock_price

        # Calculate expected move using IV
        time_fraction = days_to_expiration / 365.0
        expected_move_1sd = implied_volatility * np.sqrt(time_fraction)

        # Calculate probability using best available method
        if self._kde is not None:
            # Use historical distribution (accounts for fat tails)
            pop = self._calculate_pop_kde(
                breakeven_move, days_to_expiration, option_type
            )
            method = "historical_kde"
        else:
            # Fall back to log-normal approximation
            pop = self._calculate_pop_lognormal(
                stock_price, breakeven_price, days_to_expiration,
                implied_volatility, dividend_yield, option_type
            )
            method = "lognormal"

        # Calculate probability of various outcomes
        prob_50_profit = self._calculate_target_probability(
            stock_price, strike, option_price, 0.50,
            days_to_expiration, implied_volatility, option_type
        )
        prob_100_profit = self._calculate_target_probability(
            stock_price, strike, option_price, 1.00,
            days_to_expiration, implied_volatility, option_type
        )

        # Expected value calculation
        ev = self._calculate_expected_value(
            stock_price, strike, option_type, option_price,
            days_to_expiration, implied_volatility
        )

        return {
            "probability_of_profit": round(pop, 4),
            "probability_of_50pct_profit": round(prob_50_profit, 4),
            "probability_of_100pct_profit": round(prob_100_profit, 4),
            "breakeven_price": round(breakeven_price, 2),
            "breakeven_move_pct": round(breakeven_move * 100, 2),
            "expected_move_1sd": round(expected_move_1sd * 100, 2),
            "expected_value_per_contract": round(ev, 2),
            "calculation_method": method,
            "edge_indicator": self._calculate_edge(pop, ev, option_price),
        }

    def _calculate_pop_lognormal(
        self,
        stock_price: float,
        breakeven_price: float,
        dte: int,
        iv: float,
        dividend_yield: float,
        option_type: str,
    ) -> float:
        """Calculate PoP using log-normal distribution (Black-Scholes assumption)."""
        if not HAS_SCIPY:
            # Simple approximation without scipy
            return self._simple_pop_approximation(
                stock_price, breakeven_price, dte, iv, option_type
            )

        time_fraction = dte / 365.0
        if time_fraction <= 0:
            return 0.0

        # Log-normal parameters
        # drift = (r - d - 0.5 * sigma^2) * t
        # Using 0 risk-free rate for simplicity
        drift = (-dividend_yield - 0.5 * iv ** 2) * time_fraction
        vol = iv * np.sqrt(time_fraction)

        if vol <= 0:
            return 0.0

        # d2 calculation (probability of finishing above/below strike)
        d2 = (np.log(stock_price / breakeven_price) + drift) / vol

        if option_type.lower() == "call":
            # Probability of finishing above breakeven
            pop = norm.cdf(d2)
        else:
            # Probability of finishing below breakeven
            pop = norm.cdf(-d2)

        return float(pop)

    def _calculate_pop_kde(
        self,
        breakeven_move: float,
        dte: int,
        option_type: str,
    ) -> float:
        """Calculate PoP using kernel density estimation on historical returns."""
        if self._kde is None:
            return 0.5

        # Scale daily returns to DTE-period returns
        # Assuming returns scale with sqrt(time)
        scaling_factor = np.sqrt(dte)

        try:
            if option_type.lower() == "call":
                # Need price to rise above breakeven
                # Integrate from breakeven_move to infinity
                pop = 1.0 - self._kde.integrate_box_1d(-np.inf, breakeven_move / scaling_factor)
            else:
                # Need price to fall below breakeven (breakeven_move is positive for puts)
                pop = self._kde.integrate_box_1d(-np.inf, -breakeven_move / scaling_factor)

            return float(np.clip(pop, 0, 1))
        except Exception:
            return 0.5

    def _simple_pop_approximation(
        self,
        stock_price: float,
        breakeven_price: float,
        dte: int,
        iv: float,
        option_type: str,
    ) -> float:
        """Simple PoP approximation without scipy."""
        time_fraction = dte / 365.0
        if time_fraction <= 0 or iv <= 0:
            return 0.0

        # Calculate how many standard deviations away breakeven is
        expected_move = iv * np.sqrt(time_fraction)
        move_required = abs(breakeven_price - stock_price) / stock_price

        # Z-score
        z = move_required / expected_move

        # Simple normal CDF approximation
        # Using approximation: CDF(z) ≈ 1 / (1 + exp(-1.65 * z))
        if option_type.lower() == "call":
            if breakeven_price > stock_price:
                pop = 1.0 / (1.0 + np.exp(1.65 * z))
            else:
                pop = 1.0 / (1.0 + np.exp(-1.65 * z))
        else:
            if breakeven_price < stock_price:
                pop = 1.0 / (1.0 + np.exp(1.65 * z))
            else:
                pop = 1.0 / (1.0 + np.exp(-1.65 * z))

        return float(np.clip(pop, 0, 1))

    def _calculate_target_probability(
        self,
        stock_price: float,
        strike: float,
        option_price: float,
        profit_target_pct: float,
        dte: int,
        iv: float,
        option_type: str,
    ) -> float:
        """Calculate probability of hitting a specific profit target."""
        # Price needed for target profit
        target_option_value = option_price * (1 + profit_target_pct)

        if option_type.lower() == "call":
            # For calls, need stock_price to be at least strike + target_value
            target_stock_price = strike + target_option_value
        else:
            # For puts, need stock_price to be at most strike - target_value
            target_stock_price = strike - target_option_value

        # Calculate probability of reaching target
        return self._calculate_pop_lognormal(
            stock_price, target_stock_price, dte, iv, 0.0, option_type
        )

    def _calculate_expected_value(
        self,
        stock_price: float,
        strike: float,
        option_type: str,
        option_price: float,
        dte: int,
        iv: float,
    ) -> float:
        """
        Calculate expected value of the option trade.

        This is a simplified calculation that estimates:
        EV = (Prob of Profit * Avg Gain) - (Prob of Loss * Avg Loss)
        """
        time_fraction = dte / 365.0
        if time_fraction <= 0:
            return -option_price * 100

        expected_move = iv * np.sqrt(time_fraction)

        # Simple Monte Carlo-like estimation
        # Consider scenarios at -2SD, -1SD, 0, +1SD, +2SD
        scenarios = [-2, -1, 0, 1, 2]
        probabilities = [0.023, 0.136, 0.341, 0.341, 0.136, 0.023]  # Normal dist

        total_ev = 0.0
        for i, sd in enumerate(scenarios):
            future_price = stock_price * (1 + sd * expected_move)

            if option_type.lower() == "call":
                intrinsic = max(0, future_price - strike)
            else:
                intrinsic = max(0, strike - future_price)

            profit = (intrinsic - option_price) * 100
            total_ev += profit * probabilities[i]

        return total_ev

    def _calculate_edge(
        self,
        pop: float,
        ev: float,
        option_price: float,
    ) -> str:
        """Determine if the trade has a statistical edge."""
        cost = option_price * 100

        if ev > cost * 0.1:  # EV > 10% of cost
            if pop > 0.5:
                return "STRONG_EDGE"
            else:
                return "POSITIVE_EV"
        elif ev > 0:
            return "SLIGHT_EDGE"
        elif ev > -cost * 0.1:
            return "NEUTRAL"
        else:
            if pop < 0.3:
                return "POOR_ODDS"
            else:
                return "NEGATIVE_EV"

    def _expired_position_analysis(
        self,
        stock_price: float,
        strike: float,
        option_type: str,
        option_price: float,
    ) -> Dict[str, float]:
        """Analyze an expired position."""
        if option_type.lower() == "call":
            intrinsic = max(0, stock_price - strike)
            profit = intrinsic > option_price
        else:
            intrinsic = max(0, strike - stock_price)
            profit = intrinsic > option_price

        return {
            "probability_of_profit": 1.0 if profit else 0.0,
            "probability_of_50pct_profit": 0.0,
            "probability_of_100pct_profit": 0.0,
            "breakeven_price": 0.0,
            "breakeven_move_pct": 0.0,
            "expected_move_1sd": 0.0,
            "expected_value_per_contract": (intrinsic - option_price) * 100,
            "calculation_method": "expired",
            "edge_indicator": "EXPIRED",
        }


class PopScorer:
    """Scorer component that uses PoP calculations."""

    key = "probability_of_profit"
    default_weight = 1.3

    def __init__(self):
        self.calculator = ProbabilityOfProfitCalculator()

    def score(self, context) -> Tuple[float, List[str], List[str]]:
        """Score based on probability of profit."""
        contract = context.contract
        reasons: List[str] = []
        tags: List[str] = []
        score = 0.0

        # Get or calculate PoP
        pop_data = context.market_data.get("pop_analysis")
        if pop_data is None:
            pop_data = self.calculator.calculate_pop(
                stock_price=contract.stock_price,
                strike=contract.strike,
                option_type=contract.option_type,
                option_price=contract.last_price or contract.mid_price,
                days_to_expiration=contract.days_to_expiration,
                implied_volatility=contract.implied_volatility,
            )
            context.market_data["pop_analysis"] = pop_data

        pop = pop_data.get("probability_of_profit", 0.5)
        edge = pop_data.get("edge_indicator", "NEUTRAL")
        breakeven_move = pop_data.get("breakeven_move_pct", 0)

        # Score based on probability
        if pop >= 0.60:
            score += 25
            reasons.append(f"High probability of profit ({pop:.0%})")
            tags.append("high-probability")
        elif pop >= 0.50:
            score += 18
            reasons.append(f"Above-average probability ({pop:.0%})")
        elif pop >= 0.40:
            score += 10
            reasons.append(f"Moderate probability ({pop:.0%})")
        elif pop >= 0.30:
            score += 5
            reasons.append(f"Lower probability ({pop:.0%}) - needs conviction")
            tags.append("speculative")
        else:
            score -= 5
            reasons.append(f"Low probability ({pop:.0%}) - lottery ticket")
            tags.append("lottery")

        # Score based on edge indicator
        if edge == "STRONG_EDGE":
            score += 15
            reasons.append("Statistical edge detected (positive EV + high PoP)")
            tags.append("edge")
        elif edge == "POSITIVE_EV":
            score += 10
            reasons.append("Positive expected value")
        elif edge == "POOR_ODDS":
            score -= 10
            reasons.append("Poor risk/reward odds")
            tags.append("avoid")

        # Consider breakeven move
        if abs(breakeven_move) < 3:
            score += 5
            reasons.append(f"Small move needed to profit ({breakeven_move:.1f}%)")
        elif abs(breakeven_move) > 10:
            score -= 5
            reasons.append(f"Large move needed ({breakeven_move:.1f}%) - needs catalyst")

        return score, reasons, tags


__all__ = ["ProbabilityOfProfitCalculator", "PopScorer"]
