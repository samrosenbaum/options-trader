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
    serialize_scan_response,
)
from src.scoring.engine import CompositeScoringEngine

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


__all__ = ["app", "track_background_task"]
