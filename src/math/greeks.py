"""Unified Greeks calculations using Black-Scholes-Merton model.

This module provides a single, validated implementation of all option Greeks
calculations, replacing the inconsistent implementations throughout the codebase.
All calculations are based on the Black-Scholes-Merton model with dividends.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional
import math
import numpy as np
from scipy.stats import norm


@dataclass 
class OptionGreeks:
    """Complete set of option Greeks with metadata."""
    
    # Primary Greeks
    delta: float    # Price sensitivity (dV/dS)
    gamma: float    # Delta sensitivity (d²V/dS²) 
    theta: float    # Time decay (dV/dt) - per day
    vega: float     # Volatility sensitivity (dV/dσ) - per 1% vol change
    rho: float      # Interest rate sensitivity (dV/dr) - per 1% rate change
    
    # Advanced Greeks
    charm: float    # Delta decay (dΔ/dt) - how delta changes over time
    color: float    # Gamma decay (dΓ/dt) - how gamma changes over time
    speed: float    # Gamma sensitivity (dΓ/dS) - third derivative
    zomma: float    # Gamma sensitivity to vol (dΓ/dσ)
    ultima: float   # Vega sensitivity to vol (d²V/dσ²)
    
    # Risk metrics
    lambda_: float  # Leverage (% option price change / % stock change)
    epsilon: float  # Dividend sensitivity (dV/dq)
    
    # Metadata
    inputs: Dict[str, float]
    calculation_method: str
    warning_flags: list[str]


class BlackScholesGreeksCalculator:
    """Production-grade Greeks calculator using Black-Scholes-Merton model."""
    
    def __init__(self, risk_free_rate: float = 0.05):
        """Initialize calculator with market parameters.
        
        Args:
            risk_free_rate: Risk-free interest rate (annualized)
        """
        self.risk_free_rate = risk_free_rate
        
    def calculate_all_greeks(
        self,
        option_type: str,           # "call" or "put"
        stock_price: float,         # Current stock price (S)
        strike_price: float,        # Strike price (K)
        time_to_expiration: float,  # Time to expiration in years (T)
        volatility: float,          # Implied volatility (σ)
        dividend_yield: float = 0.0,  # Annual dividend yield (q)
        risk_free_rate: Optional[float] = None  # Override default rate
    ) -> OptionGreeks:
        """Calculate complete set of option Greeks.
        
        Args:
            option_type: "call" or "put"
            stock_price: Current underlying price
            strike_price: Option strike price
            time_to_expiration: Time to expiration in years
            volatility: Implied volatility (annualized)
            dividend_yield: Annual dividend yield  
            risk_free_rate: Risk-free rate (overrides default if provided)
            
        Returns:
            OptionGreeks object with all calculated Greeks and metadata
        """
        
        # Input validation
        warnings = self._validate_inputs(
            option_type, stock_price, strike_price, 
            time_to_expiration, volatility, dividend_yield
        )
        
        # Use provided rate or default
        r = risk_free_rate if risk_free_rate is not None else self.risk_free_rate
        
        # Handle edge cases
        if time_to_expiration <= 0:
            return self._expired_greeks(option_type, stock_price, strike_price, warnings)
            
        if volatility <= 0:
            volatility = 0.01  # Minimum vol to prevent division by zero
            warnings.append("Volatility was zero or negative, using 0.01")
            
        # Standard Black-Scholes parameters
        S = stock_price
        K = strike_price  
        T = time_to_expiration
        sigma = volatility
        q = dividend_yield
        
        # Calculate d1 and d2
        sqrt_T = math.sqrt(T)
        d1 = (math.log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * sqrt_T)
        d2 = d1 - sigma * sqrt_T
        
        # Standard normal PDF and CDF values
        N_d1 = norm.cdf(d1)
        N_d2 = norm.cdf(d2)
        N_neg_d1 = norm.cdf(-d1)
        N_neg_d2 = norm.cdf(-d2)
        n_d1 = norm.pdf(d1)  # PDF is same for d1 and -d1
        
        # Discount factors
        exp_neg_qT = math.exp(-q * T)
        exp_neg_rT = math.exp(-r * T)
        
        # Calculate primary Greeks
        if option_type.lower() == "call":
            delta = exp_neg_qT * N_d1
            rho = K * T * exp_neg_rT * N_d2
        else:  # put
            delta = -exp_neg_qT * N_neg_d1
            rho = -K * T * exp_neg_rT * N_neg_d2
            
        # Greeks common to calls and puts
        gamma = exp_neg_qT * n_d1 / (S * sigma * sqrt_T)
        vega = S * exp_neg_qT * n_d1 * sqrt_T / 100  # Per 1% vol change
        rho = rho / 100  # Per 1% rate change
        
        # Theta calculation (per day)
        theta_term1 = -(S * n_d1 * sigma * exp_neg_qT) / (2 * sqrt_T)
        theta_term2 = q * S * exp_neg_qT * (N_d1 if option_type.lower() == "call" else N_neg_d1)
        theta_term3 = r * K * exp_neg_rT * (N_d2 if option_type.lower() == "call" else N_neg_d2)
        
        if option_type.lower() == "call":
            theta = (theta_term1 - theta_term2 - theta_term3) / 365  # Per day
        else:
            theta = (theta_term1 + theta_term2 + theta_term3) / 365  # Per day
            
        # Advanced Greeks
        charm = self._calculate_charm(
            option_type, S, K, T, sigma, r, q, d1, d2, sqrt_T, exp_neg_qT, n_d1
        )
        
        color = self._calculate_color(
            S, T, sigma, r, q, d1, d2, sqrt_T, exp_neg_qT, n_d1
        )
        
        speed = self._calculate_speed(
            S, T, sigma, r, q, d1, sqrt_T, exp_neg_qT, n_d1, gamma
        )
        
        zomma = self._calculate_zomma(
            S, T, sigma, d1, d2, sqrt_T, exp_neg_qT, n_d1, gamma
        )
        
        ultima = self._calculate_ultima(
            S, T, sigma, d1, d2, sqrt_T, exp_neg_qT, n_d1
        )
        
        # Risk metrics
        option_price = self._calculate_option_price(
            option_type, S, K, T, sigma, r, q, N_d1, N_d2, N_neg_d1, N_neg_d2, exp_neg_rT
        )
        
        lambda_ = delta * S / option_price if option_price != 0 else 0
        epsilon = -S * T * exp_neg_qT * (N_d1 if option_type.lower() == "call" else N_neg_d1) / 100
        
        # Store calculation inputs
        inputs = {
            "stock_price": S,
            "strike_price": K, 
            "time_to_expiration": T,
            "volatility": sigma,
            "risk_free_rate": r,
            "dividend_yield": q,
            "d1": d1,
            "d2": d2,
            "option_price": option_price
        }
        
        return OptionGreeks(
            delta=round(delta, 6),
            gamma=round(gamma, 8),
            theta=round(theta, 6),
            vega=round(vega, 6),
            rho=round(rho, 6),
            charm=round(charm, 8),
            color=round(color, 10),
            speed=round(speed, 10),
            zomma=round(zomma, 8),
            ultima=round(ultima, 8),
            lambda_=round(lambda_, 4),
            epsilon=round(epsilon, 6),
            inputs=inputs,
            calculation_method="black_scholes_merton",
            warning_flags=warnings
        )
    
    def _validate_inputs(
        self,
        option_type: str,
        stock_price: float,
        strike_price: float,
        time_to_expiration: float,
        volatility: float,
        dividend_yield: float
    ) -> list[str]:
        """Validate input parameters and return warning flags."""
        
        warnings = []
        
        if option_type.lower() not in ["call", "put"]:
            warnings.append(f"Invalid option type: {option_type}, defaulting to call")
            
        if stock_price <= 0:
            warnings.append(f"Stock price should be positive: {stock_price}")
            
        if strike_price <= 0:
            warnings.append(f"Strike price should be positive: {strike_price}")
            
        if time_to_expiration < 0:
            warnings.append(f"Time to expiration is negative: {time_to_expiration}")
            
        if volatility < 0:
            warnings.append(f"Volatility should be non-negative: {volatility}")
            
        if volatility > 5.0:  # 500% vol is suspicious
            warnings.append(f"Extremely high volatility: {volatility:.1%}")
            
        if dividend_yield < 0:
            warnings.append(f"Dividend yield should be non-negative: {dividend_yield}")
            
        if dividend_yield > 0.5:  # 50% dividend yield is suspicious
            warnings.append(f"Extremely high dividend yield: {dividend_yield:.1%}")
            
        return warnings
    
    def _calculate_charm(
        self, option_type: str, S: float, K: float, T: float, sigma: float,
        r: float, q: float, d1: float, d2: float, sqrt_T: float, 
        exp_neg_qT: float, n_d1: float
    ) -> float:
        """Calculate charm (delta decay): dΔ/dt"""
        
        term1 = q * exp_neg_qT * norm.cdf(d1 if option_type.lower() == "call" else -d1)
        term2 = (exp_neg_qT * n_d1 * (2 * (r - q) * T - d2 * sigma * sqrt_T)) / (2 * T * sigma * sqrt_T)
        
        if option_type.lower() == "call":
            return -(term1 + term2) / 365  # Per day
        else:
            return (term1 - term2) / 365  # Per day
    
    def _calculate_color(
        self, S: float, T: float, sigma: float, r: float, q: float,
        d1: float, d2: float, sqrt_T: float, exp_neg_qT: float, n_d1: float
    ) -> float:
        """Calculate color (gamma decay): dΓ/dt"""
        
        term1 = 2 * q * T
        term2 = 1
        term3 = (2 * (r - q) * T - d2 * sigma * sqrt_T) * d1 / (sigma * sqrt_T)
        
        return -(exp_neg_qT * n_d1 * (term1 + term2 + term3)) / (2 * S * T * sigma * sqrt_T * 365)
    
    def _calculate_speed(
        self, S: float, T: float, sigma: float, r: float, q: float,
        d1: float, sqrt_T: float, exp_neg_qT: float, n_d1: float, gamma: float
    ) -> float:
        """Calculate speed (gamma sensitivity): dΓ/dS"""
        
        return -gamma / S * (1 + d1 / (sigma * sqrt_T))
    
    def _calculate_zomma(
        self, S: float, T: float, sigma: float, d1: float, d2: float,
        sqrt_T: float, exp_neg_qT: float, n_d1: float, gamma: float
    ) -> float:
        """Calculate zomma (gamma sensitivity to vol): dΓ/dσ"""
        
        return gamma * (d1 * d2 - 1) / sigma
    
    def _calculate_ultima(
        self, S: float, T: float, sigma: float, d1: float, d2: float,
        sqrt_T: float, exp_neg_qT: float, n_d1: float
    ) -> float:
        """Calculate ultima (vega sensitivity to vol): d²V/dσ²"""
        
        vega_base = S * exp_neg_qT * n_d1 * sqrt_T
        return -vega_base * (d1 * d2) / (sigma**2 * 100)
    
    def _calculate_option_price(
        self, option_type: str, S: float, K: float, T: float, sigma: float,
        r: float, q: float, N_d1: float, N_d2: float, N_neg_d1: float,
        N_neg_d2: float, exp_neg_rT: float
    ) -> float:
        """Calculate theoretical option price using Black-Scholes."""
        
        exp_neg_qT = math.exp(-q * T)
        
        if option_type.lower() == "call":
            return S * exp_neg_qT * N_d1 - K * exp_neg_rT * N_d2
        else:
            return K * exp_neg_rT * N_neg_d2 - S * exp_neg_qT * N_neg_d1
    
    def _expired_greeks(
        self, option_type: str, stock_price: float, 
        strike_price: float, warnings: list[str]
    ) -> OptionGreeks:
        """Return Greeks for expired options."""
        
        warnings.append("Option has expired - all Greeks are zero")
        
        # For expired options, only delta matters (1 if ITM, 0 if OTM)
        if option_type.lower() == "call":
            delta = 1.0 if stock_price > strike_price else 0.0
        else:
            delta = -1.0 if stock_price < strike_price else 0.0
            
        inputs = {
            "stock_price": stock_price,
            "strike_price": strike_price,
            "time_to_expiration": 0.0,
            "volatility": 0.0,
            "risk_free_rate": self.risk_free_rate,
            "dividend_yield": 0.0,
            "d1": 0.0,
            "d2": 0.0,
            "option_price": max(0, stock_price - strike_price) if option_type.lower() == "call" 
                           else max(0, strike_price - stock_price)
        }
        
        return OptionGreeks(
            delta=delta,
            gamma=0.0,
            theta=0.0,
            vega=0.0,
            rho=0.0,
            charm=0.0,
            color=0.0,
            speed=0.0,
            zomma=0.0,
            ultima=0.0,
            lambda_=0.0,
            epsilon=0.0,
            inputs=inputs,
            calculation_method="expired",
            warning_flags=warnings
        )


class GreeksValidator:
    """Validate Greeks calculations against known benchmarks."""
    
    @staticmethod
    def validate_greeks(greeks: OptionGreeks, tolerance: float = 0.01) -> Dict[str, bool]:
        """Validate Greeks against theoretical bounds and relationships.
        
        Args:
            greeks: Calculated Greeks to validate
            tolerance: Acceptable tolerance for validation checks
            
        Returns:
            Dict mapping validation checks to pass/fail status
        """
        
        validations = {}
        inputs = greeks.inputs
        option_type = "call" if greeks.delta >= 0 else "put"  # Infer from delta sign
        
        # Delta bounds: 0 ≤ |Δ| ≤ 1
        validations["delta_bounds"] = 0 <= abs(greeks.delta) <= 1 + tolerance
        
        # Gamma non-negative
        validations["gamma_positive"] = greeks.gamma >= -tolerance
        
        # Theta typically negative for long positions (time decay)
        # Allow some tolerance for deep ITM options
        validations["theta_negative"] = greeks.theta <= tolerance
        
        # Vega non-negative (volatility increases option value)
        validations["vega_positive"] = greeks.vega >= -tolerance
        
        # Put-Call parity relationships
        if inputs.get("time_to_expiration", 0) > 0:
            S = inputs.get("stock_price", 0)
            K = inputs.get("strike_price", 0)
            
            if S > 0 and K > 0:
                # For ATM options, call and put deltas should sum to ±1
                if abs(S - K) / S < 0.05:  # Within 5% of ATM
                    if option_type == "call":
                        expected_put_delta = greeks.delta - math.exp(-inputs.get("dividend_yield", 0) * inputs["time_to_expiration"])
                        validations["put_call_delta"] = abs(expected_put_delta + 1) < tolerance
                
                # Greeks relationships
                # Charm and color should have reasonable magnitudes
                validations["charm_reasonable"] = abs(greeks.charm) < abs(greeks.delta) * 10
                validations["color_reasonable"] = abs(greeks.color) < abs(greeks.gamma) * 10
        
        return validations
    
    @staticmethod  
    def compare_with_market_greeks(
        calculated: OptionGreeks, 
        market_greeks: Dict[str, float],
        tolerance: Dict[str, float] = None
    ) -> Dict[str, Dict[str, float]]:
        """Compare calculated Greeks with market-provided Greeks.
        
        Args:
            calculated: Our calculated Greeks
            market_greeks: Market-provided Greeks (e.g., from broker)
            tolerance: Tolerance levels for each Greek
            
        Returns:
            Comparison results with differences and pass/fail status
        """
        
        if tolerance is None:
            tolerance = {
                "delta": 0.05,    # 5% tolerance
                "gamma": 0.10,    # 10% tolerance  
                "theta": 0.15,    # 15% tolerance
                "vega": 0.10,     # 10% tolerance
                "rho": 0.20       # 20% tolerance
            }
        
        comparison = {}
        
        for greek_name in ["delta", "gamma", "theta", "vega", "rho"]:
            if greek_name in market_greeks:
                calculated_value = getattr(calculated, greek_name)
                market_value = market_greeks[greek_name]
                
                if market_value != 0:
                    relative_diff = abs(calculated_value - market_value) / abs(market_value)
                else:
                    relative_diff = abs(calculated_value)
                    
                comparison[greek_name] = {
                    "calculated": calculated_value,
                    "market": market_value,
                    "absolute_diff": calculated_value - market_value,
                    "relative_diff": relative_diff,
                    "tolerance": tolerance.get(greek_name, 0.15),
                    "passes": relative_diff <= tolerance.get(greek_name, 0.15)
                }
        
        return comparison


# Alias for easier imports
GreeksCalculator = BlackScholesGreeksCalculator

__all__ = [
    "OptionGreeks",
    "BlackScholesGreeksCalculator",
    "GreeksCalculator",  # Alias
    "GreeksValidator"
]