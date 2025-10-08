"""Risk and expectancy calculations for the Sharp Move scanner."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal, Optional

from scipy.stats import norm


OptionType = Literal["call", "put"]


@dataclass(frozen=True)
class RiskInputs:
    spot: float
    strike: float
    option_type: OptionType
    mid_price: float
    iv: float
    dte_days: float
    risk_free_rate: float


def _time_in_years(dte_days: float) -> float:
    return max(dte_days, 0.0) / 365.0


def expected_move(spot: float, iv: float, dte_days: float) -> float:
    """Return the expected move for the underlying over the option horizon."""

    if spot <= 0 or iv <= 0 or dte_days <= 0:
        return 0.0
    return float(spot * iv * math.sqrt(_time_in_years(dte_days)))


def breakeven_price(strike: float, premium: float, option_type: OptionType) -> float:
    if option_type == "call":
        return float(strike + premium)
    return float(strike - premium)


def probability_of_profit(inputs: RiskInputs, breakeven: float) -> float:
    """Probability that the option finishes in the money relative to breakeven."""

    sigma = max(inputs.iv, 1e-4)
    t = _time_in_years(inputs.dte_days)
    if inputs.spot <= 0 or t <= 0:
        return 0.0

    mu = math.log(inputs.spot) + (inputs.risk_free_rate - 0.5 * sigma**2) * t
    stdev = sigma * math.sqrt(t)
    if stdev <= 0:
        return 0.0

    z = (math.log(max(breakeven, 1e-6)) - mu) / stdev
    if inputs.option_type == "call":
        prob = 1 - norm.cdf(z)
    else:
        prob = norm.cdf(z)
    return float(max(0.0, min(1.0, prob)))


def _black_scholes_d1_d2(inputs: RiskInputs) -> tuple[float, float]:
    t = _time_in_years(inputs.dte_days)
    sigma = max(inputs.iv, 1e-4)
    if inputs.spot <= 0 or inputs.strike <= 0 or t <= 0:
        return 0.0, 0.0
    sqrt_t = math.sqrt(t)
    d1 = (math.log(inputs.spot / inputs.strike) + (inputs.risk_free_rate + 0.5 * sigma**2) * t) / (sigma * sqrt_t)
    d2 = d1 - sigma * sqrt_t
    return d1, d2


def theoretical_price(inputs: RiskInputs) -> float:
    """Black-Scholes fair value ignoring dividends."""

    t = _time_in_years(inputs.dte_days)
    if t <= 0:
        intrinsic = max(0.0, inputs.spot - inputs.strike) if inputs.option_type == "call" else max(0.0, inputs.strike - inputs.spot)
        return intrinsic
    d1, d2 = _black_scholes_d1_d2(inputs)
    if inputs.option_type == "call":
        price = inputs.spot * norm.cdf(d1) - inputs.strike * math.exp(-inputs.risk_free_rate * t) * norm.cdf(d2)
    else:
        price = inputs.strike * math.exp(-inputs.risk_free_rate * t) * norm.cdf(-d2) - inputs.spot * norm.cdf(-d1)
    return float(max(price, 0.0))


def expected_value_per_contract(inputs: RiskInputs, theoretical: Optional[float] = None) -> float:
    """Return the expected value at expiry (per contract, 100x multiplier)."""

    fair_value = theoretical if theoretical is not None else theoretical_price(inputs)
    pnl = (fair_value - inputs.mid_price) * 100.0
    return float(pnl)


def theta_overnight(inputs: RiskInputs) -> float:
    """Approximate one-day theta using Black-Scholes."""

    t = _time_in_years(inputs.dte_days)
    sigma = max(inputs.iv, 1e-4)
    if inputs.spot <= 0 or inputs.strike <= 0 or t <= 0:
        return 0.0
    sqrt_t = math.sqrt(t)
    d1, d2 = _black_scholes_d1_d2(inputs)
    first_term = -(inputs.spot * norm.pdf(d1) * sigma) / (2 * sqrt_t)
    if inputs.option_type == "call":
        second_term = inputs.risk_free_rate * inputs.strike * math.exp(-inputs.risk_free_rate * t) * norm.cdf(d2)
        theta = first_term - second_term
    else:
        second_term = inputs.risk_free_rate * inputs.strike * math.exp(-inputs.risk_free_rate * t) * norm.cdf(-d2)
        theta = first_term + second_term
    return float(theta / 365.0 * 100.0)  # Per contract


__all__ = [
    "OptionType",
    "RiskInputs",
    "expected_move",
    "breakeven_price",
    "probability_of_profit",
    "theoretical_price",
    "expected_value_per_contract",
    "theta_overnight",
]
