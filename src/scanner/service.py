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
from src.config import AppSettings, get_settings
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
            elif breakeven_move <= 5:
                reasoning.append(f"Requires only a {breakeven_move:.1f}% move to break even")
            elif breakeven_move <= 8:
                reasoning.append(f"Reasonable {breakeven_move:.1f}% move needed to break even")

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

        if breakeven_move <= 5 and probability_percent >= 70:
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
        """Calculate IV percentage (not true IV rank - would need 52w IV data)."""

        if pd.notna(option["impliedVolatility"]):
            return float(min(100, option["impliedVolatility"] * 100))
        return 50.0

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
            move_text = f"Needs {breakeven_move:.1f}% move with {volume_ratio:.1f}x volume/interest support"
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

    def calculate_days_to_expiration(self, expiration_date: Any) -> int:
        """Calculate days to expiration."""

        try:
            exp_date = pd.to_datetime(expiration_date)
            days = (exp_date - datetime.now()).days
            return max(int(days), 0)
        except Exception:
            return 30

    def calculate_returns_analysis(self, option: pd.Series) -> tuple[List[Dict[str, Any]], Dict[str, float]]:
        """Return ROI scenarios (in percent) and supporting metrics."""

        stock_price = float(option["stockPrice"])
        strike = float(option["strike"])
        premium = float(option["lastPrice"])
        cost_basis = premium * 100
        breakeven_price = self.calculate_breakeven(option)

        if option["type"] == "call":
            breakeven_move_pct = ((breakeven_price - stock_price) / max(stock_price, 0.01)) * 100
        else:
            breakeven_move_pct = ((stock_price - breakeven_price) / max(stock_price, 0.01)) * 100

        # Evaluate profit/loss across realistic price movements
        # For calls: positive moves matter most; for puts: negative moves matter most
        moves = [-0.10, -0.05, -0.01, 0.0, 0.01, 0.025, 0.05, 0.075, 0.10, 0.12]
        scenarios: List[Dict[str, Any]] = []
        scenario_metrics: List[Dict[str, float]] = []

        for move in moves:
            if option["type"] == "call":
                target_price = stock_price * (1 + move)
                intrinsic = max(0.0, target_price - strike)
            else:
                target_price = stock_price * (1 - move)
                intrinsic = max(0.0, strike - target_price)

            payoff = intrinsic * 100
            net_profit = payoff - cost_basis
            roi_percent = (net_profit / cost_basis) * 100 if cost_basis else 0.0

            # Format move percentage with proper sign
            move_pct = move * 100
            move_str = f"{move_pct:+.1f}%" if move != 0 else "0%"
            scenarios.append({"move": move_str, "return": roi_percent})
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

        ten_move = next(
            (item for item in scenario_metrics if abs(item["move"] - 0.10) < 1e-6),
            scenario_metrics[0] if scenario_metrics else {"roi_percent": 0.0, "net_profit": 0.0},
        )
        fifteen_move = next(
            (item for item in scenario_metrics if abs(item["move"] - 0.15) < 1e-6),
            scenario_metrics[0] if scenario_metrics else {"roi_percent": 0.0, "net_profit": 0.0},
        )

        metrics = {
            "costBasis": cost_basis,
            "breakevenMovePercent": breakeven_move_pct,
            "breakevenPrice": breakeven_price,
            "bestRoiPercent": best["roi_percent"],
            "bestNetProfit": best["net_profit"],
            "bestMovePercent": best["move"] * 100 if isinstance(best["move"], (int, float)) else best["move"],
            "tenMoveRoiPercent": ten_move.get("roi_percent", 0.0),
            "tenMoveNetProfit": ten_move.get("net_profit", 0.0),
            "fifteenMoveRoiPercent": fifteen_move.get("roi_percent", 0.0),
            "fifteenMoveNetProfit": fifteen_move.get("net_profit", 0.0),
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
