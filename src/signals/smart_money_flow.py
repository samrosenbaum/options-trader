"""Smart money flow detection for directional bias prediction.

Theory: Large institutional orders leave footprints in volume, price action,
and options activity. By identifying these patterns, we can follow the "smart money"
and predict directional moves before retail traders catch on.

This signal looks at:
1. Unusual options volume (volume >> average, volume >> open interest)
2. Block trades (large single orders)
3. Bid/ask aggression (which side is being "lifted")
4. Volume-weighted directional flow
5. Call/put volume imbalance at unusual levels
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .base import Direction, Signal, SignalResult


class SmartMoneyFlowDetector(Signal):
    """Detect institutional and smart money flow for directional bias."""

    def __init__(self, weight: float = 0.20):
        """Initialize with default weight from master plan."""
        super().__init__(name="Smart Money Flow", weight=weight)

    def get_required_data(self) -> List[str]:
        """Required data fields for smart money analysis."""
        return [
            "options_data",  # Current options data with volume, OI, bid/ask
            "historical_volume",  # Historical average volume for comparison
            "stock_price",  # Current stock price
            "price_change",  # Price change (for flow direction)
        ]

    def calculate(self, data: Dict[str, Any]) -> SignalResult:
        """
        Calculate directional bias from smart money flow.

        Args:
            data: Must contain options_data, historical_volume, stock_price, price_change

        Returns:
            SignalResult with flow-based directional bias
        """
        if not self.validate_data(data):
            return self._create_neutral_result("Missing required data")

        options_data = data["options_data"]
        historical_volume = data.get("historical_volume", {})
        stock_price = float(data.get("stock_price", 0))
        price_change = float(data.get("price_change", 0))

        if options_data.empty or stock_price <= 0:
            return self._create_neutral_result("Invalid data values")

        # Calculate flow metrics
        flow_metrics = self._calculate_flow_metrics(
            options_data, historical_volume, stock_price, price_change
        )

        if flow_metrics is None:
            return self._create_neutral_result("Insufficient flow data")

        # Determine directional bias
        direction, score, confidence, rationale = self._interpret_flow(flow_metrics)

        return SignalResult(
            signal_name=self.name,
            direction=direction,
            score=score,
            confidence=self.get_adjusted_confidence(confidence),
            rationale=rationale,
            details=flow_metrics,
            timestamp=datetime.now(),
        )

    def _calculate_flow_metrics(
        self,
        options_data: pd.DataFrame,
        historical_volume: Dict[str, float],
        stock_price: float,
        price_change: float,
    ) -> Optional[Dict[str, Any]]:
        """
        Calculate smart money flow metrics.

        Returns dictionary with:
        - unusual_call_volume: Unusual call volume score
        - unusual_put_volume: Unusual put volume score
        - call_put_volume_ratio: Current call/put volume ratio
        - aggressive_call_flow: Aggressive buying of calls (via bid/ask)
        - aggressive_put_flow: Aggressive buying of puts
        - block_trade_score: Large single trades detected
        - net_flow_score: Overall directional flow
        """
        try:
            calls = options_data[options_data["type"] == "call"].copy()
            puts = options_data[options_data["type"] == "put"].copy()

            if calls.empty and puts.empty:
                return None

            # 1. Unusual Volume Detection
            call_volume = calls["volume"].sum() if not calls.empty else 0
            put_volume = puts["volume"].sum() if not puts.empty else 0

            avg_call_volume = historical_volume.get("avg_call_volume", call_volume)
            avg_put_volume = historical_volume.get("avg_put_volume", put_volume)

            # Score unusual volume (how many standard deviations above average)
            unusual_call_score = self._calculate_unusual_score(
                call_volume, avg_call_volume, historical_volume.get("call_volume_std", avg_call_volume * 0.3)
            )
            unusual_put_score = self._calculate_unusual_score(
                put_volume, avg_put_volume, historical_volume.get("put_volume_std", avg_put_volume * 0.3)
            )

            # 2. Call/Put Volume Ratio
            total_volume = call_volume + put_volume
            cp_ratio = call_volume / put_volume if put_volume > 0 else (5.0 if call_volume > 0 else 1.0)

            # 3. Bid/Ask Aggression (estimates who's initiating trades)
            aggressive_call_flow = self._calculate_aggressive_flow(calls, "call")
            aggressive_put_flow = self._calculate_aggressive_flow(puts, "put")

            # 4. Block Trade Detection (volume much higher than OI suggests large trades)
            block_call_score = self._detect_block_trades(calls)
            block_put_score = self._detect_block_trades(puts)

            # 5. Volume-Weighted Direction (combining price action with volume)
            # If stock is up and calls are active = bullish confirmation
            # If stock is down and puts are active = bearish confirmation
            price_direction = 1 if price_change > 0 else (-1 if price_change < 0 else 0)
            volume_confirmation = (call_volume - put_volume) / total_volume if total_volume > 0 else 0

            # Net flow score combines all factors
            net_flow = self._calculate_net_flow(
                unusual_call_score,
                unusual_put_score,
                aggressive_call_flow,
                aggressive_put_flow,
                block_call_score,
                block_put_score,
                cp_ratio,
                price_direction,
                volume_confirmation,
            )

            return {
                "call_volume": int(call_volume),
                "put_volume": int(put_volume),
                "call_put_ratio": float(cp_ratio),
                "unusual_call_score": float(unusual_call_score),
                "unusual_put_score": float(unusual_put_score),
                "aggressive_call_flow": float(aggressive_call_flow),
                "aggressive_put_flow": float(aggressive_put_flow),
                "block_call_score": float(block_call_score),
                "block_put_score": float(block_put_score),
                "net_flow_score": float(net_flow),
                "price_direction": int(price_direction),
                "volume_confirmation": float(volume_confirmation),
            }

        except Exception as e:
            print(f"Error calculating flow metrics: {e}")
            return None

    def _calculate_unusual_score(self, current: float, average: float, std: float) -> float:
        """
        Calculate z-score for unusual volume.

        Returns score from 0-100 based on standard deviations above average.
        """
        if std <= 0 or average <= 0:
            return 0.0

        z_score = (current - average) / std

        # Convert to 0-100 scale (3 std = 100)
        score = np.clip((z_score / 3.0) * 100, 0, 100)
        return score

    def _calculate_aggressive_flow(self, options_df: pd.DataFrame, option_type: str) -> float:
        """
        Estimate aggressive buying vs selling by analyzing bid/ask spread.

        When buyers are aggressive, they lift the offer (buy at ask).
        When sellers are aggressive, they hit the bid (sell at bid).

        We approximate this by comparing lastPrice to bid/ask midpoint.
        """
        if options_df.empty:
            return 0.0

        try:
            # Calculate midpoint
            options_df = options_df.copy()
            options_df["midpoint"] = (options_df["bid"] + options_df["ask"]) / 2

            # If lastPrice > midpoint, buyers are aggressive (bullish for calls, bearish for puts)
            # If lastPrice < midpoint, sellers are aggressive (bearish for calls, bullish for puts)
            options_df["aggression"] = (options_df["lastPrice"] - options_df["midpoint"]) / options_df["midpoint"]

            # Weight by volume
            options_df["weighted_aggression"] = options_df["aggression"] * options_df["volume"]

            total_weighted = options_df["weighted_aggression"].sum()
            total_volume = options_df["volume"].sum()

            if total_volume <= 0:
                return 0.0

            avg_aggression = total_weighted / total_volume

            # Convert to score (-100 to +100)
            # For calls: positive aggression = bullish, negative = bearish
            # For puts: positive aggression = bearish, negative = bullish
            score = np.clip(avg_aggression * 100, -100, 100)

            if option_type == "put":
                score = -score  # Invert for puts

            return score

        except Exception as e:
            print(f"Error calculating aggressive flow: {e}")
            return 0.0

    def _detect_block_trades(self, options_df: pd.DataFrame) -> float:
        """
        Detect block trades by finding options where volume >> open interest.

        Large volume relative to OI suggests a big player is taking a position.
        """
        if options_df.empty:
            return 0.0

        try:
            # Volume/OI ratio - high ratio indicates large trades today
            options_df = options_df.copy()
            options_df["vol_oi_ratio"] = options_df["volume"] / options_df["openInterest"].replace(0, 1)

            # Find options with unusually high volume/OI (>0.5 is significant)
            block_trades = options_df[options_df["vol_oi_ratio"] > 0.5]

            if block_trades.empty:
                return 0.0

            # Score based on how many block trades and their size
            total_block_volume = block_trades["volume"].sum()
            total_volume = options_df["volume"].sum()

            block_score = (total_block_volume / total_volume) * 100 if total_volume > 0 else 0

            return min(100, block_score)

        except Exception:
            return 0.0

    def _calculate_net_flow(
        self,
        unusual_call: float,
        unusual_put: float,
        aggressive_call: float,
        aggressive_put: float,
        block_call: float,
        block_put: float,
        cp_ratio: float,
        price_direction: int,
        volume_confirmation: float,
    ) -> float:
        """
        Combine all flow factors into a single net flow score.

        Returns: -100 (very bearish) to +100 (very bullish)
        """
        # Start with unusual volume differential
        flow_score = (unusual_call - unusual_put) / 2

        # Add aggressive flow
        flow_score += (aggressive_call - aggressive_put) / 4

        # Add block trade bias
        flow_score += (block_call - block_put) / 4

        # C/P ratio contribution
        # Ratio > 2.0 = bullish, < 0.5 = bearish
        cp_score = 0
        if cp_ratio > 2.0:
            cp_score = min(30, (cp_ratio - 2.0) * 15)
        elif cp_ratio < 0.5:
            cp_score = max(-30, (cp_ratio - 0.5) * 60)

        flow_score += cp_score

        # Price confirmation bonus
        # If flow agrees with price direction, boost confidence
        if price_direction != 0:
            confirmation_bonus = price_direction * volume_confirmation * 20
            flow_score += confirmation_bonus

        # Clip to range
        return np.clip(flow_score, -100, 100)

    def _interpret_flow(self, metrics: Dict[str, Any]) -> tuple[Direction, float, float, str]:
        """
        Interpret flow metrics to determine directional bias.

        Returns: (direction, score, confidence, rationale)
        """
        net_flow = metrics["net_flow_score"]
        cp_ratio = metrics["call_put_ratio"]
        unusual_call = metrics["unusual_call_score"]
        unusual_put = metrics["unusual_put_score"]

        # Score is the net flow
        score = net_flow

        # Confidence based on magnitude and supporting factors
        confidence = 50.0

        # Higher confidence if multiple factors align
        factors_aligned = 0

        if unusual_call > 50 or unusual_put > 50:
            factors_aligned += 1
            confidence += 15

        if abs(metrics["aggressive_call_flow"]) > 30 or abs(metrics["aggressive_put_flow"]) > 30:
            factors_aligned += 1
            confidence += 10

        if metrics["block_call_score"] > 30 or metrics["block_put_score"] > 30:
            factors_aligned += 1
            confidence += 10

        if metrics["price_direction"] != 0 and abs(metrics["volume_confirmation"]) > 0.3:
            factors_aligned += 1
            confidence += 10

        confidence = min(90, confidence)

        # Determine direction
        if score > 20:
            direction = Direction.BULLISH
            rationale = self._build_bullish_flow_rationale(metrics)
        elif score < -20:
            direction = Direction.BEARISH
            rationale = self._build_bearish_flow_rationale(metrics)
        else:
            direction = Direction.NEUTRAL
            rationale = self._build_neutral_flow_rationale(metrics)

        return direction, score, confidence, rationale

    def _build_bullish_flow_rationale(self, metrics: Dict[str, Any]) -> str:
        """Build explanation for bullish flow."""
        rationale = "Bullish smart money flow detected: "

        components = []

        if metrics["unusual_call_score"] > 60:
            components.append(f"call volume {metrics['unusual_call_score']:.0f}% above average")

        if metrics["call_put_ratio"] > 2.0:
            components.append(f"call/put ratio at {metrics['call_put_ratio']:.1f}x")

        if metrics["aggressive_call_flow"] > 30:
            components.append("aggressive call buying")

        if metrics["block_call_score"] > 30:
            components.append("large block trades in calls")

        if metrics["price_direction"] > 0 and metrics["volume_confirmation"] > 0.2:
            components.append("price strength confirming flow")

        if not components:
            rationale += "Net call flow exceeds put flow, suggesting institutional bullish positioning."
        else:
            rationale += ", ".join(components) + ". Institutions appear to be positioning for upside."

        return rationale

    def _build_bearish_flow_rationale(self, metrics: Dict[str, Any]) -> str:
        """Build explanation for bearish flow."""
        rationale = "Bearish smart money flow detected: "

        components = []

        if metrics["unusual_put_score"] > 60:
            components.append(f"put volume {metrics['unusual_put_score']:.0f}% above average")

        if metrics["call_put_ratio"] < 0.5:
            components.append(f"put/call dominance ({metrics['call_put_ratio']:.2f}x)")

        if metrics["aggressive_put_flow"] > 30:
            components.append("aggressive put buying")

        if metrics["block_put_score"] > 30:
            components.append("large block trades in puts")

        if metrics["price_direction"] < 0 and metrics["volume_confirmation"] < -0.2:
            components.append("price weakness confirming flow")

        if not components:
            rationale += "Net put flow exceeds call flow, suggesting institutional bearish positioning or hedging."
        else:
            rationale += ", ".join(components) + ". Institutions appear to be positioning for downside or heavy hedging."

        return rationale

    def _build_neutral_flow_rationale(self, metrics: Dict[str, Any]) -> str:
        """Build explanation for neutral flow."""
        return (
            f"Balanced options flow: call/put ratio at {metrics['call_put_ratio']:.2f}. "
            f"No clear institutional bias detected. "
            f"Activity levels appear normal without significant directional positioning."
        )

    def _create_neutral_result(self, reason: str) -> SignalResult:
        """Create a neutral result when signal cannot be calculated."""
        return SignalResult(
            signal_name=self.name,
            direction=Direction.NEUTRAL,
            score=0.0,
            confidence=0.0,
            rationale=f"No flow signal: {reason}",
            details={"error": reason},
            timestamp=datetime.now(),
        )
