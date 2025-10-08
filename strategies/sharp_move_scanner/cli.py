"""Command line interface for the Sharp Move scanner."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Sequence

import pandas as pd

from .pipeline import SharpMoveScanner, load_config

OUTPUT_DIR = Path("outputs/sharp_move")
LOG_DIR = Path("logs/sharp_move")

LOGGER = logging.getLogger("sharp_move.cli")


def _parse_exp_window(raw: str) -> tuple[int, int]:
    try:
        start_str, end_str = raw.split("-", 1)
        start = int(start_str)
        end = int(end_str)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Expected EXP_WINDOW format 'start-end'") from exc
    if start < 0 or end < start:
        raise argparse.ArgumentTypeError("Invalid expiration window")
    return start, end


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Scan for sharp move option setups")
    parser.add_argument("command", choices=["scan:sharp-move"], help="Command to execute")
    parser.add_argument(
        "--tickers",
        type=str,
        default="",
        help="Comma separated tickers to scan (defaults to config universe)",
    )
    parser.add_argument(
        "--exp-window",
        type=_parse_exp_window,
        default=_parse_exp_window("1-7"),
        help="Expiration window in days, e.g. 1-7",
    )
    parser.add_argument("--min-score", type=float, default=0.0, help="Minimum composite score to retain")
    parser.add_argument(
        "--max-per-ticker",
        type=int,
        default=5,
        help="Maximum contracts per ticker in the final output",
    )
    parser.add_argument("--include-calls", action="store_true", help="Include call contracts")
    parser.add_argument("--include-puts", action="store_true", help="Include put contracts")
    parser.add_argument(
        "--no-flow",
        action="store_true",
        help="Disable flow metrics integration (saves network calls if unsupported)",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("configs/sharp_move.yaml"),
        help="Override config file path",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=10,
        help="Number of rows to display in the console",
    )
    return parser


def _ensure_directories() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)


def _configure_logging() -> None:
    _ensure_directories()
    log_path = LOG_DIR / "scan.log"
    handler = logging.FileHandler(log_path, encoding="utf-8")
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    handler.setFormatter(formatter)
    root = logging.getLogger("sharp_move")
    if not any(isinstance(existing, logging.FileHandler) for existing in root.handlers):
        root.setLevel(logging.INFO)
        root.addHandler(handler)
    if not any(isinstance(existing, logging.FileHandler) for existing in LOGGER.handlers):
        LOGGER.addHandler(handler)
    logging.basicConfig(level=logging.INFO)


def _tokenize_tickers(raw: str) -> Sequence[str]:
    if not raw:
        return []
    return [token.strip().upper() for token in raw.split(",") if token.strip()]


def _display(df: pd.DataFrame, limit: int) -> None:
    if df.empty:
        print("No opportunities found.")
        return
    display_cols = [
        "ticker",
        "type",
        "expiry",
        "strike",
        "mid",
        "prob_profit",
        "score",
        "explanation",
    ]
    preview = df[display_cols].head(limit)
    with pd.option_context("display.max_columns", None, "display.width", 160):
        print(preview.to_string(index=False))


def run_from_args(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command != "scan:sharp-move":
        parser.error("Unknown command")

    include_calls = args.include_calls or not args.include_puts
    include_puts = args.include_puts or not args.include_calls

    config = load_config(args.config)
    scanner = SharpMoveScanner(config)

    tickers = _tokenize_tickers(args.tickers)
    exp_window = args.exp_window if isinstance(args.exp_window, tuple) else _parse_exp_window(args.exp_window)

    LOGGER.info(
        "Running sharp move scan for tickers: %s window=%s", tickers or config.universe, exp_window
    )
    result = scanner.run(
        tickers=tickers or None,
        exp_window=exp_window,
        include_calls=include_calls,
        include_puts=include_puts,
        min_score=args.min_score,
        max_per_ticker=args.max_per_ticker,
        include_flow=not args.no_flow,
    )

    if result.empty:
        print("No qualifying contracts found within the configured filters.")
        return 0

    timestamp = result["asof"].iloc[0]
    if isinstance(timestamp, pd.Timestamp):
        ts_str = timestamp.strftime("%Y%m%d_%H%M")
    else:
        ts_str = pd.to_datetime(timestamp).strftime("%Y%m%d_%H%M")
    output_path = OUTPUT_DIR / f"scan_{ts_str}.csv"
    result.to_csv(output_path, index=False)
    LOGGER.info("Saved results to %s", output_path)
    _display(result, args.top)
    print(f"Saved {len(result)} rows to {output_path}")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    _configure_logging()
    return run_from_args(argv)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
