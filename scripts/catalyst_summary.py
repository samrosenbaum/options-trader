"""CLI utility for retrieving catalyst summaries for one or more symbols."""

from __future__ import annotations

import argparse
import json
import sys
from typing import List

from src.catalysts import CatalystTracker


def parse_args(argv: List[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Emit catalyst summaries as JSON")
    parser.add_argument(
        "--symbols",
        required=True,
        help="Comma-separated list of ticker symbols",
    )
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv)
    symbols = [symbol.strip().upper() for symbol in args.symbols.split(",") if symbol.strip()]

    tracker = CatalystTracker()
    summaries = {}

    for symbol in symbols:
        try:
            summary = tracker.build_summary(symbol)
            summaries[symbol] = summary.model_dump(mode="json", exclude_none=True)
        except Exception as exc:  # pragma: no cover - defensive guard
            summaries[symbol] = {"error": str(exc)}

    payload = {"summaries": summaries, "symbol_count": len(symbols)}
    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
