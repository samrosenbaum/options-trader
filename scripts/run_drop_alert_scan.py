#!/usr/bin/env python3
"""CLI entrypoint for the Drop Alert Scanner."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

import os
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.monitoring.drop_alert_scanner import DropAlertScanner


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the drop-risk alert scanner")
    parser.add_argument(
        "--symbols",
        nargs="*",
        help="Optional list of ticker symbols to analyse (defaults to high-liquidity universe)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of symbols to evaluate (defaults to 40)",
    )
    parser.add_argument(
        "--no-persist",
        action="store_true",
        help="Skip Supabase persistence (always enabled when credentials missing)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to write JSON results",
    )
    return parser.parse_args()


def symbols_from_args(raw: Sequence[str] | None) -> Sequence[str] | None:
    if not raw:
        return None
    cleaned: list[str] = []
    for sym in raw:
        if not sym:
            continue
        symbol = sym.strip().upper()
        if symbol:
            cleaned.append(symbol)
    return cleaned or None


def main() -> None:
    args = parse_args()
    scanner = DropAlertScanner(max_symbols=args.limit)
    results = scanner.run(symbols_from_args(args.symbols))

    if results and not args.no_persist:
        scanner.persist(results)

    payload = [
        {
            "symbol": r.symbol,
            "score": round(r.drop_risk_score, 2),
            "biasScore": round(r.bias_score, 2),
            "confidence": round(r.confidence, 2),
            "alertLevel": r.alert_level,
            "stockPrice": r.stock_price,
            "priceChangePct": r.price_change_pct,
            "drivers": r.drivers,
            "scoreChange": r.score_change,
            "generatedAt": r.generated_at.isoformat(),
        }
        for r in results
    ]

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(results),
        "signals": payload,
    }

    print(json.dumps(output, indent=2))

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
