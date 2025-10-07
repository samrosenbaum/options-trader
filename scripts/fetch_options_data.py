"""Fetch option scan opportunities using the shared smart scanner service."""

from __future__ import annotations

from argparse import ArgumentParser
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Mapping, MutableMapping, Sequence
from uuid import uuid4

from src.config import AppSettings, get_settings
from src.scanner.service import run_scan
from src.storage import OptionSnapshot, RunMetadata, SignalSnapshot
from src.storage.sqlite import SQLiteStorage


def _normalize_symbol_limit(raw_limit: int | None) -> int | None:
    if raw_limit is None:
        return None
    if raw_limit <= 0:
        return None
    return raw_limit


def _build_option_snapshots(symbol: str, contracts: Sequence[Mapping[str, Any]]) -> list[OptionSnapshot]:
    snapshots: list[OptionSnapshot] = []
    for record in contracts:
        option_type = str(record.get("type") or record.get("optionType") or "").lower()
        strike = float(record.get("strike", 0.0) or 0.0)
        expiration = str(record.get("expiration", ""))
        contract_symbol = record.get("contractSymbol") or record.get("contract_symbol")
        snapshots.append(
            OptionSnapshot(
                symbol=symbol,
                option_type=option_type,
                expiration=expiration,
                strike=strike,
                contract_symbol=contract_symbol,
                data=dict(record),
            )
        )
    return snapshots


def _build_signal_snapshots(opportunities: Iterable[Mapping[str, Any]]) -> list[SignalSnapshot]:
    snapshots: list[SignalSnapshot] = []
    for opportunity in opportunities:
        option_type = str(opportunity.get("optionType") or "").lower()
        score_raw = opportunity.get("score", 0.0)
        try:
            score = float(score_raw)
        except (TypeError, ValueError):
            score = 0.0
        snapshots.append(
            SignalSnapshot(
                symbol=str(opportunity.get("symbol", "")),
                option_type=option_type,
                score=score,
                data=dict(opportunity),
            )
        )
    return snapshots


def _create_storage(settings: AppSettings) -> SQLiteStorage:
    sqlite_settings = settings.storage.require_sqlite()
    return SQLiteStorage(sqlite_settings.path, pragmas=sqlite_settings.pragmas)


def _persist_scan_results(
    settings: AppSettings,
    metadata: Mapping[str, Any],
    opportunities: Sequence[Mapping[str, Any]],
) -> None:
    chains = metadata.get("chainsBySymbol")
    if not chains and not opportunities:
        return

    if isinstance(chains, MutableMapping):
        chains_by_symbol: Dict[str, Sequence[Mapping[str, Any]]] = chains  # type: ignore[assignment]
    else:
        chains_by_symbol = {}

    storage = _create_storage(settings)
    option_snapshots: list[OptionSnapshot] = []
    total_options = 0
    for symbol, records in chains_by_symbol.items():
        option_snapshots.extend(_build_option_snapshots(symbol, records))
        total_options += len(records)

    signal_snapshots = _build_signal_snapshots(opportunities)

    metadata_payload = RunMetadata(
        run_id=uuid4().hex,
        run_at=datetime.now(timezone.utc),
        environment=settings.env,
        watchlist=metadata.get("watchlistName") or "priority_universe",
        extra={
            "symbols": metadata.get("symbols", []),
            "opportunity_count": len(opportunities),
            "option_snapshot_count": total_options,
            "total_evaluated": metadata.get("totalEvaluated"),
            "symbol_limit": metadata.get("symbolLimit"),
        },
    )

    storage.save_run(metadata_payload, option_snapshots, signal_snapshots)


def _build_arg_parser() -> ArgumentParser:
    parser = ArgumentParser(description="Scan option chains using the smart scanner service.")
    parser.add_argument(
        "--max-symbols",
        type=int,
        default=None,
        help="Limit the number of symbols requested from the priority universe.",
    )
    parser.add_argument(
        "--json-indent",
        type=int,
        default=None,
        help="Pretty print JSON output with the provided indentation.",
    )
    return parser


if __name__ == "__main__":
    args = _build_arg_parser().parse_args()
    symbol_limit = _normalize_symbol_limit(args.max_symbols)

    result = run_scan(symbol_limit)
    settings = get_settings()
    _persist_scan_results(settings, result.metadata, result.opportunities)

    print(result.to_json(indent=args.json_indent))
