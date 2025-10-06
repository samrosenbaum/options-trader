from datetime import datetime, timedelta

from src.storage import OptionSnapshot, RunMetadata, SignalSnapshot
from src.storage.sqlite import SQLiteStorage


def test_save_and_retrieve_run(tmp_path):
    db_path = tmp_path / "options.db"
    storage = SQLiteStorage(db_path)

    metadata = RunMetadata(
        run_id="run-1",
        run_at=datetime.utcnow(),
        environment="dev",
        watchlist="default",
        extra={"note": "initial"},
    )

    options = [
        OptionSnapshot(
            symbol="AAPL",
            option_type="call",
            expiration="2024-12-20",
            strike=150.0,
            contract_symbol="AAPL240120C00150000",
            data={"bid": 1.25, "ask": 1.35},
        ),
        OptionSnapshot(
            symbol="AAPL",
            option_type="put",
            expiration="2024-12-20",
            strike=140.0,
            contract_symbol="AAPL240120P00140000",
            data={"bid": 2.1, "ask": 2.3},
        ),
    ]

    signals = [
        SignalSnapshot(
            symbol="AAPL",
            option_type="call",
            score=82.5,
            contract_symbol="AAPL240120C00150000",
            data={"total_score": 82.5, "tags": ["gamma"]},
        )
    ]

    storage.save_run(metadata, options, signals)

    stored_metadata = storage.get_metadata("run-1")
    assert stored_metadata is not None
    assert stored_metadata.environment == "dev"
    assert stored_metadata.extra["note"] == "initial"

    stored_options = storage.get_options("run-1")
    assert len(stored_options) == 2
    assert stored_options[0].symbol == "AAPL"

    stored_signals = storage.get_signals("run-1")
    assert len(stored_signals) == 1
    assert stored_signals[0].score == 82.5

    runs = storage.list_runs()
    assert runs and runs[0].run_id == "run-1"


def test_save_run_overwrites_existing(tmp_path):
    db_path = tmp_path / "options.db"
    storage = SQLiteStorage(db_path)

    first_metadata = RunMetadata(
        run_id="duplicate",
        run_at=datetime.utcnow(),
        environment="dev",
        watchlist="default",
    )
    second_metadata = RunMetadata(
        run_id="duplicate",
        run_at=datetime.utcnow() + timedelta(minutes=5),
        environment="prod",
        watchlist="momentum",
    )

    storage.save_run(
        first_metadata,
        [
            OptionSnapshot(
                symbol="SPY",
                option_type="call",
                expiration="2024-06-21",
                strike=450.0,
                contract_symbol="SPY240621C00450000",
                data={"bid": 3.2},
            )
        ],
        [],
    )

    storage.save_run(
        second_metadata,
        [
            OptionSnapshot(
                symbol="SPY",
                option_type="call",
                expiration="2024-06-21",
                strike=455.0,
                contract_symbol="SPY240621C00455000",
                data={"bid": 2.8},
            )
        ],
        [
            SignalSnapshot(
                symbol="SPY",
                option_type="call",
                score=75.0,
                contract_symbol="SPY240621C00455000",
                data={"total_score": 75.0},
            )
        ],
    )

    stored_metadata = storage.get_metadata("duplicate")
    assert stored_metadata is not None
    assert stored_metadata.environment == "prod"
    assert stored_metadata.watchlist == "momentum"

    stored_options = storage.get_options("duplicate")
    assert len(stored_options) == 1
    assert stored_options[0].strike == 455.0

    stored_signals = storage.get_signals("duplicate")
    assert len(stored_signals) == 1
