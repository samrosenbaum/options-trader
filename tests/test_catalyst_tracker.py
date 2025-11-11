from datetime import datetime, timedelta

from src.catalysts import CatalystTracker


def test_tracker_builds_summary_with_events_and_technical():
    base_time = datetime(2024, 1, 1, 12, 0, 0)

    def fake_now():
        return base_time

    def fake_earnings(symbols):
        return {symbol: base_time + timedelta(days=5) for symbol in symbols}

    macro_events = [
        {
            "name": "FOMC Meeting",
            "date": (base_time + timedelta(days=10)).isoformat(),
            "impact": "high",
        }
    ]

    company_events = {
        "META": [
            {
                "name": "AI Summit",
                "date": (base_time + timedelta(days=3)).isoformat(),
                "type": "product",
                "impact": "medium",
                "confidence": 0.7,
            }
        ]
    }

    def fake_technical(symbol: str):
        return {
            "current_price": 100.0,
            "support": 97.0,
            "resistance": 105.0,
            "ma20": 98.0,
            "ma50": 92.0,
        }

    tracker = CatalystTracker(
        earnings_fetcher=fake_earnings,
        technical_analyzer=fake_technical,
        macro_events=macro_events,
        company_events=company_events,
        now_factory=fake_now,
    )

    summary = tracker.build_summary("META")
    assert summary.symbol == "META"
    assert len(summary.events) == 3
    assert summary.events[0].name == "Earnings report"
    assert summary.events[0].days_until == 5.0
    assert summary.events[1].name == "AI Summit"
    assert summary.technical is not None
    assert summary.technical.support == 97.0
    assert summary.technical.commentary, "Expected commentary notes for technical snapshot"

    payload = summary.model_dump(mode="json", exclude_none=True)
    assert payload["symbol"] == "META"
    assert payload["events"][0]["name"] == "Earnings report"
    assert "technical" in payload


def test_tracker_handles_missing_data_gracefully():
    def empty_now():
        return datetime(2024, 1, 1)

    tracker = CatalystTracker(
        earnings_fetcher=lambda symbols: {symbol: None for symbol in symbols},
        technical_analyzer=lambda symbol: {},
        macro_events=[],
        company_events={},
        now_factory=empty_now,
    )

    summary = tracker.build_summary("UNKNOWN")
    assert summary.events == []
    assert summary.technical is None
    payload = summary.model_dump(mode="json", exclude_none=True)
    assert payload["events"] == []


def test_tracker_generates_recurring_product_launch_dates():
    base_time = datetime(2024, 5, 15, 12, 0, 0)

    def fake_now():
        return base_time

    company_events = {
        "AAPL": [
            {
                "name": "Flagship iPhone launch",
                "type": "product",
                "impact": "high",
                "confidence": 0.5,
                "recurrence": {"month": 9, "day": 12, "window_days": 14},
            }
        ]
    }

    tracker = CatalystTracker(
        earnings_fetcher=lambda symbols: {symbol: None for symbol in symbols},
        technical_analyzer=lambda symbol: {},
        macro_events=[],
        company_events=company_events,
        now_factory=fake_now,
        lookahead_days=200,
    )

    summary = tracker.build_summary("AAPL")
    assert len(summary.events) == 1
    event = summary.events[0]
    assert event.name == "Flagship iPhone launch"
    assert event.approximate is True
    assert event.date is not None
    assert event.date.year == 2024
    assert event.date.month == 9
    assert 0 <= event.days_until <= 200
