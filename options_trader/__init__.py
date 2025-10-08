"""Top-level CLI package for Options Trader utilities."""

from __future__ import annotations

from typing import Sequence

from strategies.sharp_move_scanner.cli import main as sharp_move_main

__all__ = ["main"]


def main(argv: Sequence[str] | None = None) -> int:
    """Dispatch to the Sharp Move scanner CLI."""

    return sharp_move_main(argv)
