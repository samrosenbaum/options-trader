#!/usr/bin/env python3
"""Generate enhanced bearish signal snapshots for manual refresh requests."""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import pandas as pd

# Ensure repository root is on PYTHONPATH so imports work when the script runs
# from a compiled Next.js output directory.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.scanner.bearish_signals_enhanced import (  # noqa: E402
    EnhancedBearishSignalDetector,
    BearishAnalysis,
)

DEFAULT_SYMBOLS = ["META", "NFLX", "SNAP", "PYPL", "COIN", "TSLA", "AMD", "NVDA"]
random.seed(42)


def _simulate_options_chain(symbol: str, price: float) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Build a synthetic options snapshot that exercises bearish detectors."""

    strikes: List[float] = [price * x for x in (0.9, 0.95, 1.0, 1.05, 1.1)]
    expiration = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")

    puts: List[Dict[str, float]] = []
    calls: List[Dict[str, float]] = []

    for strike in strikes:
        distance = abs(strike - price) / price
        atm_multiplier = 3 if distance <= 0.03 else 1

        put_volume = 950 * atm_multiplier * random.uniform(0.9, 1.12)
        call_volume = 420 * random.uniform(0.85, 1.05)

        puts.append(
            {
                "strike": float(strike),
                "volume": float(round(put_volume)),
                "openInterest": float(round(put_volume * 0.35 + 500)),
                "lastPrice": max(0.55, abs(strike - price) * 0.035),
                "impliedVolatility": 0.7 + random.uniform(-0.05, 0.05),
                "expiration": expiration,
            }
        )
        calls.append(
            {
                "strike": float(strike),
                "volume": float(round(call_volume)),
                "openInterest": float(round(call_volume * 0.6 + 700)),
                "lastPrice": max(0.45, abs(strike - price) * 0.025),
                "impliedVolatility": 0.5 + random.uniform(-0.04, 0.04),
                "expiration": expiration,
            }
        )

    return pd.DataFrame(puts), pd.DataFrame(calls)


def _alert_level(score: int) -> str:
    if score >= 22:
        return "extreme"
    if score >= 16:
        return "high"
    if score >= 10:
        return "moderate"
    return "watch"


def _confidence_from_score(score: int) -> int:
    # Baseline 60% plus roughly two points of confidence per score point.
    return min(98, max(55, 58 + score * 2))


def _analysis_to_payload(analysis: BearishAnalysis, price: float) -> Dict:
    drivers: List[str] = []
    for signal in analysis.signals:
        percentile = getattr(signal, "percentile", None)
        suffix = f" ({percentile:.0f}th percentile)" if percentile is not None else ""
        drivers.append(
            f"{signal.signal_type.replace('_', ' ').title()}: {signal.description}{suffix}"
        )

    generated_at = analysis.timestamp.replace(microsecond=0)
    expires_at = generated_at + timedelta(hours=12)

    return {
        "id": f"{analysis.symbol}-{int(generated_at.timestamp())}",
        "symbol": analysis.symbol,
        "totalScore": analysis.total_score,
        "maxScore": analysis.max_score,
        "recommendation": analysis.recommendation,
        "currentPrice": round(price, 2),
        "priceChangePct": round(random.uniform(-4.5, -0.5), 2),
        "putCallRatio": analysis.put_call_ratio,
        "putCallZscore": analysis.put_call_zscore,
        "confidence": _confidence_from_score(analysis.total_score),
        "alertLevel": _alert_level(analysis.total_score),
        "recommendedStrikes": [round(strike, 2) for strike in analysis.recommended_strikes],
        "expectedRoi": analysis.expected_roi,
        "darkPoolBearish": analysis.dark_pool_bearish,
        "gammaExposure": analysis.gamma_exposure,
        "shortInterestPct": analysis.short_interest_pct,
        "signals": [
            {
                "signalType": signal.signal_type,
                "severity": signal.severity.lower(),
                "points": signal.points,
                "description": signal.description,
                "value": getattr(signal, "value", None),
                "percentile": getattr(signal, "percentile", None),
            }
            for signal in analysis.signals
        ],
        "drivers": drivers,
        "generatedAt": generated_at.isoformat() + "Z",
        "expiresAt": expires_at.isoformat() + "Z",
    }


def generate_signals(symbols: Iterable[str], min_score: int, limit: int) -> Dict:
    detector = EnhancedBearishSignalDetector()
    results: List[Dict] = []

    for symbol in symbols:
        base_price = random.uniform(25, 320)
        puts_df, calls_df = _simulate_options_chain(symbol, base_price)

        total_volume = random.randint(850_000, 1_600_000)
        dark_pool_pct = random.uniform(0.45, 0.58)
        dark_pool_volume = total_volume * dark_pool_pct
        short_interest = random.uniform(0.12, 0.28)

        analysis = detector.analyze(
            symbol=symbol,
            current_price=base_price,
            puts_df=puts_df,
            calls_df=calls_df,
            dark_pool_volume=dark_pool_volume,
            total_volume=total_volume,
            short_interest_pct=short_interest,
        )

        if analysis.total_score < min_score:
            continue

        results.append(_analysis_to_payload(analysis, base_price))

        if len(results) >= limit:
            break

    generated_at = datetime.utcnow().replace(microsecond=0)
    return {
        "success": True,
        "data": results,
        "count": len(results),
        "totalScanned": len(list(symbols)),
        "generatedAt": generated_at.isoformat() + "Z",
        "nextScanAt": (generated_at + timedelta(minutes=15)).isoformat() + "Z",
        "note": "synthetic-snapshot",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-score", type=int, default=8)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--symbols", nargs="*", default=DEFAULT_SYMBOLS)
    args = parser.parse_args()

    payload = generate_signals(args.symbols, args.min_score, args.limit)
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
