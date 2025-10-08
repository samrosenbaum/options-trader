"""CLI for evaluating swing potential using the multi-factor analyzer."""

from __future__ import annotations

import argparse
import json
from typing import List, Union, cast

# Ensure the repository root is on the import path when executed directly.
try:  # pragma: no cover - defensive runtime configuration
    import src  # type: ignore  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover
    import sys
    from pathlib import Path

    project_root = Path(__file__).resolve().parents[1]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

from src.analysis import SwingSignal, SwingSignalAnalyzer

Result = Union[SwingSignal, dict]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze symbols for potential large price swings using multi-factor logic.",
    )
    parser.add_argument(
        "symbols",
        help="Comma-separated list of ticker symbols (e.g. AAPL,MSFT,TSLA)",
    )
    parser.add_argument(
        "--lookback",
        default="6mo",
        help="Historical lookback period passed to yfinance (default: 6mo)",
    )
    parser.add_argument(
        "--interval",
        default="1d",
        help="Historical interval passed to yfinance (default: 1d)",
    )
    parser.add_argument(
        "--news-limit",
        type=int,
        default=5,
        help="Number of recent headlines to inspect for sentiment (default: 5)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON output instead of a human readable table.",
    )
    return parser.parse_args()


def analyze_symbols(symbols: List[str], analyzer: SwingSignalAnalyzer) -> List[Result]:
    results: List[Result] = []
    for symbol in symbols:
        try:
            signal = analyzer.analyze(symbol)
            results.append(signal)
        except Exception as exc:  # noqa: BLE001
            results.append({
                "symbol": symbol.upper(),
                "error": str(exc),
            })
    return results


def render_text(results: List[Result]) -> str:
    lines = []
    for result in results:
        if isinstance(result, dict) and "error" in result:
            lines.append(f"{result['symbol']}: ERROR - {result['error']}")
            continue

        signal = cast(SwingSignal, result)
        lines.append(f"{signal.symbol}: score={signal.composite_score:.1f} ({signal.classification})")
        for factor in signal.factors:
            lines.append(f"  - {factor.name}: {factor.score:.1f} :: {factor.rationale}")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    symbols = [sym.strip().upper() for sym in args.symbols.split(",") if sym.strip()]

    if not symbols:
        raise SystemExit("No symbols provided.")

    analyzer = SwingSignalAnalyzer(
        lookback=args.lookback,
        interval=args.interval,
        news_limit=args.news_limit,
    )

    results = analyze_symbols(symbols, analyzer)

    if args.json:
        payload = []
        for result in results:
            if isinstance(result, dict):
                payload.append(result)
            else:
                payload.append(result.to_dict())
        print(json.dumps(payload, indent=2))
    else:
        print(render_text(results))


if __name__ == "__main__":
    main()
