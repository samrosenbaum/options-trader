"""Unified probability calculations for options trading.

This module provides a single source of truth for all probability calculations,
replacing the inconsistent methods scattered throughout the codebase.
All calculations are based on the log-normal distribution of stock prices.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import math
import numpy as np
from scipy.stats import norm


@dataclass
class ProbabilityResult:
    """Comprehensive probability analysis for an option position."""
    
    # Core probabilities
    probability_of_profit: float  # P(profitable at expiration)
    probability_itm: float        # P(in-the-money at expiration)
    probability_touch: float      # P(strike will be touched before expiration)
    
    # Scenario analysis
    breakeven_price: float
    required_move_pct: float      # % move needed to breakeven
    current_moneyness: float      # How far ITM/OTM currently
    
    # Risk metrics
    max_loss: float              # Maximum possible loss
    max_gain: float              # Maximum possible gain (for spreads)
    expected_value: float        # Expected P&L
    
    # Metadata
    method: str                  # Calculation method used
    assumptions: Dict[str, float] # Model assumptions
    confidence_interval: Tuple[float, float]  # 95% CI for probability
    

class OptionsProbabilityCalculator:
    """Unified calculator for all option probability metrics."""
    
    def __init__(self, risk_free_rate: float = 0.05):
        """Initialize calculator with market assumptions.
        
        Args:
            risk_free_rate: Risk-free interest rate (default 5%)
        """
        self.risk_free_rate = risk_free_rate
        
    def calculate_comprehensive_probabilities(
        self,
        option_type: str,           # "call" or "put"
        stock_price: float,         # Current stock price
        strike: float,              # Option strike price  
        premium: float,             # Option premium paid
        implied_vol: float,         # Implied volatility (annualized)
        days_to_expiration: int,    # Days until expiration
        dividend_yield: float = 0.0, # Annual dividend yield
        early_exercise: bool = False # Whether American-style (early exercise)
    ) -> ProbabilityResult:
        """Calculate comprehensive probability analysis for an option position.
        
        Returns all relevant probabilities and risk metrics in a single call.
        """
        
        if days_to_expiration <= 0:
            return self._expired_option_result()
            
        if implied_vol <= 0:
            implied_vol = 0.01  # Minimum vol to prevent math errors
            
        # Convert to standard inputs
        T = days_to_expiration / 365.0  # Time to expiration in years
        S = stock_price
        K = strike
        r = self.risk_free_rate
        q = dividend_yield
        sigma = implied_vol
        
        # Calculate breakeven price
        if option_type.lower() == "call":
            breakeven = K + premium
            max_loss = premium
            max_gain = float('inf')  # Unlimited upside for long calls
        else:  # put
            breakeven = K - premium
            max_loss = premium  
            max_gain = K - premium  # Max gain when stock goes to 0
            
        # Calculate required move
        required_move_pct = abs(breakeven - S) / S
        current_moneyness = (S - K) / S  # Positive = ITM for calls
        
        # Core probability calculations using Black-Scholes framework
        prob_profit = self._calculate_probability_of_profit(
            option_type, S, K, premium, sigma, T, r, q
        )
        
        prob_itm = self._calculate_probability_itm(
            option_type, S, K, sigma, T, r, q
        )
        
        prob_touch = self._calculate_probability_touch(
            option_type, S, K, sigma, T, r, q
        ) if not early_exercise else prob_itm * 1.2  # Rough approximation
        
        # Expected value calculation
        expected_value = self._calculate_expected_value(
            option_type, S, K, premium, sigma, T, r, q
        )
        
        # Confidence interval for main probability
        ci_lower, ci_upper = self._calculate_confidence_interval(
            prob_profit, days_to_expiration
        )
        
        return ProbabilityResult(
            probability_of_profit=prob_profit,
            probability_itm=prob_itm,
            probability_touch=prob_touch,
            breakeven_price=breakeven,
            required_move_pct=required_move_pct,
            current_moneyness=current_moneyness,
            max_loss=max_loss,
            max_gain=max_gain,
            expected_value=expected_value,
            method="lognormal_black_scholes",
            assumptions={
                "risk_free_rate": r,
                "dividend_yield": q,
                "implied_volatility": sigma,
                "time_to_expiration_years": T
            },
            confidence_interval=(ci_lower, ci_upper)
        )
    
    def calculate_scenario_probabilities(
        self,
        option_type: str,
        stock_price: float,
        strike: float,
        premium: float,
        implied_vol: float,
        days_to_expiration: int,
        target_moves: List[float] = None  # List of % moves to analyze
    ) -> Dict[str, Dict[str, float]]:
        """Calculate probabilities and returns for multiple price scenarios.
        
        Args:
            target_moves: List of percentage moves to analyze (e.g., [0.05, 0.10, 0.15])
                         If None, uses default set of moves.
        
        Returns:
            Dict mapping move percentages to probability and return data
        """
        
        if target_moves is None:
            target_moves = [0.05, 0.10, 0.15, 0.20, 0.30]  # 5%, 10%, 15%, 20%, 30%
            
        if days_to_expiration <= 0 or implied_vol <= 0:
            return {}
            
        T = days_to_expiration / 365.0
        scenarios = {}
        
        for move_pct in target_moves:
            if option_type.lower() == "call":
                target_price = stock_price * (1 + move_pct)
            else:
                target_price = stock_price * (1 - move_pct)
                
            # Calculate probability of reaching this price
            prob_reach = self._calculate_probability_reach_price(
                stock_price, target_price, implied_vol, T, self.risk_free_rate
            )
            
            # Calculate option value at target price (intrinsic value only at expiration)
            if option_type.lower() == "call":
                intrinsic_value = max(0, target_price - strike)
            else:
                intrinsic_value = max(0, strike - target_price)
                
            # Profit/loss calculation
            profit_loss = intrinsic_value - premium
            roi_pct = (profit_loss / premium) * 100 if premium > 0 else 0
            
            # Annualized return
            if days_to_expiration > 0:
                annualized_roi = roi_pct * (365 / days_to_expiration)
            else:
                annualized_roi = 0
                
            scenarios[f"{move_pct:.1%}_move"] = {
                "target_price": target_price,
                "probability": prob_reach,
                "intrinsic_value": intrinsic_value,
                "profit_loss": profit_loss,
                "roi_percent": roi_pct,
                "annualized_roi": annualized_roi
            }
            
        return scenarios
        
    def _calculate_probability_of_profit(
        self,
        option_type: str,
        S: float, K: float, premium: float,
        sigma: float, T: float, r: float, q: float
    ) -> float:
        """Calculate probability of being profitable at expiration."""
        
        if option_type.lower() == "call":
            breakeven = K + premium
            # P(S_T >= breakeven)
            d2 = (math.log(S / breakeven) + (r - q - 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
            return float(norm.cdf(d2))
        else:
            breakeven = K - premium  
            # P(S_T <= breakeven)
            d2 = (math.log(S / breakeven) + (r - q - 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
            return float(norm.cdf(-d2))
    
    def _calculate_probability_itm(
        self,
        option_type: str,
        S: float, K: float,
        sigma: float, T: float, r: float, q: float
    ) -> float:
        """Calculate probability of being in-the-money at expiration."""
        
        d2 = (math.log(S / K) + (r - q - 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
        
        if option_type.lower() == "call":
            return float(norm.cdf(d2))  # P(S_T >= K)
        else:
            return float(norm.cdf(-d2))  # P(S_T <= K)
    
    def _calculate_probability_touch(
        self,
        option_type: str,
        S: float, K: float,
        sigma: float, T: float, r: float, q: float
    ) -> float:
        """Calculate probability that strike will be touched before expiration.
        
        Uses the reflection principle for barrier options.
        """
        
        # Probability of touching barrier before expiration
        # This is higher than probability of ending ITM
        if S == K:
            return 0.5  # Already at the strike
            
        # Drift-adjusted process
        mu = r - q - 0.5 * sigma**2
        
        # Probability of ever touching the barrier
        if option_type.lower() == "call" and K > S:
            # Need to go up to touch strike
            lambda_param = (mu + sigma**2) / sigma**2
            prob_touch = (K / S) ** (lambda_param - 1)
        elif option_type.lower() == "put" and K < S:
            # Need to go down to touch strike  
            lambda_param = (mu + sigma**2) / sigma**2
            prob_touch = (K / S) ** (lambda_param - 1)
        else:
            # Already ITM or at the strike
            prob_touch = 1.0
            
        return float(min(1.0, max(0.0, prob_touch)))
    
    def _calculate_probability_reach_price(
        self,
        current_price: float,
        target_price: float, 
        vol: float,
        time_years: float,
        risk_free_rate: float
    ) -> float:
        """Calculate probability of reaching a specific price level."""
        
        if current_price <= 0 or target_price <= 0 or time_years <= 0:
            return 0.0
            
        if current_price == target_price:
            return 1.0
            
        # Log-normal distribution parameters
        mu = math.log(current_price) + (risk_free_rate - 0.5 * vol**2) * time_years
        sigma_t = vol * math.sqrt(time_years)
        
        # Probability of S_T >= target_price (for upward moves) or S_T <= target_price (for downward moves)
        z = (math.log(target_price) - mu) / sigma_t
        
        if target_price > current_price:
            # Upward move - P(S_T >= target)
            return float(1 - norm.cdf(z))
        else:
            # Downward move - P(S_T <= target)  
            return float(norm.cdf(z))
    
    def _calculate_expected_value(
        self,
        option_type: str,
        S: float, K: float, premium: float,
        sigma: float, T: float, r: float, q: float
    ) -> float:
        """Calculate expected profit/loss of the position."""
        
        # Use Monte Carlo integration for more accurate expected value
        # This accounts for the full distribution, not just binary outcomes
        
        # Generate price scenarios using geometric Brownian motion
        n_scenarios = 1000
        dt = T
        
        # Generate random price paths
        z = np.random.standard_normal(n_scenarios)
        final_prices = S * np.exp((r - q - 0.5 * sigma**2) * T + sigma * math.sqrt(T) * z)
        
        # Calculate payoffs for each scenario
        if option_type.lower() == "call":
            payoffs = np.maximum(0, final_prices - K) - premium
        else:
            payoffs = np.maximum(0, K - final_prices) - premium
            
        # Expected value is mean of all scenario payoffs
        return float(np.mean(payoffs))
    
    def _calculate_confidence_interval(
        self,
        probability: float,
        days_to_expiration: int
    ) -> Tuple[float, float]:
        """Calculate 95% confidence interval for probability estimate.
        
        Accounts for model uncertainty and time to expiration.
        """
        
        # Confidence intervals get wider with longer time horizons
        # and for probabilities near 0.5 (maximum uncertainty)
        
        # Base uncertainty (higher for longer expirations)
        time_factor = min(1.0, days_to_expiration / 30.0)  # Normalize to 30 days
        base_uncertainty = 0.05 + 0.10 * time_factor
        
        # Probability uncertainty (highest at 0.5, lowest at extremes)
        prob_uncertainty = 4 * probability * (1 - probability) * base_uncertainty
        
        # 95% confidence interval (approximately 2 standard deviations)
        margin = 1.96 * math.sqrt(prob_uncertainty)
        
        lower = max(0.0, probability - margin)
        upper = min(1.0, probability + margin)
        
        return (lower, upper)
    
    def _expired_option_result(self) -> ProbabilityResult:
        """Return result for expired options."""
        return ProbabilityResult(
            probability_of_profit=0.0,
            probability_itm=0.0,
            probability_touch=0.0,
            breakeven_price=0.0,
            required_move_pct=0.0,
            current_moneyness=0.0,
            max_loss=0.0,
            max_gain=0.0,
            expected_value=0.0,
            method="expired",
            assumptions={},
            confidence_interval=(0.0, 0.0)
        )


class ProbabilityCalibrator:
    """Calibrate probability models against historical outcomes."""
    
    def __init__(self):
        self.historical_data = []
        
    def add_historical_outcome(
        self,
        predicted_probability: float,
        actual_outcome: bool,  # True if profitable, False if loss
        days_held: int,
        option_type: str,
        metadata: Dict[str, float] = None
    ) -> None:
        """Add a historical outcome for model calibration."""
        
        self.historical_data.append({
            'predicted_prob': predicted_probability,
            'actual_outcome': actual_outcome,
            'days_held': days_held,
            'option_type': option_type,
            'metadata': metadata or {}
        })
    
    def calculate_calibration_metrics(self) -> Dict[str, float]:
        """Calculate model calibration metrics."""
        
        if not self.historical_data:
            return {}
            
        # Convert to arrays for analysis
        predictions = np.array([d['predicted_prob'] for d in self.historical_data])
        outcomes = np.array([float(d['actual_outcome']) for d in self.historical_data])
        
        # Overall accuracy
        mean_prediction = np.mean(predictions)
        mean_outcome = np.mean(outcomes)
        
        # Calibration by probability bins
        bins = np.linspace(0, 1, 11)  # 10 bins
        bin_centers = (bins[:-1] + bins[1:]) / 2
        
        calibration_error = 0.0
        reliability = []
        
        for i in range(len(bins) - 1):
            mask = (predictions >= bins[i]) & (predictions < bins[i+1])
            if np.sum(mask) > 0:
                bin_pred = np.mean(predictions[mask])
                bin_outcome = np.mean(outcomes[mask])
                bin_count = np.sum(mask)
                
                calibration_error += bin_count * (bin_pred - bin_outcome)**2
                reliability.append({
                    'bin_center': bin_centers[i],
                    'predicted': bin_pred,
                    'actual': bin_outcome,
                    'count': bin_count
                })
        
        calibration_error = math.sqrt(calibration_error / len(self.historical_data))
        
        # Brier score (lower is better)
        brier_score = np.mean((predictions - outcomes)**2)
        
        return {
            'total_trades': len(self.historical_data),
            'mean_predicted_prob': mean_prediction,
            'actual_win_rate': mean_outcome,
            'calibration_error': calibration_error,
            'brier_score': brier_score,
            'reliability_by_bin': reliability
        }
    
    def suggest_calibration_adjustment(self) -> float:
        """Suggest a calibration multiplier for future predictions."""
        
        metrics = self.calculate_calibration_metrics()
        if not metrics:
            return 1.0
            
        # If model consistently over-predicts, suggest lower multiplier
        # If model consistently under-predicts, suggest higher multiplier
        predicted = metrics['mean_predicted_prob'] 
        actual = metrics['actual_win_rate']
        
        if predicted > 0:
            return actual / predicted
        else:
            return 1.0


# Alias for easier imports
ProbabilityCalculator = OptionsProbabilityCalculator

__all__ = [
    "ProbabilityResult",
    "OptionsProbabilityCalculator",
    "ProbabilityCalculator",  # Alias
    "ProbabilityCalibrator"
]