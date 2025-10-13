"""Smart options scanning service reusable across scripts and APIs."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from math import ceil, isfinite, log, log1p
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

import pandas as pd
import yfinance as yf

from scripts.bulk_options_fetcher import BulkOptionsFetcher
from src.analysis import SwingSignal, SwingSignalAnalyzer
from src.config import AppSettings, get_settings
from src.scanner.historical_moves import HistoricalMoveAnalyzer
from src.scanner.iv_rank_history import IVRankHistory
from src.scanner.universe import build_scan_universe
from src.signals import OptionsSkewAnalyzer, SmartMoneyFlowDetector, RegimeDetector, VolumeProfileAnalyzer, SignalAggregator
from src.validation import OptionsDataValidator, DataQuality


@dataclass
class ScanResult:
    """Container holding serialized scan opportunities and metadata."""

    opportunities: List[Dict[str, Any]]
    metadata: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "opportunities": self.opportunities,
            "metadata": self.metadata,
            "totalEvaluated": self.metadata.get("totalEvaluated", len(self.opportunities)),
        }

    def to_json(self, *, indent: int | None = None) -> str:
        return json.dumps(self.to_dict(), indent=indent, default=str)


UniverseBuilder = Callable[[AppSettings, int, Mapping[str, Any] | None], Tuple[List[str], Dict[str, Any]]]


class SmartOptionsScanner:
    """Core implementation extracted from the legacy smart scanner script."""

    def __init__(self, max_symbols: int | None = None, *, batch_builder: UniverseBuilder | None = None):
        settings = get_settings()
        self.settings = settings
        configured_limit = settings.fetcher.max_priority_symbols
        configured_batch = getattr(settings.scanner, "batch_size", None)
        if configured_batch is not None and configured_batch <= 0:
            configured_batch = None
        self.symbol_limit = max_symbols if max_symbols is not None else configured_batch or configured_limit
        if isinstance(self.symbol_limit, int) and self.symbol_limit <= 0:
            self.symbol_limit = None
        self.fetcher = BulkOptionsFetcher(settings)
        self.universe_builder: UniverseBuilder = batch_builder or build_scan_universe
        self.rotation_state: Dict[str, Any] | None = {"mode": settings.scanner.rotation_mode}
        self.current_batch_symbols: List[str] = []
        self.cache_file = "options_cache.json"
        self.last_fetch_time: datetime | None = None
        self.data_freshness: Dict[str, Any] | None = None
        self.cache_ttl_seconds: int = max(int(getattr(settings.cache, "ttl_seconds", 900) or 0), 0)
        self.validator = OptionsDataValidator()
        sqlite_path: Optional[str] = None
        try:
            sqlite_settings = settings.storage.require_sqlite()
            sqlite_path = sqlite_settings.path
        except Exception:
            sqlite_path = None
        self.iv_history = IVRankHistory(sqlite_path)
        self.historical_moves = HistoricalMoveAnalyzer(db_path=sqlite_path, lookback_days=365)
        self.swing_analyzer: SwingSignalAnalyzer | None = None
        self._swing_signal_cache: Dict[str, Optional[Dict[str, Any]]] = {}
        self._swing_error_cache: Dict[str, str] = {}

        # Initialize directional signal framework
        self.signal_aggregator = SignalAggregator([
            OptionsSkewAnalyzer(weight=0.30),  # 30% weight
            SmartMoneyFlowDetector(weight=0.30),  # 30% weight
            RegimeDetector(weight=0.20),  # 20% weight
            VolumeProfileAnalyzer(weight=0.20),  # 20% weight
        ])

    @property
    def batch_size(self) -> int:
        universe_size = len(self.fetcher.priority_symbols)
        if universe_size == 0:
            return 0
        if self.symbol_limit is None:
            return universe_size
        return min(self.symbol_limit, universe_size)

    def _next_symbol_batch(self) -> List[str]:
        batch_size = self.batch_size
        symbols, state = self.universe_builder(self.settings, batch_size, self.rotation_state)
        self.rotation_state = dict(state)
        self.current_batch_symbols = list(symbols)
        return self.current_batch_symbols

    def is_market_hours(self) -> bool:
        """Check if market is currently open."""

        now = datetime.now()
        market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)
        return market_open <= now <= market_close

    def should_refresh_data(self) -> bool:
        """Determine whether cached option data is too stale to use."""

        ttl = self.cache_ttl_seconds
        freshness = self.data_freshness or {}

        # No prior data – force a refresh so we do not operate on an empty cache.
        if not freshness and self.last_fetch_time is None:
            return True

        now = datetime.now(timezone.utc)

        # Respect the configured cache TTL when available.
        if ttl > 0:
            if self.last_fetch_time is not None:
                last_fetch = self.last_fetch_time
                if last_fetch.tzinfo is None:
                    last_fetch = last_fetch.replace(tzinfo=timezone.utc)
                if (now - last_fetch).total_seconds() > ttl:
                    return True

            age_minutes = freshness.get("cacheAgeMinutes")
            if isinstance(age_minutes, (int, float)) and isfinite(age_minutes):
                if age_minutes * 60 > ttl:
                    return True

            timestamp = freshness.get("cacheTimestamp")
            if isinstance(timestamp, str):
                try:
                    parsed = datetime.fromisoformat(timestamp)
                except ValueError:
                    parsed = None
                if parsed is not None:
                    if parsed.tzinfo is None:
                        parsed = parsed.replace(tzinfo=timezone.utc)
                    if (now - parsed).total_seconds() > ttl:
                        return True

        # Explicit cache metadata indicating staleness.
        if freshness.get("cacheStale") is True:
            return True

        # Ensure we have contracts that have not yet expired.
        has_future_contracts = freshness.get("hasFutureContracts")
        if has_future_contracts is False:
            return True

        return False

    def _filter_current_contracts(self, options_data: pd.DataFrame) -> pd.DataFrame:
        """Remove expired contracts so analysis focuses on actionable trades."""

        if options_data is None or options_data.empty or "expiration" not in options_data.columns:
            return options_data

        expirations = pd.to_datetime(options_data["expiration"], errors="coerce", utc=True)
        if expirations.empty:
            return options_data

        now = pd.Timestamp.now(tz=timezone.utc)
        mask = expirations.notna()
        mask &= (expirations - now).dt.total_seconds() >= -60

        # Drop contracts where the expiration could not be parsed or is in the distant past.
        filtered = options_data.loc[mask].copy()
        return filtered

    def get_current_options_data(
        self,
        symbols: Sequence[str],
        *,
        force_refresh: bool = False,
    ) -> pd.DataFrame | None:
        """Get current options data, using cache if appropriate."""

        if not symbols:
            return None

        normalized_symbols = [str(sym).upper().strip() for sym in symbols if sym]

        refresh_needed = force_refresh or self.should_refresh_data()

        data = self.fetcher.get_fresh_options_data(
            use_cache=not refresh_needed,
            max_symbols=self.symbol_limit,
            symbols=normalized_symbols,
        )

        # When we explicitly bypass the cache and fail to fetch fresh data,
        # fall back to whatever cached snapshot we can recover.
        if data is None and refresh_needed:
            data = self.fetcher.get_fresh_options_data(
                use_cache=True,
                max_symbols=self.symbol_limit,
                symbols=normalized_symbols,
            )

        self._capture_data_freshness(data, normalized_symbols)

        return data

    def _capture_data_freshness(self, data: pd.DataFrame | None, symbols: Sequence[str]) -> None:
        if data is None:
            self.data_freshness = None
            return

        attrs = getattr(data, "attrs", {})
        freshness: Dict[str, Any] = {}

        age = attrs.get("cache_age_minutes")
        if isinstance(age, (int, float)) and isfinite(age):
            freshness["cacheAgeMinutes"] = float(age)

        timestamp = attrs.get("cache_timestamp")
        if isinstance(timestamp, str):
            freshness["cacheTimestamp"] = timestamp

        source = attrs.get("cache_source")
        if isinstance(source, str):
            freshness["dataSource"] = source

        stale = attrs.get("cache_stale")
        if isinstance(stale, bool):
            freshness["cacheStale"] = stale

        cache_hit = attrs.get("cache_used")
        if isinstance(cache_hit, bool):
            freshness["cacheHit"] = cache_hit

        has_future_attr = attrs.get("cache_has_future_contracts")
        if isinstance(has_future_attr, bool):
            freshness["hasFutureContracts"] = has_future_attr

        if symbols:
            freshness["requestedSymbols"] = list(symbols)

        if "expiration" in data.columns:
            expirations = pd.to_datetime(data["expiration"], errors="coerce", utc=True)
            if not expirations.empty:
                today = pd.Timestamp.now(tz=timezone.utc)
                future_mask = expirations.notna()
                future_days = ((expirations[future_mask] - today).dt.total_seconds() / 86400.0).tolist()
                has_future = any(day >= 0 for day in future_days)
                freshness["hasFutureContracts"] = has_future
                if future_days:
                    non_negative = [day for day in future_days if day >= 0]
                    if non_negative:
                        freshness["minFutureDte"] = min(non_negative)

        self.data_freshness = freshness if freshness else None
        self.last_fetch_time = datetime.now(timezone.utc)

    def _apply_freshness_metadata(self, metadata: Dict[str, Any]) -> None:
        if not self.data_freshness:
            return

        metadata["dataFreshness"] = dict(self.data_freshness)

        source = self.data_freshness.get("dataSource")
        if isinstance(source, str):
            metadata["source"] = source

        age = self.data_freshness.get("cacheAgeMinutes")
        if isinstance(age, (int, float)) and isfinite(age):
            metadata["cacheAgeMinutes"] = float(age)

        stale = self.data_freshness.get("cacheStale")
        if isinstance(stale, bool):
            metadata["cacheStale"] = stale

        cache_hit = self.data_freshness.get("cacheHit")
        if isinstance(cache_hit, bool):
            metadata["cacheHit"] = cache_hit

        has_future = self.data_freshness.get("hasFutureContracts")
        if isinstance(has_future, bool):
            metadata["hasFutureContracts"] = has_future

        min_future = self.data_freshness.get("minFutureDte")
        if isinstance(min_future, (int, float)) and isfinite(min_future):
            metadata["minFutureDte"] = float(min_future)

    def _serialize_swing_signal(self, signal: SwingSignal) -> Dict[str, Any]:
        return {
            "symbol": signal.symbol,
            "compositeScore": round(signal.composite_score, 2),
            "classification": signal.classification,
            "factors": [
                {
                    "name": factor.name,
                    "score": round(factor.score, 2),
                    "rationale": factor.rationale,
                    "details": factor.details,
                }
                for factor in signal.factors
            ],
            "metadata": signal.metadata,
        }

    def _swing_signal_for(self, symbol: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        normalized = str(symbol).upper()
        if normalized in self._swing_signal_cache:
            return self._swing_signal_cache[normalized], self._swing_error_cache.get(normalized)

        if self.swing_analyzer is None:
            self.swing_analyzer = SwingSignalAnalyzer()

        try:
            signal = self.swing_analyzer.analyze(normalized)
        except Exception as exc:  # noqa: BLE001
            message = str(exc)
            self._swing_signal_cache[normalized] = None
            self._swing_error_cache[normalized] = message
            print(
                f"⚠️  Swing analyzer unavailable for {normalized}: {message}",
                file=sys.stderr,
            )
            return None, message

        payload = self._serialize_swing_signal(signal)
        self._swing_signal_cache[normalized] = payload
        if normalized in self._swing_error_cache:
            self._swing_error_cache.pop(normalized, None)
        return payload, None

    def analyze_opportunities(self, options_data: pd.DataFrame | None) -> List[Dict[str, Any]]:
        """Analyze options data for opportunities."""

        if options_data is None or options_data.empty:
            return []

        working_data = self._filter_current_contracts(options_data).copy()
        if working_data.empty:
            print("⚠️  No non-expired options available after filtering", file=sys.stderr)
            return []
        numeric_columns = [
            "volume",
            "openInterest",
            "lastPrice",
            "bid",
            "ask",
            "impliedVolatility",
            "stockPrice",
        ]
        for col in numeric_columns:
            if col in working_data.columns:
                working_data[col] = pd.to_numeric(working_data[col], errors="coerce")

        liquid_options = working_data[
            (working_data["volume"] > 200)
            & (working_data["openInterest"] > 1000)
            & (working_data["lastPrice"] > 0.25)
            & (working_data["bid"] > 0)
            & (working_data["ask"] > 0)
        ].copy()

        print(f"📊 Analyzing {len(liquid_options)} liquid options...", file=sys.stderr)

        # Pre-fetch price history for all unique symbols to avoid repeated yfinance calls
        unique_symbols = liquid_options["symbol"].unique().tolist()
        print(f"📥 Pre-fetching price history for {len(unique_symbols)} symbols...", file=sys.stderr)
        price_history_cache: Dict[str, pd.DataFrame] = {}
        for symbol in unique_symbols:
            try:
                price_history = yf.download(symbol, period="30d", interval="1d", progress=False, auto_adjust=True)
                if not price_history.empty:
                    # Flatten MultiIndex columns if present
                    if isinstance(price_history.columns, pd.MultiIndex):
                        price_history.columns = price_history.columns.get_level_values(0)
                    # Normalize column names to lowercase
                    price_history.columns = [col.lower() for col in price_history.columns]
                    price_history_cache[symbol] = price_history
            except Exception as e:
                print(f"⚠️  Could not fetch price history for {symbol}: {e}", file=sys.stderr)
        print(f"✅ Cached price history for {len(price_history_cache)} symbols", file=sys.stderr)

        opportunities: List[Dict[str, Any]] = []
        fallback_candidates: List[Dict[str, Any]] = []
        for _, option in liquid_options.iterrows():
            returns_analysis, metrics = self.calculate_returns_analysis(option)
            probability_score = self.calculate_probability_score(option, metrics)
            score = self.calculate_opportunity_score(option, metrics, probability_score)

            # Focus on probability of profit rather than extreme upside
            probability_percent = self.estimate_probability_percent(probability_score)
            expected_roi = metrics["expectedMoveRoiPercent"]  # 1 SD move (realistic)

            # Define quality thresholds - prioritize probable winners
            high_probability = probability_percent >= 35  # Good chance of profit (lowered from 40)
            reasonable_return = expected_roi >= 20  # 20% return on 1 SD move (lowered from 25)

            # Quality criteria: High score + reasonable probability + decent expected returns
            # Removed the "high_asymmetry" path that surfaced lottery tickets
            quality_setup = (
                expected_roi > 0
                and score >= 65  # Lowered from 70
                and high_probability
                and reasonable_return
            )

            # Relaxed criteria used as a safety net when nothing meets the strict filter
            relaxed_setup = (
                not quality_setup
                and expected_roi >= 10
                and probability_percent >= 18
                and score >= 60
            )

            if not quality_setup and not relaxed_setup:
                continue

            volume_ratio = float(option["volume"] / max(option["openInterest"], 1))
            spread_pct = (option["ask"] - option["bid"]) / max(option["lastPrice"], 0.01)

            swing_signal, swing_error = self._swing_signal_for(option["symbol"])

            # Calculate directional bias to help choose between calls and puts
            directional_bias = self.calculate_directional_bias(option, swing_signal)

            # Calculate ENHANCED directional bias using new signal framework
            # Get full options chain for this symbol
            symbol_options_chain = working_data[working_data["symbol"] == option["symbol"]].copy()
            enhanced_bias = self.calculate_enhanced_directional_bias(
                option["symbol"], option, symbol_options_chain, price_history_cache
            )

            preferred_option_type = self._preferred_option_type(enhanced_bias, directional_bias)
            if preferred_option_type and option["type"] != preferred_option_type:
                # Skip opportunities that conflict with the directional view
                continue

            # Calculate historical move context for validation
            try:
                dte = self.calculate_days_to_expiration(option["expiration"])
                direction = "up" if option["type"] == "call" else "down"
                target_move = abs(metrics["breakevenMovePercent"])
                historical_context = self.historical_moves.get_move_context(
                    symbol=option["symbol"],
                    target_move_pct=target_move,
                    timeframe_days=dte,
                    direction=direction,
                    current_price=float(option["stockPrice"]) if pd.notna(option["stockPrice"]) else None,
                )
            except Exception as e:
                # If historical analysis fails, continue without it
                print(f"Warning: Historical analysis failed for {option['symbol']}: {e}")
                historical_context = {
                    "available": False,
                    "message": f"Historical data unavailable: {str(e)}"
                }

            # Generate clear trade summary
            trade_summary = self.generate_trade_summary(option, metrics, returns_analysis)

            reasoning = self.generate_reasoning(
                option,
                score,
                metrics,
                probability_score,
                volume_ratio,
                spread_pct,
            )

            # Build catalysts/patterns based on new probability-focused criteria
            catalysts = []
            patterns = ["Liquidity Analysis", "Probability-Focused Analysis"]

            if probability_percent >= 50:
                catalysts.append("High Probability Setup (>50%)")
            elif probability_percent >= 40:
                catalysts.append("Good Probability (>40%)")

            if expected_roi >= 50:
                catalysts.append("Strong Expected Returns")
            elif expected_roi >= 30:
                catalysts.append("Solid Expected Returns")

            if volume_ratio > 1.5:
                catalysts.append("Unusual Volume Activity")

            if metrics["breakevenMovePercent"] < 4:
                patterns.append("Tight Breakeven")

            if enhanced_bias and abs(enhanced_bias.get("score", 0)) > 30:
                patterns.append("Strong Directional Signal")

            # Validate data quality before creating opportunity
            quality_report = self.validator.validate_option(option.to_dict())

            # Skip rejected AND low quality options - only HIGH/MEDIUM pass
            if quality_report.quality in [DataQuality.REJECTED, DataQuality.LOW]:
                print(f"⚠️  Rejected {option['symbol']} {option['type']} ${option['strike']} - Quality: {quality_report.quality.value}, Issues: {quality_report.issues}, Warnings: {quality_report.warnings}", file=sys.stderr)
                continue

            risk_reward_ratio = metrics["bestRoiPercent"] / 100 if metrics["bestRoiPercent"] > 0 else None

            opportunity = {
                "symbol": option["symbol"],
                "optionType": option["type"],
                "strike": round(float(option["strike"]), 2),
                "expiration": option["expiration"],
                "premium": round(float(option["lastPrice"]) * 100, 2),  # Per contract (100 shares)
                "tradeSummary": trade_summary,
                "bid": round(float(option["bid"]) * 100, 2),  # Per contract
                "ask": round(float(option["ask"]) * 100, 2),  # Per contract
                "volume": int(option["volume"]),
                "openInterest": int(option["openInterest"]),
                "impliedVolatility": round(float(option["impliedVolatility"]), 4) if pd.notna(option["impliedVolatility"]) else 0.0,
                "stockPrice": round(float(option["stockPrice"]), 2),
                "score": round(score, 1),  # Round to 1 decimal place
                "confidence": round(min(95, (score * 0.35) + (probability_percent * 0.65)), 1),
                "reasoning": reasoning,
                "catalysts": catalysts,
                "patterns": patterns,
                "riskLevel": self.assess_risk_level(option, metrics, probability_score),
                "potentialReturn": round(metrics["tenMoveRoiPercent"], 1),
                "potentialReturnAmount": round(metrics["tenMoveNetProfit"], 2),
                "maxReturn": round(metrics["bestRoiPercent"], 1),
                "maxReturnAmount": round(metrics["bestNetProfit"], 2),
                # New realistic scenario fields
                "expectedMoveReturn": round(metrics["expectedMoveRoiPercent"], 1),
                "expectedMoveAmount": round(metrics["expectedMoveNetProfit"], 2),
                "optimisticMoveReturn": round(metrics["optimisticMoveRoiPercent"], 1),
                "optimisticMoveAmount": round(metrics["optimisticMoveNetProfit"], 2),
                "expectedMove1SD": round(metrics["expectedMove1SD"], 2),
                "expectedMove2SD": round(metrics["expectedMove2SD"], 2),
                "maxLossPercent": 100.0,
                "maxLossAmount": round(metrics["costBasis"], 2),
                "maxLoss": round(metrics["costBasis"], 2),
                "breakeven": round(metrics["breakevenPrice"], 2),
                "breakevenPrice": round(metrics["breakevenPrice"], 2),
                "breakevenMovePercent": round(metrics["breakevenMovePercent"], 1),
                "ivRank": round(self.calculate_iv_rank(option), 1),
                "volumeRatio": round(volume_ratio, 2),
                "probabilityOfProfit": round(probability_percent, 1),
                "profitProbabilityExplanation": self.build_probability_explanation(
                    option,
                    metrics,
                    probability_percent,
                    volume_ratio,
                ),
                "riskRewardRatio": risk_reward_ratio,
                "shortTermRiskRewardRatio": (
                    metrics["tenMoveRoiPercent"] / 100 if metrics["tenMoveRoiPercent"] > 0 else None
                ),
                "greeks": self.calculate_greeks_approximation(option),
                "daysToExpiration": self.calculate_days_to_expiration(option["expiration"]),
                "returnsAnalysis": returns_analysis,
                "directionalBias": directional_bias,
                "enhancedDirectionalBias": enhanced_bias,  # New proprietary signal framework
                "historicalContext": historical_context,  # Empirical probability validation
                # Add data quality metadata
                "_dataQuality": {
                    "quality": quality_report.quality.value,
                    "score": quality_report.score,
                    "issues": quality_report.issues,
                    "warnings": quality_report.warnings,
                    "priceSource": option.get("_price_source", "unknown"),
                    "priceTimestamp": option.get("_price_timestamp"),
                    "priceAgeSeconds": option.get("_price_age_seconds"),
                },
            }
            if swing_signal is not None:
                opportunity["swingSignal"] = swing_signal
            if swing_error is not None:
                opportunity["swingSignalError"] = swing_error

            position_sizing = self._calculate_position_sizing(
                option,
                metrics,
                probability_percent,
                metrics.get("expectedMoveRoiPercent", 0.0),
                risk_reward_ratio,
                opportunity["riskLevel"],
                score,
            )
            if position_sizing:
                opportunity["positionSizing"] = position_sizing
            if not quality_setup:
                opportunity.setdefault("metadata", {})
                opportunity["metadata"]["selectionMode"] = "relaxed"
                fallback_candidates.append(opportunity)
            else:
                opportunities.append(opportunity)

        # Sort by expected value: probability * expected return (most likely to profit)
        # This replaces sorting by raw score which favored high-ROI lottery tickets
        def expected_value_key(item):
            prob = item.get("probabilityOfProfit", 0) / 100  # Convert to 0-1
            expected_return = item.get("expectedMoveReturn", 0)
            # Expected value = probability × return
            # Also factor in score for tie-breaking
            ev = (prob * expected_return) + (item.get("score", 0) * 0.1)
            return ev

        opportunities.sort(key=expected_value_key, reverse=True)

        if not opportunities and fallback_candidates:
            print(
                f"ℹ️  No opportunities met the strict filter – returning {len(fallback_candidates)} relaxed candidates",
                file=sys.stderr,
            )
            fallback_candidates.sort(key=expected_value_key, reverse=True)
            max_relaxed = 10
            opportunities = fallback_candidates[:max_relaxed]

        # Limit to top 20 opportunities to keep JSON manageable
        max_opportunities = 20
        if len(opportunities) > max_opportunities:
            print(f"📊 Limiting output to top {max_opportunities} of {len(opportunities)} opportunities", file=sys.stderr)
            opportunities = opportunities[:max_opportunities]

        return opportunities

    def _preferred_option_type(
        self,
        enhanced_bias: Optional[Dict[str, Any]],
        directional_bias: Optional[Dict[str, Any]],
    ) -> Optional[str]:
        """Determine the preferred option type based on directional signals.

        Uses the enhanced signal framework (more sophisticated multi-signal analysis).
        Returns "call" for bullish bias, "put" for bearish bias, or None for neutral.
        """

        # Prefer enhanced signal (it's more sophisticated with 4 signals vs legacy 1 signal)
        if enhanced_bias:
            direction = enhanced_bias.get("direction")
            if direction == "bullish":
                return "call"
            if direction == "bearish":
                return "put"

        # Fall back to legacy directional bias if enhanced not available
        if directional_bias:
            direction = directional_bias.get("direction")
            if direction == "bullish":
                return "call"
            if direction == "bearish":
                return "put"

        # No strong directional bias - allow all options through
        return None

    def calculate_opportunity_score(self, option: pd.Series, metrics: Mapping[str, float], probability_score: float) -> float:
        """Calculate opportunity score prioritizing probability of profit over extreme upside.

        Philosophy: We want trades that are LIKELY to make money, not lottery tickets.
        """

        score = 0.0

        # Liquidity scoring (max 18 points) - same as before
        volume_ratio = option["volume"] / max(option["openInterest"], 1)
        if volume_ratio > 4:
            score += 18
        elif volume_ratio > 3:
            score += 15
        elif volume_ratio > 2:
            score += 12
        elif volume_ratio > 1.5:
            score += 8

        # Spread quality (max 18 points) - same as before
        spread_pct = (option["ask"] - option["bid"]) / max(option["lastPrice"], 0.01)
        if spread_pct < 0.05:
            score += 18
        elif spread_pct < 0.1:
            score += 12
        elif spread_pct < 0.2:
            score += 6

        # CHANGED: Focus on EXPECTED returns (1 SD move), not theoretical max
        # This is what we can realistically expect ~68% of the time
        expected_roi = max(0.0, metrics["expectedMoveRoiPercent"])  # 1 SD move

        # Reward achievable returns (max 25 points, down from 35)
        # 100% expected return = 25 points, 200% = 25 points (capped)
        score += min(25, expected_roi / 4)

        # CHANGED: Probability is now the MOST important factor (max 35 points, up from ~20)
        # This is the core change - we want high-probability trades
        score += probability_score * 0.35  # probability_score is 0-100, so this gives 0-35 points

        # Bonus for tight breakeven (max 10 points) - new addition
        breakeven_move = abs(metrics["breakevenMovePercent"])
        if breakeven_move < 2:
            score += 10  # Very close to ITM
        elif breakeven_move < 4:
            score += 7
        elif breakeven_move < 6:
            score += 4

        # IV quality check (max 5 points)
        iv = option["impliedVolatility"]
        if pd.notna(iv):
            if 0.2 <= iv <= 0.6:
                score += 5
            elif iv > 0.8:
                score -= 3  # Penalize extremely high IV (usually means low prob of profit)

        return float(max(0.0, min(100.0, score)))

    def generate_trade_summary(self, option: pd.Series, metrics: Mapping[str, float], returns_analysis: List[Dict[str, Any]]) -> str:
        """Generate a clear, concise summary of what needs to happen for this trade to profit meaningfully.

        Instead of just showing breakeven, this shows the move needed for a decent profit (first profitable scenario).
        Example: "Stock needs to go UP by $1.74 (3.0%) to make $164 profit (12% return) within 1 week"
        """
        stock_price = float(option["stockPrice"])
        premium = float(option["lastPrice"])
        cost_basis = premium * 100
        dte = self.calculate_days_to_expiration(option["expiration"])
        option_type = option["type"].upper()

        # Time frame description
        if dte == 0:
            time_desc = "by market close TODAY"
        elif dte == 1:
            time_desc = "within 1 day"
        elif dte <= 7:
            time_desc = f"within {dte} days"
        else:
            weeks = dte // 7
            time_desc = f"within {weeks} week{'s' if weeks > 1 else ''}"

        # Find the first scenario with meaningful profit (at least 20% ROI)
        target_scenario = None
        for scenario in returns_analysis:
            move_pct = scenario.get("movePct", 0)  # Numeric move percentage

            # Ensure move_pct is numeric (defensive check)
            if not isinstance(move_pct, (int, float)):
                continue

            # Skip negative moves (wrong direction)
            if (option_type == "CALL" and move_pct < 0) or (option_type == "PUT" and move_pct > 0):
                continue

            roi = scenario["return"]
            if roi >= 20:  # At least 20% profit
                target_scenario = scenario
                break

        expected_move_1sd = metrics.get("expectedMove1SD")
        expected_move_pct = float(expected_move_1sd) if expected_move_1sd else 0.0

        if not target_scenario:
            # Fallback to breakeven if no profitable scenario found
            breakeven_price = metrics["breakevenPrice"]
            breakeven_move_pct = abs(metrics["breakevenMovePercent"])
            direction = "UP" if option_type == "CALL" else "DOWN"
            dollar_move_abs = abs(breakeven_price - stock_price)

            summary = (
                f"📊 Stock needs to go {direction} by ${dollar_move_abs:.2f} ({breakeven_move_pct:.1f}%) "
                f"to ${breakeven_price:.2f} {time_desc} to break even"
            )
            if expected_move_pct > 0:
                summary += f" (1σ ≈ {expected_move_pct:.1f}% move)"
            return summary

        # Calculate target price and dollar move
        move_pct = abs(target_scenario.get("movePct", 0))
        target_price = stock_price * (1 + target_scenario.get("movePct", 0) / 100)
        dollar_move = abs(target_price - stock_price)
        profit_amount = cost_basis * target_scenario["return"] / 100
        roi = target_scenario["return"]
        direction = "UP" if option_type == "CALL" else "DOWN"

        # Build meaningful profit summary
        summary = (
            f"📊 Stock needs to go {direction} by ${dollar_move:.2f} ({move_pct:.1f}%) "
            f"to ${target_price:.2f} {time_desc} for ${profit_amount:.0f} profit ({roi:.0f}% return)"
        )

        # Add context about feasibility
        if expected_move_pct > 0:
            summary += f" (1σ ≈ {expected_move_pct:.1f}% move)"
            if move_pct <= expected_move_pct * 0.5:
                summary += " ✓ Very achievable"
            elif move_pct <= expected_move_pct:
                summary += " ✓ Achievable"
            elif move_pct <= expected_move_pct * 1.5:
                summary += " ⚠ Requires favorable conditions"
            else:
                summary += " ⚠⚠ Requires exceptional move"

        return summary

    def generate_reasoning(
        self,
        option: pd.Series,
        score: float,
        metrics: Mapping[str, float],
        probability_score: float,
        volume_ratio: float,
        spread_pct: float,
    ) -> List[str]:
        """Generate natural language reasoning for the opportunity."""

        reasoning: List[str] = []

        if volume_ratio > 2:
            reasoning.append(f"Unusual demand with {volume_ratio:.1f}x open interest volume")

        if spread_pct < 0.1:
            reasoning.append("Tight bid/ask spread supporting fast entries and exits")

        breakeven_move = metrics["breakevenMovePercent"]
        if isfinite(breakeven_move):
            if breakeven_move <= 0:
                reasoning.append("Already trading beyond breakeven levels")
            else:
                abs_move = abs(breakeven_move)
                direction = "drop" if option["type"] == "put" else "gain"
                if abs_move <= 5:
                    reasoning.append(f"Requires only a {abs_move:.1f}% {direction} to break even")
                elif abs_move <= 8:
                    reasoning.append(f"Needs a manageable {abs_move:.1f}% {direction} to break even")

        if metrics["bestRoiPercent"] >= 200:
            reasoning.append(f"Models show {metrics['bestRoiPercent']:.0f}% upside on a strong move")

        probability_percent = self.estimate_probability_percent(probability_score)
        if probability_percent >= 65:
            reasoning.append(f"Probability model flags ~{probability_percent:.0f}% chance of profit")

        dte = self.calculate_days_to_expiration(option["expiration"])
        if dte > 0:
            reasoning.append(f"{dte} days until expiration provides time for the thesis to play out")

        if not reasoning:
            reasoning.append("Balanced mix of liquidity, upside, and probability")

        return reasoning

    def assess_risk_level(
        self,
        option: pd.Series,
        metrics: Mapping[str, float],
        probability_score: float,
    ) -> str:
        """Assess risk profile combining ROI potential and probability."""

        breakeven_move = metrics["breakevenMovePercent"]
        probability_percent = self.estimate_probability_percent(probability_score)
        abs_move = abs(breakeven_move)

        if breakeven_move <= 0 and probability_percent >= 65:
            return "low"
        if abs_move <= 5 and probability_percent >= 70:
            return "low"
        if metrics["bestRoiPercent"] >= 250 and probability_percent >= 55:
            return "medium"
        if option["lastPrice"] < 1.0 and probability_percent < 50:
            return "high"
        return "medium"

    def calculate_breakeven(self, option: pd.Series) -> float:
        """Calculate breakeven price."""

        if option["type"] == "call":
            return float(option["strike"] + option["lastPrice"])
        return float(option["strike"] - option["lastPrice"])

    def calculate_iv_rank(self, option: pd.Series) -> float:
        """Calculate IV rank using a 52-week percentile of historical observations."""

        raw_iv = option.get("impliedVolatility")
        if pd.isna(raw_iv):
            return 50.0

        try:
            current_iv = float(raw_iv)
        except (TypeError, ValueError):
            return 50.0

        if not isfinite(current_iv) or current_iv <= 0:
            return 50.0

        symbol = str(option.get("symbol", ""))
        percentile = self.iv_history.percentile(symbol, current_iv)
        if percentile is not None and isfinite(percentile):
            return float(percentile)

        # Fallback to simple scaling when no history is available.
        return float(max(0.0, min(100.0, current_iv * 100.0)))

    def calculate_probability_score(self, option: pd.Series, metrics: Mapping[str, float]) -> float:
        """Calculate real probability of profit using statistical methods.

        Uses Black-Scholes assumptions with implied volatility to estimate
        the probability that the option finishes in-the-money at expiration.
        """
        import math
        from scipy import stats

        breakeven_move_pct = metrics["breakevenMovePercent"]  # Keep sign! Positive = up, negative = down
        dte = self.calculate_days_to_expiration(option["expiration"])

        if dte <= 0:
            return 0.0

        # Use Implied Volatility (annualized) - this is what the market expects
        iv = float(option["impliedVolatility"]) if pd.notna(option["impliedVolatility"]) else 0.30

        # Convert annualized IV to expected move over the time period
        # Expected daily volatility = IV / sqrt(252 trading days)
        # Expected move over DTE = daily_vol * sqrt(DTE)
        daily_vol = iv / math.sqrt(252)
        expected_move_pct = daily_vol * math.sqrt(dte) * 100  # Convert to percentage

        # Calculate z-score: how many standard deviations is breakeven from current price
        if expected_move_pct == 0:
            z_score = 0
        else:
            # For calls: positive breakeven_move means stock needs to go UP
            # For puts: negative breakeven_move means stock needs to go DOWN (but we need abs for puts)
            # The key insight: we want probability of moving in the REQUIRED direction
            z_score = abs(breakeven_move_pct) / expected_move_pct

        # Probability stock moves at least |breakeven_move_pct| in the required direction
        # Since we're using abs(breakeven), this works for both calls and puts
        # This is the probability the move is >= z_score standard deviations from mean
        probability = 1 - stats.norm.cdf(z_score)

        # Convert to percentage and clamp to reasonable range
        return float(max(1.0, min(99.0, probability * 100)))

    def estimate_probability_percent(self, probability_score: float) -> float:
        """Return probability score directly - it's already a percentage now."""
        return float(probability_score)

    def build_probability_explanation(
        self,
        option: pd.Series,
        metrics: Mapping[str, float],
        probability_percent: float,
        volume_ratio: float,
    ) -> str:
        explanation_parts: List[str] = []

        breakeven_move = metrics["breakevenMovePercent"]
        if breakeven_move <= 0:
            move_text = "Already beyond breakeven with supportive flow"
        else:
            direction = "drop" if option["type"] == "put" else "gain"
            move_text = (
                f"Needs {abs(breakeven_move):.1f}% {direction} with {volume_ratio:.1f}x volume/interest support"
            )
        explanation_parts.append(move_text)

        dte = self.calculate_days_to_expiration(option["expiration"])
        if dte:
            explanation_parts.append(f"{dte} days to expiration")

        iv = option["impliedVolatility"]
        if pd.notna(iv):
            explanation_parts.append(
                f"IV at {iv:.0%} provides {'amplified' if iv > 0.4 else 'controlled'} pricing"
            )

        explanation_parts.append(f"Modeled probability ≈ {probability_percent:.0f}%")

        return ". ".join(explanation_parts)

    def calculate_greeks_approximation(self, option: pd.Series) -> Dict[str, float]:
        """Calculate Greeks using Black-Scholes model."""
        import math
        from scipy import stats

        stock_price = float(option["stockPrice"])
        strike = float(option["strike"])
        iv = float(option["impliedVolatility"]) if pd.notna(option["impliedVolatility"]) else 0.3
        dte = max(self.calculate_days_to_expiration(option["expiration"]), 1)

        # Time to expiration in years
        T = dte / 365.0
        # Risk-free rate (approximate current rate)
        r = 0.045

        # Black-Scholes d1 and d2
        d1 = (math.log(stock_price / strike) + (r + 0.5 * iv ** 2) * T) / (iv * math.sqrt(T))
        d2 = d1 - iv * math.sqrt(T)

        # Calculate Greeks
        if option["type"] == "call":
            delta = stats.norm.cdf(d1)
        else:
            delta = stats.norm.cdf(d1) - 1  # Put delta is negative

        # Gamma is same for calls and puts
        gamma = stats.norm.pdf(d1) / (stock_price * iv * math.sqrt(T))

        # Theta (per day, not per year)
        if option["type"] == "call":
            theta = (-(stock_price * stats.norm.pdf(d1) * iv) / (2 * math.sqrt(T))
                    - r * strike * math.exp(-r * T) * stats.norm.cdf(d2)) / 365
        else:
            theta = (-(stock_price * stats.norm.pdf(d1) * iv) / (2 * math.sqrt(T))
                    + r * strike * math.exp(-r * T) * stats.norm.cdf(-d2)) / 365

        # Vega (per 1% change in IV)
        vega = stock_price * stats.norm.pdf(d1) * math.sqrt(T) / 100

        return {
            "delta": float(delta),
            "gamma": float(gamma),
            "theta": float(theta),
            "vega": float(vega),
        }

    def calculate_enhanced_directional_bias(
        self, symbol: str, option: pd.Series, options_chain: pd.DataFrame, price_history_cache: Optional[Dict[str, pd.DataFrame]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Calculate enhanced directional bias using the new signal framework.

        Args:
            symbol: Stock symbol
            option: Current option being analyzed
            options_chain: Full options chain for the symbol (for skew analysis)
            price_history_cache: Optional pre-fetched price history cache to avoid repeated API calls

        Returns:
            Dictionary with directional prediction or None if insufficient data
        """
        try:
            stock_price = float(option.get("stockPrice", 0))
            if stock_price <= 0:
                return None

            # Calculate ATM IV for skew analysis
            atm_iv = float(option.get("impliedVolatility", 0))

            # Get historical volume data (simplified - using current as proxy)
            call_options = options_chain[options_chain["type"] == "call"]
            put_options = options_chain[options_chain["type"] == "put"]

            avg_call_volume = call_options["volume"].mean() if not call_options.empty else 1
            avg_put_volume = put_options["volume"].mean() if not put_options.empty else 1

            historical_volume = {
                "avg_call_volume": float(avg_call_volume * 0.7),  # Assume current is 30% above avg
                "avg_put_volume": float(avg_put_volume * 0.7),
                "call_volume_std": float(avg_call_volume * 0.3),
                "put_volume_std": float(avg_put_volume * 0.3),
            }

            # Use cached price history if available, otherwise fetch it
            price_history = pd.DataFrame()
            price_change = 0.0

            if price_history_cache and symbol in price_history_cache:
                # Use pre-fetched price history from cache
                price_history = price_history_cache[symbol]
                if not price_history.empty and len(price_history) >= 2:
                    # Calculate price change from previous close
                    closes = price_history["close"].values
                    price_change = ((closes[-1] - closes[-2]) / closes[-2]) * 100
            else:
                # Fallback: fetch if not in cache (shouldn't happen with pre-fetching)
                try:
                    price_history = yf.download(symbol, period="30d", interval="1d", progress=False, auto_adjust=True)
                    if not price_history.empty and len(price_history) >= 2:
                        # Flatten MultiIndex columns if present
                        if isinstance(price_history.columns, pd.MultiIndex):
                            price_history.columns = price_history.columns.get_level_values(0)

                        # Normalize column names to lowercase
                        price_history.columns = [col.lower() for col in price_history.columns]

                        # Calculate price change from previous close
                        closes = price_history["close"].values
                        price_change = ((closes[-1] - closes[-2]) / closes[-2]) * 100
                except Exception as e:
                    print(f"Warning: Could not fetch price history for {symbol}: {e}")

            # Prepare data for signal aggregator
            signal_data = {
                "options_chain": options_chain,
                "options_data": options_chain,
                "stock_price": stock_price,
                "atm_iv": atm_iv,
                "historical_volume": historical_volume,
                "price_change": price_change,
                "price_history": price_history,  # For regime detection
            }

            # Calculate directional score using signal aggregator
            directional_score = self.signal_aggregator.aggregate(symbol, signal_data)

            # Get detailed breakdown
            breakdown = self.signal_aggregator.get_signal_breakdown(directional_score)

            # Convert to format compatible with existing code
            return {
                "direction": directional_score.direction.value,
                "confidence": round(directional_score.confidence, 2),
                "score": round(directional_score.score, 2),
                "recommendation": directional_score.recommendation,
                "signals": breakdown["signals"],
                "timestamp": directional_score.timestamp.isoformat(),
            }

        except Exception as e:
            print(f"Error calculating enhanced directional bias for {symbol}: {e}")
            return None

    def calculate_directional_bias(self, option: pd.Series, swing_signal: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate directional bias to help users choose between calls and puts on the same symbol.

        Returns a dict with:
        - direction: "bullish", "bearish", or "neutral"
        - confidence: 0-100 score for the directional conviction
        - signals: breakdown of contributing factors
        - recommendation: which option type aligns with the bias
        """

        signals = {}
        relevant_metrics: List[Dict[str, object]] = []
        bullish_score = 0.0
        bearish_score = 0.0

        # 1. Momentum from swing signal (strongest indicator)
        if swing_signal:
            factors = {f["name"]: f for f in swing_signal.get("factors", [])}

            # Momentum breakout factor
            if "Momentum Breakout" in factors:
                momentum_factor = factors["Momentum Breakout"]
                momentum_zscore = momentum_factor.get("details", {}).get("momentum_zscore", 0)

                if momentum_zscore > 1.5:
                    bullish_score += 30
                    signals["momentum"] = f"Strong bullish momentum ({momentum_zscore:.2f} σ above mean)"
                    relevant_metrics.append(
                        {
                            "factor": "Momentum Breakout",
                            "reading": f"{momentum_zscore:.2f}σ",
                            "supports": "calls",
                            "implication": "Price is accelerating higher; call positions align with the prevailing trend.",
                        }
                    )
                elif momentum_zscore > 0.5:
                    bullish_score += 15
                    signals["momentum"] = f"Moderate bullish momentum ({momentum_zscore:.2f} σ above mean)"
                    relevant_metrics.append(
                        {
                            "factor": "Momentum Breakout",
                            "reading": f"{momentum_zscore:.2f}σ",
                            "supports": "calls",
                            "implication": "Upward momentum is building, increasing odds the stock keeps rising.",
                        }
                    )
                elif momentum_zscore < -1.5:
                    bearish_score += 30
                    signals["momentum"] = f"Strong bearish momentum ({momentum_zscore:.2f} σ below mean)"
                    relevant_metrics.append(
                        {
                            "factor": "Momentum Breakout",
                            "reading": f"{momentum_zscore:.2f}σ",
                            "supports": "puts",
                            "implication": "Momentum is sharply lower; put setups benefit if the downtrend continues.",
                        }
                    )
                elif momentum_zscore < -0.5:
                    bearish_score += 15
                    signals["momentum"] = f"Moderate bearish momentum ({momentum_zscore:.2f} σ below mean)"
                    relevant_metrics.append(
                        {
                            "factor": "Momentum Breakout",
                            "reading": f"{momentum_zscore:.2f}σ",
                            "supports": "puts",
                            "implication": "Price is drifting lower; puts gain if weakness persists.",
                        }
                    )
                else:
                    signals["momentum"] = f"Neutral momentum ({momentum_zscore:.2f} σ)"

            # News sentiment
            if "News & Catalysts" in factors:
                news_factor = factors["News & Catalysts"]
                avg_sentiment = news_factor.get("details", {}).get("average_sentiment", 0)

                if avg_sentiment > 0.3:
                    bullish_score += 20
                    signals["news"] = f"Positive news sentiment ({avg_sentiment:.2f})"
                    relevant_metrics.append(
                        {
                            "factor": "News & Catalysts",
                            "reading": f"score {avg_sentiment:.2f}",
                            "supports": "calls",
                            "implication": "Recent headlines skew bullish, often preceding upward reactions.",
                        }
                    )
                elif avg_sentiment > 0.1:
                    bullish_score += 10
                    signals["news"] = f"Slightly positive news ({avg_sentiment:.2f})"
                    relevant_metrics.append(
                        {
                            "factor": "News & Catalysts",
                            "reading": f"score {avg_sentiment:.2f}",
                            "supports": "calls",
                            "implication": "Mildly constructive news bias provides incremental support to bullish trades.",
                        }
                    )
                elif avg_sentiment < -0.3:
                    bearish_score += 20
                    signals["news"] = f"Negative news sentiment ({avg_sentiment:.2f})"
                    relevant_metrics.append(
                        {
                            "factor": "News & Catalysts",
                            "reading": f"score {avg_sentiment:.2f}",
                            "supports": "puts",
                            "implication": "News flow is negative, which can pressure the stock lower in the near term.",
                        }
                    )
                elif avg_sentiment < -0.1:
                    bearish_score += 10
                    signals["news"] = f"Slightly negative news ({avg_sentiment:.2f})"
                    relevant_metrics.append(
                        {
                            "factor": "News & Catalysts",
                            "reading": f"score {avg_sentiment:.2f}",
                            "supports": "puts",
                            "implication": "Headlines tilt bearish, adding weight to downside thesis.",
                        }
                    )
                else:
                    signals["news"] = "Neutral news sentiment"

            # Volatility expansion (benefits both directions but more for options aligned with momentum)
            if "Volatility Expansion" in factors:
                vol_factor = factors["Volatility Expansion"]
                atr_ratio = vol_factor.get("details", {}).get("atr_ratio", 1.0)

                if atr_ratio > 1.3:
                    signals["volatility"] = f"High volatility ({atr_ratio:.1f}x baseline) - favors strong moves"
                    relevant_metrics.append(
                        {
                            "factor": "Volatility Expansion",
                            "reading": f"{atr_ratio:.2f}x",
                            "supports": "both",
                            "implication": "Larger swings amplify both gains and losses—manage risk sizing carefully.",
                        }
                    )
                elif atr_ratio > 1.1:
                    signals["volatility"] = f"Elevated volatility ({atr_ratio:.1f}x baseline)"
                    relevant_metrics.append(
                        {
                            "factor": "Volatility Expansion",
                            "reading": f"{atr_ratio:.2f}x",
                            "supports": "both",
                            "implication": "Somewhat larger moves expected; directional trades can reach targets faster.",
                        }
                    )
                else:
                    signals["volatility"] = f"Normal volatility ({atr_ratio:.1f}x baseline)"
                    relevant_metrics.append(
                        {
                            "factor": "Volatility Expansion",
                            "reading": f"{atr_ratio:.2f}x",
                            "supports": "either",
                            "implication": "Volatility in line with norms; rely on directional signals for edge.",
                        }
                    )

            if "Market Regime" in factors:
                market_factor = factors["Market Regime"]
                context = market_factor.get("details", {})
                vix_ratio = context.get("vix_ratio")
                spy_return = context.get("spy_return_5d")
                parts = []
                if vix_ratio is not None:
                    parts.append(f"VIX {vix_ratio:.1f}x avg")
                if spy_return is not None:
                    parts.append(f"SPY {spy_return:+.2%} (5d)")

                if spy_return is not None and spy_return > 0.01:
                    market_supports = "calls"
                    market_message = "Market tailwind for bullish trades"
                elif spy_return is not None and spy_return < -0.01:
                    market_supports = "puts"
                    market_message = "Market selling pressure favors protective puts"
                else:
                    market_supports = "both"
                    market_message = "Market backdrop neutral"

                signals["market"] = f"{' / '.join(parts) if parts else 'Market data limited'} - {market_message}"
                relevant_metrics.append(
                    {
                        "factor": "Market Regime",
                        "reading": context,
                        "supports": market_supports,
                        "implication": market_message,
                    }
                )

        # 2. Price relative to strike (moneyness)
        stock_price = float(option["stockPrice"])
        strike = float(option["strike"])
        option_type = option["type"]

        moneyness = (stock_price - strike) / stock_price

        if option_type == "call":
            if moneyness > 0.05:  # Deep ITM call
                signals["moneyness"] = "Deep ITM - stock well above strike"
            elif moneyness > 0:
                signals["moneyness"] = "ITM - stock above strike"
            elif moneyness > -0.05:
                signals["moneyness"] = "Near ATM - close to strike"
            else:
                signals["moneyness"] = "OTM - stock below strike"
        else:  # put
            if moneyness < -0.05:  # Deep ITM put
                signals["moneyness"] = "Deep ITM - stock well below strike"
            elif moneyness < 0:
                signals["moneyness"] = "ITM - stock below strike"
            elif moneyness < 0.05:
                signals["moneyness"] = "Near ATM - close to strike"
            else:
                signals["moneyness"] = "OTM - stock above strike"

        # 3. Greeks alignment
        greeks = self.calculate_greeks_approximation(option)
        delta = greeks.get("delta", 0)

        if option_type == "call" and delta > 0.7:
            signals["delta"] = f"High delta ({delta:.2f}) - moves strongly with stock"
            relevant_metrics.append(
                {
                    "factor": "Delta",
                    "reading": f"{delta:.2f}",
                    "supports": "calls",
                    "implication": "Contract already behaves like stock; smaller moves can translate into gains.",
                }
            )
        elif option_type == "put" and delta < -0.7:
            signals["delta"] = f"High delta ({abs(delta):.2f}) - moves strongly with stock"
            relevant_metrics.append(
                {
                    "factor": "Delta",
                    "reading": f"{delta:.2f}",
                    "supports": "puts",
                    "implication": "Contract reacts sharply to downside moves, boosting put responsiveness.",
                }
            )
        elif abs(delta) > 0.3:
            signals["delta"] = f"Moderate delta ({abs(delta):.2f})"
            relevant_metrics.append(
                {
                    "factor": "Delta",
                    "reading": f"{delta:.2f}",
                    "supports": "both",
                    "implication": "Moderate delta provides balance between leverage and responsiveness.",
                }
            )
        else:
            signals["delta"] = f"Low delta ({abs(delta):.2f}) - needs large move"
            relevant_metrics.append(
                {
                    "factor": "Delta",
                    "reading": f"{delta:.2f}",
                    "supports": "either",
                    "implication": "Low delta requires substantial underlying movement before option reacts.",
                }
            )

        # Determine overall direction
        net_score = bullish_score - bearish_score

        if net_score > 20:
            direction = "bullish"
            confidence = min(100, 50 + net_score)
        elif net_score < -20:
            direction = "bearish"
            confidence = min(100, 50 - net_score)
        else:
            direction = "neutral"
            confidence = 50 - abs(net_score) / 2

        # Recommendation based on direction and option type
        if direction == "bullish":
            if option_type == "call":
                alignment = "aligned"
                recommendation = "✓ Bullish bias supports this CALL"
            else:
                alignment = "opposed"
                recommendation = "⚠ Bullish bias opposes this PUT"
        elif direction == "bearish":
            if option_type == "call":
                alignment = "opposed"
                recommendation = "⚠ Bearish bias opposes this CALL"
            else:
                alignment = "aligned"
                recommendation = "✓ Bearish bias supports this PUT"
        else:
            alignment = "neutral"
            recommendation = f"↔ Neutral bias - {option_type.upper()} not strongly favored or opposed"

        return {
            "direction": direction,
            "confidence": round(confidence, 1),
            "alignment": alignment,
            "recommendation": recommendation,
            "signals": signals,
            "relevantMetrics": relevant_metrics,
            "scores": {
                "bullish": round(bullish_score, 1),
                "bearish": round(bearish_score, 1),
                "net": round(net_score, 1),
            }
        }

    def calculate_days_to_expiration(self, expiration_date: Any) -> int:
        """Calculate days to expiration."""

        try:
            exp_date = pd.to_datetime(expiration_date)
            days = (exp_date - datetime.now()).days
            return max(int(days), 0)
        except Exception:
            return 30

    def calculate_returns_analysis(self, option: pd.Series) -> tuple[List[Dict[str, Any]], Dict[str, float]]:
        """Return ROI scenarios (in percent) and supporting metrics.

        Uses realistic price move expectations based on:
        - Days to expiration (DTE)
        - Implied volatility (IV)
        - Historical typical moves
        """
        import math

        stock_price = float(option["stockPrice"])
        strike = float(option["strike"])
        premium = float(option["lastPrice"])
        cost_basis = premium * 100
        breakeven_price = self.calculate_breakeven(option)

        if option["type"] == "call":
            breakeven_move_pct = ((breakeven_price - stock_price) / max(stock_price, 0.01)) * 100
        else:
            breakeven_move_pct = ((stock_price - breakeven_price) / max(stock_price, 0.01)) * 100

        # Calculate realistic expected move based on DTE and IV
        dte = self.calculate_days_to_expiration(option["expiration"])
        iv = float(option["impliedVolatility"]) if pd.notna(option["impliedVolatility"]) else 0.30

        # Expected move formula: IV * sqrt(DTE/365)
        # This gives us the 1 standard deviation expected move
        expected_move_1sd = iv * math.sqrt(max(dte, 1) / 365.0)

        # Cap scenarios at realistic levels based on time frame
        # The longer the DTE, the more movement is possible, but we still need to be realistic
        # This prevents showing 100%+ moves that would almost never happen
        if dte <= 3:
            max_reasonable_move = 0.05  # 5% max for 0-3 DTE (intraday/overnight)
        elif dte <= 7:
            max_reasonable_move = 0.10  # 10% max for weekly options
        elif dte <= 30:
            max_reasonable_move = 0.15  # 15% max for monthly options
        else:
            max_reasonable_move = 0.20  # 20% max for longer-dated (rare but possible)

        # For very short-dated options (0-3 DTE), use minimum realistic scenarios
        if dte <= 3:
            # Intraday/overnight scenarios - much smaller moves
            moves = [
                max(-max_reasonable_move, -expected_move_1sd * 1.5),  # ~1.5 SD down (capped)
                max(-max_reasonable_move, -expected_move_1sd),         # 1 SD down (capped)
                max(-max_reasonable_move, -expected_move_1sd * 0.5),   # 0.5 SD down
                -0.01,                                                  # Small move down
                0.0,                                                    # No move
                0.01,                                                   # Small move up
                min(max_reasonable_move, expected_move_1sd * 0.5),     # 0.5 SD up
                min(max_reasonable_move, expected_move_1sd),           # 1 SD up (capped)
                min(max_reasonable_move, expected_move_1sd * 1.5),     # ~1.5 SD up (capped)
            ]
        elif dte <= 7:
            # Weekly scenarios - moderate moves
            moves = [
                max(-max_reasonable_move, -expected_move_1sd * 2),     # 2 SD down (capped)
                max(-max_reasonable_move, -expected_move_1sd * 1.5),   # 1.5 SD down (capped)
                max(-max_reasonable_move, -expected_move_1sd),         # 1 SD down (capped)
                -0.02,                                                  # Small move down
                0.0,                                                    # No move
                0.02,                                                   # Small move up
                min(max_reasonable_move, expected_move_1sd),           # 1 SD up (capped)
                min(max_reasonable_move, expected_move_1sd * 1.5),     # 1.5 SD up (capped)
                min(max_reasonable_move, expected_move_1sd * 2),       # 2 SD up (capped)
            ]
        else:
            # Monthly+ scenarios - cap at 2 SD max (no more 2.5 SD scenarios)
            moves = [
                max(-max_reasonable_move, -expected_move_1sd * 2),     # 2 SD down (capped)
                max(-max_reasonable_move, -expected_move_1sd * 1.5),   # 1.5 SD down (capped)
                max(-max_reasonable_move, -expected_move_1sd),         # 1 SD down (capped)
                -0.03,                                                  # Small move down
                0.0,                                                    # No move
                0.03,                                                   # Small move up
                min(max_reasonable_move, expected_move_1sd),           # 1 SD up (capped)
                min(max_reasonable_move, expected_move_1sd * 1.5),     # 1.5 SD up (capped)
                min(max_reasonable_move, expected_move_1sd * 2),       # 2 SD up (capped - removed 2.5 SD)
            ]

        scenarios: List[Dict[str, Any]] = []
        scenario_metrics: List[Dict[str, float]] = []

        for move in moves:
            target_price = stock_price * (1 + move)
            if option["type"] == "call":
                intrinsic = max(0.0, target_price - strike)
            else:
                intrinsic = max(0.0, strike - target_price)

            payoff = intrinsic * 100
            net_profit = payoff - cost_basis
            roi_percent = (net_profit / cost_basis) * 100 if cost_basis else 0.0

            # Format move percentage with proper sign
            move_pct = move * 100
            move_str = f"{move_pct:+.1f}%" if move != 0 else "0%"
            scenarios.append({"move": move_str, "movePct": move_pct, "return": roi_percent})
            scenario_metrics.append(
                {
                    "move": move,
                    "roi_percent": roi_percent,
                    "net_profit": net_profit,
                    "target_price": target_price,
                }
            )

        best = max(scenario_metrics, key=lambda item: item["roi_percent"]) if scenario_metrics else {
            "roi_percent": 0.0,
            "net_profit": 0.0,
            "move": moves[0],
        }

        # Use 1 standard deviation move as the "realistic target" instead of arbitrary 10%
        # This is statistically what we'd expect ~68% of the time
        one_sd_target = expected_move_1sd if option["type"] == "call" else -expected_move_1sd
        one_sd_move = min(
            scenario_metrics,
            key=lambda item: abs(item["move"] - one_sd_target),
            default={"roi_percent": 0.0, "net_profit": 0.0}
        ) if scenario_metrics else {"roi_percent": 0.0, "net_profit": 0.0}

        # Use 2 standard deviation move as the "optimistic scenario" (~95% probability range)
        two_sd_target = expected_move_1sd * 2 if option["type"] == "call" else -expected_move_1sd * 2
        two_sd_move = min(
            scenario_metrics,
            key=lambda item: abs(item["move"] - two_sd_target),
            default={"roi_percent": 0.0, "net_profit": 0.0}
        ) if scenario_metrics else {"roi_percent": 0.0, "net_profit": 0.0}

        metrics = {
            "costBasis": cost_basis,
            "breakevenMovePercent": breakeven_move_pct,
            "breakevenPrice": breakeven_price,
            "bestRoiPercent": best["roi_percent"],
            "bestNetProfit": best["net_profit"],
            "bestMovePercent": best["move"] * 100 if isinstance(best["move"], (int, float)) else best["move"],
            # Rename these to be clearer about what they represent
            "expectedMoveRoiPercent": one_sd_move.get("roi_percent", 0.0),  # 1 SD move (68% probability)
            "expectedMoveNetProfit": one_sd_move.get("net_profit", 0.0),
            "optimisticMoveRoiPercent": two_sd_move.get("roi_percent", 0.0),  # 2 SD move (~95% probability)
            "optimisticMoveNetProfit": two_sd_move.get("net_profit", 0.0),
            # Keep old names for backward compatibility but with new values
            "tenMoveRoiPercent": one_sd_move.get("roi_percent", 0.0),
            "tenMoveNetProfit": one_sd_move.get("net_profit", 0.0),
            "fifteenMoveRoiPercent": two_sd_move.get("roi_percent", 0.0),
            "fifteenMoveNetProfit": two_sd_move.get("net_profit", 0.0),
            # Add metadata about what moves were used
            "expectedMove1SD": expected_move_1sd * 100,  # As percentage
            "expectedMove2SD": expected_move_1sd * 2 * 100,
            "dteUsedForCalculation": dte,
        }

        return scenarios, metrics

    def _calculate_position_sizing(
        self,
        option: pd.Series,
        metrics: Dict[str, Any],
        probability_percent: float,
        expected_roi_percent: float,
        risk_reward_ratio: Optional[float],
        risk_level: str,
        score: float,
    ) -> Optional[Dict[str, Any]]:
        """Derive an institutional-grade sizing recommendation for a single trade."""

        cost_basis = float(metrics.get("costBasis") or 0.0)
        if not isfinite(cost_basis) or cost_basis <= 0:
            return None

        raw_probability = probability_percent / 100.0 if probability_percent is not None else 0.0
        win_probability = max(0.0, min(0.95, float(raw_probability)))
        if win_probability <= 0.0:
            return None

        loss_probability = max(1.0 - win_probability, 1e-6)

        expected_net = max(float(metrics.get("expectedMoveNetProfit", 0.0)), 0.0)
        optimistic_net = max(float(metrics.get("optimisticMoveNetProfit", 0.0)), 0.0)
        if expected_net <= 0.0 and optimistic_net <= 0.0:
            fallback = max(float(metrics.get("bestNetProfit", 0.0)), 0.0)
            expected_net = fallback
            optimistic_net = fallback

        weighted_win = (expected_net * 0.7) + (optimistic_net * 0.3)
        payoff_ratio = weighted_win / cost_basis if cost_basis else 0.0
        payoff_ratio = max(payoff_ratio, 0.0)

        if payoff_ratio <= 0.0:
            return None

        # Kelly sizing for limited-loss trades
        kelly_fraction = (win_probability * (payoff_ratio + 1.0) - 1.0) / payoff_ratio
        if not isfinite(kelly_fraction):
            return None
        kelly_fraction = max(0.0, kelly_fraction)

        expected_edge = win_probability * payoff_ratio - loss_probability
        if expected_edge <= 0.0:
            return {
                "recommendedFraction": 0.0,
                "conservativeFraction": 0.0,
                "aggressiveFraction": 0.0,
                "kellyFraction": round(kelly_fraction, 4),
                "riskBudgetTier": "capital_preservation",
                "rationale": [
                    "Expected edge turns negative after accounting for win odds and payoff – size should be zero to preserve capital."
                ],
                "inputs": {
                    "winProbability": round(win_probability, 4),
                    "payoffRatio": round(payoff_ratio, 4),
                    "expectedEdge": round(expected_edge, 4),
                    "costBasis": round(cost_basis, 2),
                },
            }

        score_factor = max(0.55, min(1.0, float(score or 0.0) / 100.0))
        probability_factor = max(0.5, min(1.0, 0.4 + win_probability * 0.6))
        volatility = abs(float(metrics.get("expectedMove1SD", 0.0)) or 0.0) / 100.0
        volatility_factor = 1.0 / (1.0 + volatility * 3.5)

        reward_ratio = float(risk_reward_ratio) if risk_reward_ratio is not None else payoff_ratio
        reward_factor = max(0.6, min(1.25, 0.7 + reward_ratio * 0.25))

        risk_level_multiplier = {
            "low": 1.0,
            "medium": 0.7,
            "high": 0.45,
        }.get(str(risk_level).lower(), 0.6)

        base_fraction = kelly_fraction
        base_fraction *= score_factor
        base_fraction *= probability_factor
        base_fraction *= volatility_factor
        base_fraction *= reward_factor
        base_fraction *= risk_level_multiplier

        max_fraction = 0.05
        base_fraction = min(base_fraction, kelly_fraction * 1.1)
        recommended_fraction = max(0.0, min(max_fraction, base_fraction))

        if recommended_fraction <= 0.0:
            return None

        drawdown_confidence = 0.95
        try:
            losing_streak_95 = max(1, int(ceil(log(1.0 - drawdown_confidence) / log(loss_probability))))
        except ValueError:
            losing_streak_95 = 1

        projected_drawdown = 1.0 - (1.0 - recommended_fraction) ** losing_streak_95
        max_drawdown = 0.25
        if projected_drawdown > max_drawdown:
            adjustment = max_drawdown / projected_drawdown
            recommended_fraction *= adjustment

        recommended_fraction = min(max_fraction, recommended_fraction)
        conservative_fraction = max(0.0, min(max_fraction, recommended_fraction * 0.6))
        aggressive_fraction = max(recommended_fraction, min(max_fraction, recommended_fraction * 1.4, kelly_fraction))

        if recommended_fraction < 0.002:
            conservative_fraction = recommended_fraction

        risk_budget_tier = (
            "aggressive"
            if recommended_fraction >= 0.03
            else "balanced"
            if recommended_fraction >= 0.015
            else "conservative"
        )

        expected_log_growth = (
            win_probability * log1p(recommended_fraction * payoff_ratio)
            + loss_probability * log1p(-recommended_fraction)
        )

        rationale: List[str] = [
            (
                f"Kelly fraction of {kelly_fraction * 100:.1f}% based on {win_probability * 100:.0f}% win odds "
                f"and a {payoff_ratio:.2f}x payoff profile."
            ),
            (
                f"Volatility dampening trims the allocation to {recommended_fraction * 100:.1f}% with expected log growth of "
                f"{expected_log_growth * 100:.2f}% per trade."
            ),
            (
                "Risk-of-ruin controls keep the 95% losing streak drawdown under 25% of capital."
            ),
        ]
        if risk_level_multiplier < 1.0:
            rationale.append("Position size reduced to reflect elevated qualitative risk level.")

        portfolio_examples: List[Dict[str, Any]] = []
        for capital in (50_000, 100_000, 250_000):
            allocation = capital * recommended_fraction
            contracts = int(allocation // cost_basis)
            if contracts <= 0 and allocation >= cost_basis * 0.5:
                contracts = 1
            if contracts > 0:
                portfolio_examples.append(
                    {
                        "portfolio": capital,
                        "contracts": contracts,
                        "capitalAtRisk": round(contracts * cost_basis, 2),
                        "allocationPercent": round(recommended_fraction, 4),
                    }
                )

        return {
            "recommendedFraction": round(recommended_fraction, 4),
            "conservativeFraction": round(conservative_fraction, 4),
            "aggressiveFraction": round(aggressive_fraction, 4),
            "kellyFraction": round(kelly_fraction, 4),
            "expectedLogGrowth": round(expected_log_growth, 6),
            "expectedEdge": round(expected_edge, 4),
            "riskBudgetTier": risk_budget_tier,
            "rationale": rationale,
            "inputs": {
                "winProbability": round(win_probability, 4),
                "lossProbability": round(loss_probability, 4),
                "payoffRatio": round(payoff_ratio, 4),
                "volatility": round(volatility, 4),
                "scoreFactor": round(score_factor, 4),
                "probabilityFactor": round(probability_factor, 4),
                "volatilityFactor": round(volatility_factor, 4),
                "rewardFactor": round(reward_factor, 4),
                "riskLevel": str(risk_level).lower(),
                "costBasis": round(cost_basis, 2),
                "expectedRoi": round(expected_roi_percent / 100.0, 4),
            },
            "limits": {
                "maxPerTrade": max_fraction,
                "maxDrawdown95": round(min(projected_drawdown, max_drawdown), 4),
                "losingStreak95": losing_streak_95,
            },
            "capitalAllocationExamples": portfolio_examples,
        }

    def scan_for_opportunities(self, *, force_refresh: bool = False) -> ScanResult:
        """Execute the scan and package results for consumers."""

        print("🔍 Starting smart options scan...", file=sys.stderr)
        symbols = self._next_symbol_batch()
        options_data = self.get_current_options_data(symbols, force_refresh=force_refresh)

        if options_data is None or options_data.empty:
            metadata = {
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "symbolCount": 0,
                "totalOptions": 0,
                "totalEvaluated": 0,
                "symbols": [],
                "requestedSymbols": list(symbols),
                "source": "adapter",
                "symbolLimit": self.symbol_limit,
                "rotationState": dict(self.rotation_state or {}),
            }
            self._apply_freshness_metadata(metadata)
            return ScanResult([], metadata)

        opportunities = self.analyze_opportunities(options_data)
        print(f"✅ Found {len(opportunities)} high-scoring opportunities", file=sys.stderr)

        chains_by_symbol = {
            symbol: group.to_dict(orient="records")
            for symbol, group in options_data.groupby("symbol")
        }

        metadata = {
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "symbolCount": len(chains_by_symbol),
            "totalOptions": int(len(options_data)),
            "totalEvaluated": int(len(options_data)),
            "symbols": list(chains_by_symbol.keys()),
            "requestedSymbols": list(symbols),
            # Removed chainsBySymbol - causes 10MB+ JSON responses that overflow stdout buffer
            "source": "adapter",
            "symbolLimit": self.symbol_limit,
            "opportunityCount": len(opportunities),
            "rotationState": dict(self.rotation_state or {}),
        }
        self._apply_freshness_metadata(metadata)
        return ScanResult(opportunities, metadata)


def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan for high potential options setups")
    parser.add_argument(
        "--max-symbols",
        type=int,
        default=None,
        help=(
            "Limit the number of symbols fetched from the priority/watchlist universe. "
            "Use 0 or omit the flag to scan the full list."
        ),
    )
    parser.add_argument(
        "--json-indent",
        type=int,
        default=None,
        help="Pretty print JSON with the provided indentation",
    )
    return parser.parse_args(argv)


def _normalize_symbol_limit(raw_limit: Optional[int]) -> Optional[int]:
    if raw_limit is None:
        return None
    if raw_limit <= 0:
        return None
    return raw_limit


def run_scan(
    max_symbols: Optional[int] = None,
    *,
    force_refresh: bool = False,
    batch_builder: UniverseBuilder | None = None,
) -> ScanResult:
    scanner = SmartOptionsScanner(max_symbols=max_symbols, batch_builder=batch_builder)
    return scanner.scan_for_opportunities(force_refresh=force_refresh)


def run_deep_scan(
    batch_count: int,
    max_symbols: Optional[int] = None,
    *,
    batch_builder: UniverseBuilder | None = None,
) -> ScanResult:
    if batch_count <= 1:
        return run_scan(max_symbols, force_refresh=True, batch_builder=batch_builder)

    settings = get_settings()
    aggregated_opportunities: List[Dict[str, Any]] = []
    batch_metadata: List[Mapping[str, Any]] = []

    for index in range(batch_count):
        result = run_scan(max_symbols, force_refresh=True, batch_builder=batch_builder)
        aggregated_opportunities.extend(result.opportunities)
        batch_metadata.append(
            {
                "batch": index + 1,
                "requestedSymbols": result.metadata.get("requestedSymbols", []),
                "symbols": result.metadata.get("symbols", []),
                "opportunityCount": result.metadata.get("opportunityCount", 0),
                "totalOptions": result.metadata.get("totalOptions", 0),
            }
        )

    def _sort_key(opportunity: Mapping[str, Any]) -> Tuple[float, float]:
        max_return = float(opportunity.get("maxReturn", 0) or 0)
        score = float(opportunity.get("score", 0) or 0)
        return max_return, score

    aggregated_opportunities.sort(key=_sort_key, reverse=True)

    unique_requested = []
    seen_requested: set[str] = set()
    for meta in batch_metadata:
        for symbol in meta.get("requestedSymbols", []):
            upper = str(symbol).upper()
            if upper in seen_requested:
                continue
            seen_requested.add(upper)
            unique_requested.append(upper)

    # Collect unique symbols from all batches
    unique_symbols = []
    seen_symbols: set[str] = set()
    for meta in batch_metadata:
        for symbol in meta.get("symbols", []):
            upper = str(symbol).upper()
            if upper in seen_symbols:
                continue
            seen_symbols.add(upper)
            unique_symbols.append(upper)

    metadata: Dict[str, Any] = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "symbolCount": len(unique_requested),
        "totalOptions": sum(meta.get("totalOptions", 0) for meta in batch_metadata),
        "totalEvaluated": sum(meta.get("totalOptions", 0) for meta in batch_metadata),
        "symbols": unique_symbols,
        "requestedSymbols": unique_requested,
        # Removed chainsBySymbol - causes 10MB+ JSON responses that overflow stdout buffer
        "source": "adapter",
        "symbolLimit": max_symbols or settings.scanner.batch_size,
        "opportunityCount": len(aggregated_opportunities),
        "rotationState": {},
        "deepScan": {
            "batches": batch_count,
            "metadata": batch_metadata,
        },
        "environment": settings.env,
    }

    return ScanResult(aggregated_opportunities, metadata)


def cli(argv: Optional[Sequence[str]] = None) -> None:
    args = _parse_args(argv)
    symbol_limit = _normalize_symbol_limit(args.max_symbols)
    result = run_scan(symbol_limit)
    print(result.to_json(indent=args.json_indent))


if __name__ == "__main__":
    cli()
