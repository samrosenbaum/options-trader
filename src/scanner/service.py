"""Smart options scanning service reusable across scripts and APIs."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from math import isfinite
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

import pandas as pd

from scripts.bulk_options_fetcher import BulkOptionsFetcher
from src.analysis import SwingSignal, SwingSignalAnalyzer
from src.config import AppSettings, get_settings
from src.scanner.iv_rank_history import IVRankHistory
from src.scanner.universe import build_scan_universe
from src.validation import OptionsDataValidator, DataQuality


@dataclass(slots=True)
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
        self.validator = OptionsDataValidator()
        sqlite_path: Optional[str] = None
        try:
            sqlite_settings = settings.storage.require_sqlite()
            sqlite_path = sqlite_settings.path
        except Exception:
            sqlite_path = None
        self.iv_history = IVRankHistory(sqlite_path)
        self.swing_analyzer: SwingSignalAnalyzer | None = None
        self._swing_signal_cache: Dict[str, Optional[Dict[str, Any]]] = {}
        self._swing_error_cache: Dict[str, str] = {}

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
        """Determine if cached data should be refreshed."""

        if not self.is_market_hours():
            return False

        if self.last_fetch_time is None:
            return True

        time_since_fetch = (datetime.now() - self.last_fetch_time).total_seconds()
        return time_since_fetch > 300  # 5 minutes

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

        if force_refresh:
            data = self.fetcher.get_fresh_options_data(
                use_cache=False,
                max_symbols=self.symbol_limit,
                symbols=normalized_symbols,
            )
            self.last_fetch_time = datetime.now()
            return data

        if self.should_refresh_data():
            print("🔄 Market is open and data needs refresh - fetching fresh data...", file=sys.stderr)
            data = self.fetcher.get_fresh_options_data(
                use_cache=False,
                max_symbols=self.symbol_limit,
                symbols=normalized_symbols,
            )
            self.last_fetch_time = datetime.now()
        else:
            print("📂 Using cached data (market closed or recent fetch)", file=sys.stderr)
            data = self.fetcher.get_fresh_options_data(
                use_cache=True,
                max_symbols=self.symbol_limit,
                symbols=normalized_symbols,
            )
            if data is None:
                data = self.fetcher.get_fresh_options_data(
                    use_cache=False,
                    max_symbols=self.symbol_limit,
                    symbols=normalized_symbols,
                )
                self.last_fetch_time = datetime.now()

        return data

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

        working_data = options_data.copy()
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

        opportunities: List[Dict[str, Any]] = []
        for _, option in liquid_options.iterrows():
            returns_analysis, metrics = self.calculate_returns_analysis(option)
            probability_score = self.calculate_probability_score(option, metrics)
            score = self.calculate_opportunity_score(option, metrics, probability_score)

            best_roi = metrics["bestRoiPercent"]
            if best_roi <= 0:
                continue

            high_asymmetry = best_roi >= 300  # Raised from 220
            high_conviction = probability_score >= 32 and metrics["tenMoveRoiPercent"] >= 50  # Raised thresholds

            if score >= 85 and (high_asymmetry or high_conviction):  # Raised from 75 to 85
                volume_ratio = float(option["volume"] / max(option["openInterest"], 1))
                spread_pct = (option["ask"] - option["bid"]) / max(option["lastPrice"], 0.01)
                probability_percent = self.estimate_probability_percent(probability_score)

                swing_signal, swing_error = self._swing_signal_for(option["symbol"])

                # Calculate directional bias to help choose between calls and puts
                directional_bias = self.calculate_directional_bias(option, swing_signal)

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
                catalysts = ["Volume/Flow Confirmation", "Favourable Risk-Reward Setup"]
                patterns = ["Liquidity Analysis", "Risk/Reward Modeling"]
                if best_roi >= 250:
                    patterns.append("Asymmetrical Upside")
                if probability_percent >= 70:
                    catalysts.append("High Conviction Setup")

                # Validate data quality before creating opportunity
                quality_report = self.validator.validate_option(option.to_dict())

                # Skip rejected AND low quality options - only HIGH/MEDIUM pass
                if quality_report.quality in [DataQuality.REJECTED, DataQuality.LOW]:
                    print(f"⚠️  Rejected {option['symbol']} {option['type']} ${option['strike']} - Quality: {quality_report.quality.value}, Issues: {quality_report.issues}, Warnings: {quality_report.warnings}", file=sys.stderr)
                    continue

                opportunity = {
                    "symbol": option["symbol"],
                    "optionType": option["type"],
                    "strike": float(option["strike"]),
                    "expiration": option["expiration"],
                    "premium": float(option["lastPrice"]),
                    "tradeSummary": trade_summary,
                    "bid": float(option["bid"]),
                    "ask": float(option["ask"]),
                    "volume": int(option["volume"]),
                    "openInterest": int(option["openInterest"]),
                    "impliedVolatility": float(option["impliedVolatility"]) if pd.notna(option["impliedVolatility"]) else 0.0,
                    "stockPrice": float(option["stockPrice"]),
                    "score": score,
                    "confidence": min(95, (score * 0.35) + (probability_percent * 0.65)),
                    "reasoning": reasoning,
                    "catalysts": catalysts,
                    "patterns": patterns,
                    "riskLevel": self.assess_risk_level(option, metrics, probability_score),
                    "potentialReturn": metrics["tenMoveRoiPercent"],
                    "potentialReturnAmount": metrics["tenMoveNetProfit"],
                    "maxReturn": metrics["bestRoiPercent"],
                    "maxReturnAmount": metrics["bestNetProfit"],
                    # New realistic scenario fields
                    "expectedMoveReturn": metrics["expectedMoveRoiPercent"],
                    "expectedMoveAmount": metrics["expectedMoveNetProfit"],
                    "optimisticMoveReturn": metrics["optimisticMoveRoiPercent"],
                    "optimisticMoveAmount": metrics["optimisticMoveNetProfit"],
                    "expectedMove1SD": metrics["expectedMove1SD"],
                    "expectedMove2SD": metrics["expectedMove2SD"],
                    "maxLossPercent": 100.0,
                    "maxLossAmount": metrics["costBasis"],
                    "maxLoss": metrics["costBasis"],
                    "breakeven": metrics["breakevenPrice"],
                    "breakevenPrice": metrics["breakevenPrice"],
                    "breakevenMovePercent": metrics["breakevenMovePercent"],
                    "ivRank": self.calculate_iv_rank(option),
                    "volumeRatio": volume_ratio,
                    "probabilityOfProfit": probability_percent,
                    "profitProbabilityExplanation": self.build_probability_explanation(
                        option,
                        metrics,
                        probability_percent,
                        volume_ratio,
                    ),
                    "riskRewardRatio": metrics["bestRoiPercent"] / 100 if metrics["bestRoiPercent"] > 0 else None,
                    "shortTermRiskRewardRatio": (
                        metrics["tenMoveRoiPercent"] / 100 if metrics["tenMoveRoiPercent"] > 0 else None
                    ),
                    "greeks": self.calculate_greeks_approximation(option),
                    "daysToExpiration": self.calculate_days_to_expiration(option["expiration"]),
                    "returnsAnalysis": returns_analysis,
                    "directionalBias": directional_bias,
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
                opportunities.append(opportunity)

        # Sort by score and limit to top 20 to prevent JSON overflow
        opportunities.sort(key=lambda item: item.get("score", 0), reverse=True)

        # Limit to top 20 opportunities to keep JSON manageable
        max_opportunities = 20
        if len(opportunities) > max_opportunities:
            print(f"📊 Limiting output to top {max_opportunities} of {len(opportunities)} opportunities", file=sys.stderr)
            opportunities = opportunities[:max_opportunities]

        return opportunities

    def calculate_opportunity_score(self, option: pd.Series, metrics: Mapping[str, float], probability_score: float) -> float:
        """Calculate opportunity score based on liquidity, risk/reward and probability."""

        score = 0.0

        volume_ratio = option["volume"] / max(option["openInterest"], 1)
        if volume_ratio > 4:
            score += 18
        elif volume_ratio > 3:
            score += 15
        elif volume_ratio > 2:
            score += 12
        elif volume_ratio > 1.5:
            score += 8

        spread_pct = (option["ask"] - option["bid"]) / max(option["lastPrice"], 0.01)
        if spread_pct < 0.05:
            score += 18
        elif spread_pct < 0.1:
            score += 12
        elif spread_pct < 0.2:
            score += 6

        best_roi = max(0.0, metrics["bestRoiPercent"])
        short_term_roi = max(0.0, metrics["tenMoveRoiPercent"])

        score += min(35, best_roi / 4)
        score += min(12, short_term_roi / 6)
        score += probability_score

        iv = option["impliedVolatility"]
        if pd.notna(iv):
            if 0.2 <= iv <= 0.6:
                score += 5
            elif iv > 0.8:
                score -= 3

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
            # Skip negative moves (wrong direction)
            if (option_type == "CALL" and move_pct < 0) or (option_type == "PUT" and move_pct > 0):
                continue

            roi = scenario["return"]
            if roi >= 20:  # At least 20% profit
                target_scenario = scenario
                break

        if not target_scenario:
            # Fallback to breakeven if no profitable scenario found
            breakeven_price = metrics["breakevenPrice"]
            breakeven_move_pct = abs(metrics["breakevenMovePercent"])
            direction = "UP" if option_type == "CALL" else "DOWN"
            dollar_move_abs = abs(breakeven_price - stock_price)

            return (
                f"📊 Stock needs to go {direction} by ${dollar_move_abs:.2f} ({breakeven_move_pct:.1f}%) "
                f"to ${breakeven_price:.2f} {time_desc} to break even"
            )

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
        expected_move_1sd = metrics.get("expectedMove1SD", 0) * 100  # Convert to percentage
        if expected_move_1sd > 0:
            if move_pct < expected_move_1sd * 0.5:
                summary += " ✓ Very achievable"
            elif move_pct < expected_move_1sd:
                summary += " ✓ Achievable"
            elif move_pct < expected_move_1sd * 1.5:
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
        """Calculate real probability of profit using statistical methods."""
        import math
        from scipy import stats

        breakeven_move_pct = abs(metrics["breakevenMovePercent"])
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
            z_score = breakeven_move_pct / expected_move_pct

        # For calls: probability stock goes UP past breakeven = 1 - CDF(z_score)
        # For puts: probability stock goes DOWN past breakeven = 1 - CDF(z_score)
        # Using normal distribution (stock returns are approximately normal)
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

    def calculate_directional_bias(self, option: pd.Series, swing_signal: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate directional bias to help users choose between calls and puts on the same symbol.

        Returns a dict with:
        - direction: "bullish", "bearish", or "neutral"
        - confidence: 0-100 score for the directional conviction
        - signals: breakdown of contributing factors
        - recommendation: which option type aligns with the bias
        """

        signals = {}
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
                elif momentum_zscore > 0.5:
                    bullish_score += 15
                    signals["momentum"] = f"Moderate bullish momentum ({momentum_zscore:.2f} σ above mean)"
                elif momentum_zscore < -1.5:
                    bearish_score += 30
                    signals["momentum"] = f"Strong bearish momentum ({momentum_zscore:.2f} σ below mean)"
                elif momentum_zscore < -0.5:
                    bearish_score += 15
                    signals["momentum"] = f"Moderate bearish momentum ({momentum_zscore:.2f} σ below mean)"
                else:
                    signals["momentum"] = f"Neutral momentum ({momentum_zscore:.2f} σ)"

            # News sentiment
            if "News & Catalysts" in factors:
                news_factor = factors["News & Catalysts"]
                avg_sentiment = news_factor.get("details", {}).get("average_sentiment", 0)

                if avg_sentiment > 0.3:
                    bullish_score += 20
                    signals["news"] = f"Positive news sentiment ({avg_sentiment:.2f})"
                elif avg_sentiment > 0.1:
                    bullish_score += 10
                    signals["news"] = f"Slightly positive news ({avg_sentiment:.2f})"
                elif avg_sentiment < -0.3:
                    bearish_score += 20
                    signals["news"] = f"Negative news sentiment ({avg_sentiment:.2f})"
                elif avg_sentiment < -0.1:
                    bearish_score += 10
                    signals["news"] = f"Slightly negative news ({avg_sentiment:.2f})"
                else:
                    signals["news"] = "Neutral news sentiment"

            # Volatility expansion (benefits both directions but more for options aligned with momentum)
            if "Volatility Expansion" in factors:
                vol_factor = factors["Volatility Expansion"]
                atr_ratio = vol_factor.get("details", {}).get("atr_ratio", 1.0)

                if atr_ratio > 1.3:
                    signals["volatility"] = f"High volatility ({atr_ratio:.1f}x baseline) - favors strong moves"
                elif atr_ratio > 1.1:
                    signals["volatility"] = f"Elevated volatility ({atr_ratio:.1f}x baseline)"
                else:
                    signals["volatility"] = f"Normal volatility ({atr_ratio:.1f}x baseline)"

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
        elif option_type == "put" and delta < -0.7:
            signals["delta"] = f"High delta ({abs(delta):.2f}) - moves strongly with stock"
        elif abs(delta) > 0.3:
            signals["delta"] = f"Moderate delta ({abs(delta):.2f})"
        else:
            signals["delta"] = f"Low delta ({abs(delta):.2f}) - needs large move"

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

        # For very short-dated options (0-3 DTE), use minimum realistic scenarios
        if dte <= 3:
            # Intraday/overnight scenarios - much smaller moves
            moves = [
                -expected_move_1sd * 1.5,  # ~1.5 SD down
                -expected_move_1sd,         # 1 SD down
                -expected_move_1sd * 0.5,   # 0.5 SD down
                -0.01,                       # Small move down
                0.0,                         # No move
                0.01,                        # Small move up
                expected_move_1sd * 0.5,    # 0.5 SD up
                expected_move_1sd,          # 1 SD up
                expected_move_1sd * 1.5,    # ~1.5 SD up
            ]
        elif dte <= 7:
            # Weekly scenarios - moderate moves
            moves = [
                -expected_move_1sd * 2,     # 2 SD down
                -expected_move_1sd * 1.5,   # 1.5 SD down
                -expected_move_1sd,         # 1 SD down
                -0.02,                       # Small move down
                0.0,                         # No move
                0.02,                        # Small move up
                expected_move_1sd,          # 1 SD up
                expected_move_1sd * 1.5,    # 1.5 SD up
                expected_move_1sd * 2,      # 2 SD up
            ]
        else:
            # Monthly+ scenarios - can use broader ranges
            moves = [
                -expected_move_1sd * 2,     # 2 SD down
                -expected_move_1sd * 1.5,   # 1.5 SD down
                -expected_move_1sd,         # 1 SD down
                -0.03,                       # Small move down
                0.0,                         # No move
                0.03,                        # Small move up
                expected_move_1sd,          # 1 SD up
                expected_move_1sd * 1.5,    # 1.5 SD up
                expected_move_1sd * 2,      # 2 SD up
                expected_move_1sd * 2.5,    # 2.5 SD up (rare but possible)
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
