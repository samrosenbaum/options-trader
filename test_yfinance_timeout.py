#!/usr/bin/env python3
"""Test yfinance timeout functionality."""

import signal
import sys
import time
from contextlib import contextmanager

import yfinance as yf


class TimeoutError(Exception):
    pass


def timeout_handler(signum, frame):
    raise TimeoutError("Operation timed out")


@contextmanager
def timeout(seconds):
    """Context manager for timeouts."""
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)


def test_ticker_with_timeout():
    """Test creating a Ticker with timeout."""
    print("Testing yfinance Ticker creation with 5-second timeout...")

    try:
        with timeout(5):
            print("Creating Ticker for AAPL...")
            ticker = yf.Ticker("AAPL")
            print(f"✅ Ticker created: {ticker}")

            print("Fetching options expirations...")
            expirations = ticker.options
            print(f"✅ Got {len(expirations)} expiration dates")

    except TimeoutError:
        print("❌ TIMEOUT: yfinance took too long (>5 seconds)")
        return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

    return True


def test_ticker_without_timeout():
    """Test creating a Ticker without timeout (for comparison)."""
    print("\nTesting yfinance Ticker creation WITHOUT timeout (will wait 10 seconds max)...")

    start = time.time()
    try:
        ticker = yf.Ticker("AAPL")
        print(f"✅ Ticker created in {time.time() - start:.1f}s: {ticker}")

        expirations = ticker.options
        print(f"✅ Got {len(expirations)} expiration dates in {time.time() - start:.1f}s total")

    except Exception as e:
        print(f"❌ ERROR after {time.time() - start:.1f}s: {e}")
        return False

    elapsed = time.time() - start
    print(f"Total time: {elapsed:.1f}s")

    if elapsed > 10:
        print("⚠️  WARNING: Took longer than 10 seconds")
        return False

    return True


if __name__ == "__main__":
    print("=" * 80)
    print("YFINANCE TIMEOUT TEST")
    print("=" * 80)

    # Test without timeout first to see baseline
    success1 = test_ticker_without_timeout()

    # Test with timeout
    success2 = test_ticker_with_timeout()

    print("\n" + "=" * 80)
    print("RESULTS:")
    print(f"  Without timeout: {'✅ PASSED' if success1 else '❌ FAILED'}")
    print(f"  With timeout: {'✅ PASSED' if success2 else '❌ FAILED'}")
    print("=" * 80)

    sys.exit(0 if (success1 and success2) else 1)
