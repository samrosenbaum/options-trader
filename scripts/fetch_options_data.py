"""Fetch option scan opportunities using the shared smart scanner service."""

from __future__ import annotations

import math
from argparse import ArgumentParser
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Mapping, MutableMapping, Sequence
from uuid import uuid4

import pandas as pd
from scipy.stats import norm

from src.config import AppSettings, get_settings
from src.models.option import OptionContract, OptionGreeks
from src.scanner.service import run_deep_scan, run_scan
from src.storage import OptionSnapshot, RunMetadata, SignalSnapshot
from src.storage.sqlite import SQLiteStorage


def _normalize_symbol_limit(raw_limit: int | None) -> int | None:
    if raw_limit is None:
        return None
    if raw_limit <= 0:
        return None
    return raw_limit


def _time_to_expiration(expiration: Any) -> float:
    expiration_ts = pd.to_datetime(expiration)
    if pd.isna(expiration_ts):
        return 0.0
    if expiration_ts.tzinfo is None:
        expiration_ts = expiration_ts.tz_localize("UTC")
    else:
        expiration_ts = expiration_ts.tz_convert("UTC")
    now = datetime.now(timezone.utc)
    delta = max((expiration_ts - pd.Timestamp(now)).total_seconds(), 0.0)
    return delta / (365.0 * 24 * 60 * 60)


def calculate_greeks(row: pd.Series) -> OptionGreeks:
    """Estimate Black-Scholes greeks with sensible fallbacks."""

    try:
        stock_price = float(row.get("stockPrice", 0.0) or 0.0)
        strike = float(row.get("strike", 0.0) or 0.0)
        option_type = str(row.get("type", "call")).lower()
        time_to_expiry = _time_to_expiration(row.get("expiration"))
        if stock_price <= 0 or strike <= 0 or time_to_expiry <= 0:
            return OptionGreeks()

        implied_vol = float(row.get("impliedVolatility", 0.0) or 0.0)
        if implied_vol <= 0:
            implied_vol = 0.35
        implied_vol = max(0.05, implied_vol)

        rate = 0.015
        sqrt_t = math.sqrt(time_to_expiry)
        d1 = (math.log(stock_price / strike) + (rate + 0.5 * implied_vol**2) * time_to_expiry) / (
            implied_vol * sqrt_t
        )
        d2 = d1 - implied_vol * sqrt_t

        if option_type == "put":
            delta = norm.cdf(d1) - 1.0
            theta = -(stock_price * norm.pdf(d1) * implied_vol) / (2 * sqrt_t) + rate * strike * math.exp(
                -rate * time_to_expiry
            ) * norm.cdf(-d2)
        else:
            delta = norm.cdf(d1)
            theta = -(stock_price * norm.pdf(d1) * implied_vol) / (2 * sqrt_t) - rate * strike * math.exp(
                -rate * time_to_expiry
            ) * norm.cdf(d2)

        gamma = norm.pdf(d1) / (stock_price * implied_vol * sqrt_t)
        vega = stock_price * norm.pdf(d1) * sqrt_t / 100

        return OptionGreeks(
            delta=float(delta),
            gamma=float(gamma),
            theta=float(theta) / 365.0,
            vega=float(vega),
        )
    except Exception:
        return OptionGreeks()


def estimate_profit_probability(contract: OptionContract) -> Dict[str, Any]:
    """Approximate the probability of reaching the option's breakeven level."""

    iv = float(contract.implied_volatility or 0.0)
    if iv <= 0:
        iv = 0.3
    iv = max(iv, 0.05)

    days = max(contract.days_to_expiration, 1)
    horizon = days / 365.0
    sigma = iv * math.sqrt(horizon)
    if sigma <= 0:
        sigma = 0.1

    premium = contract.last_price or contract.mid_price
    if contract.option_type == "call":
        breakeven_price = contract.strike + premium
        required_move = max(0.0, (breakeven_price - contract.stock_price) / contract.stock_price)
        direction = "rise"
    else:
        breakeven_price = contract.strike - premium
        required_move = max(0.0, (contract.stock_price - breakeven_price) / contract.stock_price)
        direction = "fall"

    z_score = required_move / sigma if sigma > 0 else 10.0
    probability = 1 - norm.cdf(z_score)
    probability = max(0.0, min(1.0, float(probability)))

    explanation = (
        f"The underlying needs to {direction} approximately {required_move * 100:.2f}% to break even. "
        f"Assuming an implied volatility of {iv:.2%} over {days} days, the success probability is {probability:.1%}."
    )

    return {
        "probability": probability,
        "explanation": explanation,
        "required_move_pct": required_move * 100,
    }


def summarize_risk_metrics(
    contract: OptionContract,
    projected_returns: Mapping[str, float],
) -> Dict[str, float]:
    """Summarize upside/downside balance for quick inspection."""

    max_return_multiple = max(float(value) for value in projected_returns.values()) if projected_returns else 0.0
    max_return_pct = max_return_multiple * 100.0
    max_loss_pct = 100.0
    reward_to_risk = max_return_pct / max_loss_pct if max_loss_pct else 0.0

    return {
        "max_return_pct": float(max_return_pct),
        "max_loss_pct": max_loss_pct,
        "reward_to_risk": float(reward_to_risk),
        "breakeven_price": contract.strike + contract.last_price
        if contract.option_type == "call"
        else contract.strike - contract.last_price,
    }


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
    parser.add_argument(
        "--deep-batches",
        type=int,
        default=0,
        help="Run sequential batches for a deep scan (0 or 1 runs a single batch).",
    )
    return parser


if __name__ == "__main__":
    args = _build_arg_parser().parse_args()
    symbol_limit = _normalize_symbol_limit(args.max_symbols)

    settings = get_settings()
    if args.deep_batches and args.deep_batches > 1:
        result = run_deep_scan(args.deep_batches, symbol_limit)
    else:
        result = run_scan(symbol_limit)

    _persist_scan_results(settings, result.metadata, result.opportunities)

    print(result.to_json(indent=args.json_indent))
