import math

import numpy as np

from src.math.probability import OptionsProbabilityCalculator


def test_comprehensive_probabilities_match_black_scholes_reference():
    calc = OptionsProbabilityCalculator(risk_free_rate=0.02)

    np.random.seed(123)
    result = calc.calculate_comprehensive_probabilities(
        option_type="call",
        stock_price=100.0,
        strike=105.0,
        premium=5.0,
        implied_vol=0.25,
        days_to_expiration=182,
    )

    assert math.isclose(result.probability_of_profit, 0.2837720789, rel_tol=1e-6)
    assert math.isclose(result.probability_itm, 0.3789826171, rel_tol=1e-6)
    assert math.isclose(result.probability_touch, 0.9912562216, rel_tol=1e-6)
    assert math.isclose(result.breakeven_price, 110.0, rel_tol=1e-12)
    assert math.isclose(result.required_move_pct, 0.1, rel_tol=1e-12)
    assert math.isclose(result.current_moneyness, -0.05, rel_tol=1e-12)
    assert math.isclose(result.max_loss, 5.0, rel_tol=1e-12)
    assert math.isinf(result.max_gain)
    assert math.isclose(result.expected_value, 0.1227909276, rel_tol=1e-6)

    assert result.method == "lognormal_black_scholes"
    assert math.isclose(result.assumptions["risk_free_rate"], 0.02, rel_tol=1e-12)
    assert math.isclose(result.assumptions["implied_volatility"], 0.25, rel_tol=1e-12)
    assert math.isclose(result.assumptions["time_to_expiration_years"], 182 / 365.0, rel_tol=1e-9)
    assert result.confidence_interval[0] == 0.0
    assert math.isclose(result.confidence_interval[1], 0.9682227460, rel_tol=1e-6)


def test_put_probability_outputs_are_consistent():
    calc = OptionsProbabilityCalculator(risk_free_rate=0.02)

    np.random.seed(321)
    result = calc.calculate_comprehensive_probabilities(
        option_type="put",
        stock_price=100.0,
        strike=95.0,
        premium=4.0,
        implied_vol=0.2,
        days_to_expiration=90,
    )

    # Verify breakeven and moneyness directions for puts
    assert math.isclose(result.breakeven_price, 91.0, rel_tol=1e-12)
    assert math.isclose(result.required_move_pct, 0.09, rel_tol=1e-12)
    assert math.isclose(result.current_moneyness, 0.05, rel_tol=1e-12)

    # Probability of profit should be less than ITM probability because breakeven is below the strike
    assert result.probability_of_profit <= result.probability_itm
    assert 0.0 <= result.probability_of_profit <= 1.0
    assert 0.0 <= result.probability_itm <= 1.0
    assert 0.0 <= result.probability_touch <= 1.0

    assert result.max_gain == 91.0
    assert math.isclose(result.max_loss, 4.0, rel_tol=1e-12)
    assert result.method == "lognormal_black_scholes"
