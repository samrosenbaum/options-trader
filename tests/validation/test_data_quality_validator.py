from datetime import datetime, timedelta

import pytest

from src.validation.data_quality import OptionsDataQualityValidator


class AlwaysOpenValidator(OptionsDataQualityValidator):
    """Test helper that forces market hours to True."""

    def _is_market_hours(self) -> bool:  # noqa: D401
        return True


def _base_opportunity() -> dict:
    future_date = (datetime.utcnow() + timedelta(days=7)).date().isoformat()
    return {
        "symbol": "TEST",
        "strike": 100.0,
        "type": "call",
        "expiration": future_date,
        "stockPrice": 95.0,
        "bid": 1.0,
        "ask": 1.2,
        "lastPrice": 1.1,
        "volume": 20,
        "openInterest": 40,
        "impliedVolatility": 0.4,
    }


def test_validator_flags_critical_stale_stock_price():
    validator = AlwaysOpenValidator(max_price_age_minutes=15)
    opportunity = _base_opportunity()
    opportunity["_price_age_seconds"] = 3600 * 2  # 120 minutes, critical

    report = validator.validate_opportunity(opportunity)

    assert any(issue.field == "_price_age_seconds" for issue in report.issues)
    assert report.score < 100


def test_validator_detects_inconsistent_prices_and_liquidity():
    validator = AlwaysOpenValidator()
    opportunity = _base_opportunity()
    opportunity.update({
        "lastPrice": 5.0,  # inconsistent with bid/ask
        "volume": 0,  # zero volume while market open
        "openInterest": 0,
    })

    report = validator.validate_opportunity(opportunity)

    assert any(issue.field == "volume" for issue in report.issues)
    # Inconsistent last price should be captured as a warning
    assert any(warning.field == "lastPrice" for warning in report.warnings)


@pytest.mark.parametrize("price_age_seconds, expected_severity", [(900, "warning"), (4000, "critical")])
def test_validator_price_age_severity(price_age_seconds, expected_severity):
    validator = AlwaysOpenValidator(max_price_age_minutes=10)
    opportunity = _base_opportunity()
    opportunity["_price_age_seconds"] = price_age_seconds

    report = validator.validate_opportunity(opportunity)

    if expected_severity == "critical":
        assert any(issue.field == "_price_age_seconds" for issue in report.issues)
    else:
        assert any(warning.field == "_price_age_seconds" for warning in report.warnings)
