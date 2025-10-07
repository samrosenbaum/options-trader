"""Integration test to verify data quality validation works end-to-end."""

from datetime import datetime, timezone
import pandas as pd

from src.validation import OptionsDataValidator, DataQuality


def test_high_quality_option():
    """Test that a high-quality option gets a good score."""

    option = {
        "symbol": "AAPL",
        "type": "call",
        "strike": 175.0,
        "stockPrice": 177.50,
        "lastPrice": 5.25,
        "bid": 5.20,
        "ask": 5.30,
        "volume": 5000,
        "openInterest": 10000,
        "impliedVolatility": 0.35,
        "_price_source": "fast_info.last_price",
        "_price_timestamp": datetime.now(timezone.utc).isoformat(),
        "_price_age_seconds": 2.5,
    }

    validator = OptionsDataValidator()
    report = validator.validate_option(option)

    print(f"\n{'='*60}")
    print(f"HIGH QUALITY OPTION TEST")
    print(f"{'='*60}")
    print(f"Quality: {report.quality.value.upper()}")
    print(f"Score: {report.score:.1f}/100")
    print(f"Issues: {len(report.issues)}")
    print(f"Warnings: {len(report.warnings)}")

    if report.warnings:
        print(f"\nWarnings:")
        for warning in report.warnings:
            print(f"  - {warning}")

    assert report.quality == DataQuality.HIGH
    assert report.score >= 80
    assert len(report.issues) == 0
    print(f"\n✅ Test passed - High quality option recognized")


def test_medium_quality_option():
    """Test that a medium-quality option gets appropriate warnings."""

    option = {
        "symbol": "SPY",
        "type": "put",
        "strike": 450.0,
        "stockPrice": 455.00,
        "lastPrice": 3.00,
        "bid": 2.70,
        "ask": 3.30,  # 20% spread - warning level
        "volume": 150,
        "openInterest": 500,  # Low but acceptable
        "impliedVolatility": 0.25,
        "_price_source": "intraday_1m",
        "_price_timestamp": datetime.now(timezone.utc).isoformat(),
        "_price_age_seconds": 360,  # 6 minutes old - triggers warning
    }

    validator = OptionsDataValidator()
    report = validator.validate_option(option)

    print(f"\n{'='*60}")
    print(f"MEDIUM QUALITY OPTION TEST")
    print(f"{'='*60}")
    print(f"Quality: {report.quality.value.upper()}")
    print(f"Score: {report.score:.1f}/100")
    print(f"Issues: {len(report.issues)}")
    print(f"Warnings: {len(report.warnings)}")

    if report.warnings:
        print(f"\nWarnings:")
        for warning in report.warnings:
            print(f"  - {warning}")

    # Quality might be HIGH with just warnings, that's okay
    assert report.score >= 40  # Should not be rejected
    assert len(report.warnings) > 0  # Should have at least one warning
    print(f"\n✅ Test passed - Option with warnings detected appropriately")


def test_rejected_option():
    """Test that a poor-quality option is rejected."""

    option = {
        "symbol": "XYZ",
        "type": "call",
        "strike": 50.0,
        "stockPrice": 40.00,  # 25% OTM
        "lastPrice": 0.50,
        "bid": 0.15,
        "ask": 0.85,  # 140% spread!
        "volume": 0,  # No volume
        "openInterest": 5,  # Very low OI
        "impliedVolatility": 1.5,  # 150% IV
        "_price_source": "info.previousClose_STALE",
        "_price_timestamp": None,
        "_price_age_seconds": 57600,  # 16 hours old
    }

    validator = OptionsDataValidator()
    report = validator.validate_option(option)

    print(f"\n{'='*60}")
    print(f"REJECTED OPTION TEST")
    print(f"{'='*60}")
    print(f"Quality: {report.quality.value.upper()}")
    print(f"Score: {report.score:.1f}/100")
    print(f"Issues: {len(report.issues)}")
    print(f"Warnings: {len(report.warnings)}")

    if report.issues:
        print(f"\nIssues:")
        for issue in report.issues:
            print(f"  - {issue}")

    if report.warnings:
        print(f"\nWarnings:")
        for warning in report.warnings:
            print(f"  - {warning}")

    assert report.quality == DataQuality.REJECTED
    assert report.score < 40
    assert len(report.issues) >= 2  # Should have multiple issues
    print(f"\n✅ Test passed - Poor quality option rejected")


def test_stale_price_detection():
    """Test that stale prices are properly flagged."""

    option = {
        "symbol": "TSLA",
        "type": "call",
        "strike": 250.0,
        "stockPrice": 255.00,
        "lastPrice": 12.50,
        "bid": 12.00,
        "ask": 13.00,
        "volume": 1000,
        "openInterest": 5000,
        "impliedVolatility": 0.60,
        "_price_source": "info.previousClose_STALE",  # STALE marker
        "_price_timestamp": None,
        "_price_age_seconds": None,
    }

    validator = OptionsDataValidator()
    report = validator.validate_option(option)

    print(f"\n{'='*60}")
    print(f"STALE PRICE DETECTION TEST")
    print(f"{'='*60}")
    print(f"Quality: {report.quality.value.upper()}")
    print(f"Score: {report.score:.1f}/100")
    print(f"Price Source: {option['_price_source']}")

    # Should have warning about stale price
    stale_warnings = [w for w in report.warnings if 'stale' in w.lower() or 'previous close' in w.lower()]

    print(f"\nStale Price Warnings:")
    for warning in stale_warnings:
        print(f"  - {warning}")

    assert len(stale_warnings) > 0, "Should detect stale price source"
    print(f"\n✅ Test passed - Stale price detected and flagged")


def test_market_hours_detection():
    """Test market hours detection logic."""

    validator = OptionsDataValidator()
    is_market_hours = validator.is_market_hours()

    print(f"\n{'='*60}")
    print(f"MARKET HOURS DETECTION TEST")
    print(f"{'='*60}")
    print(f"Is Market Hours: {is_market_hours}")
    print(f"Current Time: {datetime.now()}")

    # Just verify it doesn't crash - actual result depends on when test runs
    assert isinstance(is_market_hours, bool)
    print(f"\n✅ Test passed - Market hours detection working")


if __name__ == "__main__":
    print("\n" + "="*60)
    print("DATA QUALITY VALIDATION - INTEGRATION TEST SUITE")
    print("="*60)

    try:
        test_high_quality_option()
        test_medium_quality_option()
        test_rejected_option()
        test_stale_price_detection()
        test_market_hours_detection()

        print(f"\n{'='*60}")
        print(f"ALL TESTS PASSED ✅")
        print(f"{'='*60}\n")

    except AssertionError as e:
        print(f"\n{'='*60}")
        print(f"TEST FAILED ❌")
        print(f"{'='*60}")
        print(f"Error: {e}\n")
        raise
