"""FastAPI application exposing the in-process scoring engine."""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import AsyncExitStack, suppress
from typing import Any, Dict, Optional, List

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

# Initialize Supabase client for fetching user data
try:
    from supabase import Client, create_client
    _supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    _supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if _supabase_url and _supabase_key:
        _supabase_client: Optional[Client] = create_client(_supabase_url, _supabase_key)
    else:
        _supabase_client = None
        logger.warning("Supabase credentials not found - portfolio personalization disabled")
except ImportError:
    _supabase_client = None
    logger.warning("Supabase package not installed - portfolio personalization disabled")

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


def _get_user_portfolio_and_watchlist(email: str) -> tuple[Optional[Dict], List[str]]:
    """
    Fetch user's portfolio positions and watchlist symbols from Supabase.

    Args:
        email: User's email address

    Returns:
        Tuple of (portfolio_dict, watchlist_symbols)
        portfolio_dict contains 'open_positions' list if available
    """
    if not _supabase_client:
        logger.warning("Supabase client not initialized - returning empty portfolio")
        return None, []

    try:
        # Get user ID from email
        user_response = _supabase_client.auth.admin.list_users()
        user_id = None
        for user in user_response:
            if hasattr(user, 'email') and user.email == email:
                user_id = user.id
                break

        if not user_id:
            # Try direct table query for user lookup
            profile_response = _supabase_client.table('profiles').select('id').eq('email', email).execute()
            if profile_response.data and len(profile_response.data) > 0:
                user_id = profile_response.data[0]['id']

        if not user_id:
            logger.warning(f"User not found for email: {email}")
            return None, []

        # Fetch open positions
        positions_response = _supabase_client.table('positions').select('*').eq('user_id', user_id).eq('status', 'open').execute()

        open_positions = []
        if positions_response.data:
            for pos in positions_response.data:
                open_positions.append({
                    'symbol': pos.get('symbol'),
                    'strike': float(pos.get('strike', 0)),
                    'option_type': pos.get('option_type'),
                    'expiration': pos.get('expiration'),
                    'contracts': int(pos.get('contracts', 1)),
                    'entry_price': float(pos.get('entry_price', 0)),
                    'current_price': float(pos.get('current_price', 0)) if pos.get('current_price') else None,
                    'unrealized_pl_percent': float(pos.get('unrealized_pl_percent', 0)) if pos.get('unrealized_pl_percent') else None,
                })

        # Fetch watchlist symbols
        watchlist_response = _supabase_client.table('watchlist').select('symbol').eq('user_id', user_id).execute()

        watchlist_symbols = []
        if watchlist_response.data:
            watchlist_symbols = list(set([item['symbol'] for item in watchlist_response.data if item.get('symbol')]))

        portfolio = {
            'open_positions': open_positions,
            'total_capital': 10000  # Default - could be fetched from user settings if available
        } if open_positions else None

        logger.info(f"Fetched {len(open_positions)} positions and {len(watchlist_symbols)} watchlist symbols for {email}")

        return portfolio, watchlist_symbols

    except Exception as e:
        logger.exception(f"Error fetching user data for {email}: {e}")
        return None, []


@app.get("/analyst/morning-brief")
async def get_morning_brief(email: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate morning brief (7:00 AM pre-market intelligence).

    Args:
        email: Optional user email for personalized brief

    Returns:
        - formatted_text: Plain text email-ready brief
        - brief: Structured data (UOA, pre-market movers, watchlist, etc.)
    """
    try:
        # Default symbols to scan
        symbols = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
            'NVDA', 'META', 'NFLX', 'COIN', 'AMD',
            'SPY', 'QQQ', 'SOFI', 'PLTR', 'RBLX'
        ]

        user_portfolio = None

        # Fetch user-specific data if email provided
        if email:
            user_portfolio, watchlist_symbols = _get_user_portfolio_and_watchlist(email)

            # Add user's watchlist symbols to scanning list
            if watchlist_symbols:
                symbols = list(set(symbols + watchlist_symbols))
                logger.info(f"Scanning {len(symbols)} symbols (including {len(watchlist_symbols)} from watchlist)")

        brief = generate_morning_brief(symbols, user_portfolio=user_portfolio)
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
async def get_nightly_brief(email: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate nightly brief (8:00 PM tomorrow's battle plan).

    Args:
        email: Optional user email for personalized brief

    Returns:
        - formatted_text: Plain text email-ready brief
        - brief: Structured data (key setups, watchlist, market levels, etc.)
    """
    try:
        # Default symbols to scan
        symbols = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
            'NVDA', 'META', 'NFLX', 'COIN', 'AMD',
            'SPY', 'QQQ', 'SOFI', 'PLTR', 'RBLX'
        ]

        user_portfolio = None

        # Fetch user-specific data if email provided
        if email:
            user_portfolio, watchlist_symbols = _get_user_portfolio_and_watchlist(email)

            # Add user's watchlist symbols to scanning list
            if watchlist_symbols:
                symbols = list(set(symbols + watchlist_symbols))
                logger.info(f"Scanning {len(symbols)} symbols (including {len(watchlist_symbols)} from watchlist)")

        brief = generate_nightly_brief(symbols, user_portfolio=user_portfolio)
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
