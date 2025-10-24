"""FastAPI application exposing the in-process scoring engine."""

from __future__ import annotations

import asyncio
import logging
from contextlib import AsyncExitStack, suppress
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException

from src.models import (
    ScanError,
    ScanRequest,
    ScanResponse,
    ScanTarget,
    Signal,
    CustomScanRequest,
    serialize_scan_response,
)
from src.scoring.engine import CompositeScoringEngine
from src.scanner.custom_scanner import CustomScanner, CustomFilterCriteria
from src.analyst.morning_brief import generate_morning_brief, format_brief_for_display
from src.analyst.nightly_brief import generate_nightly_brief, format_nightly_brief

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Options Trader Scoring API", version="1.0.0")

_default_engine = CompositeScoringEngine()
_shutdown_stack = AsyncExitStack()
_background_tasks: set[asyncio.Task[Any]] = set()


def _get_engine(config: Optional[Dict[str, Any]]) -> CompositeScoringEngine:
    if not config:
        return _default_engine
    return CompositeScoringEngine(config)


def track_background_task(task: asyncio.Task[Any]) -> None:
    """Register a background task so it can be cancelled on shutdown."""

    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


@app.on_event("startup")
async def on_startup() -> None:
    """Initialize shared resources when the app starts."""

    logger.info("Starting scoring API")
    await _shutdown_stack.__aenter__()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Gracefully close open resources and tasks."""

    logger.info("Shutting down scoring API")
    for task in list(_background_tasks):
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    await _shutdown_stack.aclose()


def _score_target(
    target: ScanTarget,
    engine: CompositeScoringEngine,
    market_context: Dict[str, Any],
) -> Signal:
    result = engine.score(target.contract, target.greeks, target.market_data)
    metadata = dict(target.metadata)
    if context := market_context.get(target.contract.symbol):
        metadata.setdefault("market_context", context)
    return Signal.from_scoring_result(result, metadata=metadata)


@app.post("/scan", response_model=ScanResponse)
async def scan(payload: ScanRequest) -> Dict[str, Any]:
    """Score submitted option contracts and return structured signals."""

    if not payload.targets:
        raise HTTPException(status_code=400, detail="Request must include at least one target")

    engine = _get_engine(payload.scoring_config or None)
    signals: list[Signal] = []
    errors: list[ScanError] = []
    context = {symbol: ctx.model_dump() for symbol, ctx in payload.market_context.items()}

    for target in payload.targets:
        try:
            signals.append(_score_target(target, engine, context))
        except Exception as exc:  # pragma: no cover - defensive guard
            logger.exception("Failed to score contract", extra={"symbol": target.contract.symbol})
            errors.append(ScanError(symbol=target.contract.symbol, reason=str(exc)))

    if not signals:
        raise HTTPException(status_code=422, detail=[error.model_dump() for error in errors])

    response = ScanResponse(signals=signals, errors=errors)
    return serialize_scan_response(response)


@app.post("/scan/custom", response_model=ScanResponse)
async def scan_custom(payload: CustomScanRequest) -> Dict[str, Any]:
    """
    Custom scanner - filter options based on user-defined criteria

    This endpoint allows users to set their own filter parameters (volume, greeks, IV, etc.)
    and get options that match their criteria. Unlike the smart scanner which uses
    sophisticated scoring algorithms, this returns simple match-based results.
    """

    if not payload.targets:
        raise HTTPException(status_code=400, detail="Request must include at least one target")

    # Build filter criteria from request
    criteria = CustomFilterCriteria(
        min_volume=payload.min_volume,
        min_open_interest=payload.min_open_interest,
        max_spread_percent=payload.max_spread_percent,
        min_delta=payload.min_delta,
        max_delta=payload.max_delta,
        min_gamma=payload.min_gamma,
        max_gamma=payload.max_gamma,
        min_theta=payload.min_theta,
        max_theta=payload.max_theta,
        min_vega=payload.min_vega,
        max_vega=payload.max_vega,
        min_iv=payload.min_iv,
        max_iv=payload.max_iv,
        min_dte=payload.min_dte,
        max_dte=payload.max_dte,
        option_type=payload.option_type,
        min_strike=payload.min_strike,
        max_strike=payload.max_strike,
        min_price=payload.min_price,
        max_price=payload.max_price,
    )

    scanner = CustomScanner(criteria)
    signals: list[Signal] = []
    errors: list[ScanError] = []
    context = {symbol: ctx.model_dump() for symbol, ctx in payload.market_context.items()}

    for target in payload.targets:
        try:
            result = scanner.score_option(target.contract, target.greeks)
            metadata = dict(target.metadata)
            if ctx := context.get(target.contract.symbol):
                metadata.setdefault("market_context", ctx)
            signals.append(Signal.from_scoring_result(result, metadata=metadata))
        except Exception as exc:  # pragma: no cover - defensive guard
            logger.exception("Failed to score contract", extra={"symbol": target.contract.symbol})
            errors.append(ScanError(symbol=target.contract.symbol, reason=str(exc)))

    if not signals:
        raise HTTPException(status_code=422, detail=[error.model_dump() for error in errors])

    response = ScanResponse(signals=signals, errors=errors)
    return serialize_scan_response(response)


@app.get("/analyst/morning-brief")
async def get_morning_brief() -> Dict[str, Any]:
    """
    Generate morning brief (7:00 AM pre-market intelligence).

    Returns:
        - formatted_text: Plain text email-ready brief
        - brief: Structured data (UOA, pre-market movers, watchlist, etc.)
    """
    try:
        # Major symbols to scan
        symbols = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
            'NVDA', 'META', 'NFLX', 'COIN', 'AMD',
            'SPY', 'QQQ', 'SOFI', 'PLTR', 'RBLX'
        ]

        brief = generate_morning_brief(symbols)
        formatted_text = format_brief_for_display(brief)

        return {
            "success": True,
            "formatted_text": formatted_text,
            "brief": {
                "timestamp": brief['timestamp'].isoformat(),
                "uoa_signals": brief['uoa_signals'],
                "earnings_today": brief['earnings_today'],
                "premarket_movers": brief['premarket_movers'],
                "watchlist": brief['watchlist'],
                "portfolio_alerts": brief['portfolio_alerts'],
                "market_conditions": brief['market_conditions']
            }
        }
    except Exception as e:
        logger.exception("Failed to generate morning brief")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/analyst/nightly-brief")
async def get_nightly_brief() -> Dict[str, Any]:
    """
    Generate nightly brief (8:00 PM tomorrow's battle plan).

    Returns:
        - formatted_text: Plain text email-ready brief
        - brief: Structured data (key setups, watchlist, market levels, etc.)
    """
    try:
        # Major symbols to scan
        symbols = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
            'NVDA', 'META', 'NFLX', 'COIN', 'AMD',
            'SPY', 'QQQ', 'SOFI', 'PLTR', 'RBLX'
        ]

        brief = generate_nightly_brief(symbols)
        formatted_text = format_nightly_brief(brief)

        return {
            "success": True,
            "formatted_text": formatted_text,
            "brief": {
                "timestamp": brief['timestamp'].isoformat(),
                "tomorrows_watchlist": brief['tomorrows_watchlist'],
                "earnings_tomorrow": brief['earnings_tomorrow'],
                "market_levels": brief['market_levels'],
                "portfolio_summary": brief['portfolio_summary'],
                "key_setups": brief['key_setups']
            }
        }
    except Exception as e:
        logger.exception("Failed to generate nightly brief")
        raise HTTPException(status_code=500, detail=str(e))


__all__ = ["app", "track_background_task"]
