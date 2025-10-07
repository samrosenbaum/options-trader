#!/usr/bin/env python3
"""Compat wrapper delegating to the shared smart options scanner service."""

from src.scanner.service import cli


if __name__ == "__main__":
    cli()
