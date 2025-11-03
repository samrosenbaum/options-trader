import pandas as pd

from src.monitoring.quote_integrity import QuoteIntegrityMonitor


def test_quote_integrity_detects_stale_quotes():
    monitor = QuoteIntegrityMonitor(stale_threshold_minutes=15, critical_stale_minutes=60)

    df = pd.DataFrame(
        [
            {
                "symbol": "XYZ",
                "expiration": "2030-01-17",
                "strike": 100,
                "_price_age_seconds": 7200,  # 120 minutes
                "bid": 1.5,
                "ask": 1.6,
                "lastPrice": 1.55,
                "volume": 10,
                "openInterest": 25,
            }
        ]
    )

    summary = monitor.evaluate_dataframe(df)
    stale = summary.stale_quotes

    assert summary.total_quotes == 1
    assert stale["count"] == 1
    assert stale["criticalCount"] == 1
    assert stale["worstAgeMinutes"] == 120.0
    assert stale["examples"]


def test_quote_integrity_flags_pricing_and_volume_anomalies():
    monitor = QuoteIntegrityMonitor(volume_oi_ratio_threshold=100)

    df = pd.DataFrame(
        [
            {
                "symbol": "ABC",
                "expiration": "2030-02-21",
                "strike": 50,
                "_price_age_seconds": 120,
                "bid": 1.0,
                "ask": 1.1,
                "lastPrice": 4.0,
                "volume": 0,
                "openInterest": 20,
            },
            {
                "symbol": "DEF",
                "expiration": "2030-02-21",
                "strike": 60,
                "_price_age_seconds": 60,
                "bid": 2.5,
                "ask": 2.0,  # Crossed market
                "lastPrice": 2.2,
                "volume": 5000,
                "openInterest": 10,
            },
        ]
    )

    summary = monitor.evaluate_dataframe(df)

    pricing = summary.pricing_anomalies
    volume = summary.volume_outliers

    assert pricing["crossedMarketCount"] == 1
    assert pricing["lastPriceDeviationCount"] == 1
    assert volume["zeroVolumeCount"] == 1
    # DEF volume/open interest ratio = 500, should exceed threshold
    assert volume["extremeRatioCount"] == 1
    assert summary.anomaly_count >= 4
