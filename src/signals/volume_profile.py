"""Volume Profile Momentum signal for identifying breakout/breakdown potential.

Theory: Volume concentration at specific price levels creates support/resistance zones.
When price breaks through high-volume areas with strong momentum, it signals continuation.
When price reverses at high-volume zones, it signals rejection and potential reversal.

This signal analyzes:
1. Point of Control (POC) - price level with highest volume
2. Value Area - price range containing 70% of volume
3. High Volume Nodes (HVN) - areas of heavy trading activity
4. Low Volume Nodes (LVN) - areas of light trading (weak support/resistance)
5. Price position relative to volume profile structure

Trading Logic:
- Price above POC + strong volume = bullish breakout
- Price below POC + strong volume = bearish breakdown
- Price at value area edges = potential reversal zones
- Price breaking through LVN = fast moves expected
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .base import Direction, Signal, SignalResult


class VolumeProfileAnalyzer(Signal):
    """Analyze volume profile to predict directional momentum."""

    def __init__(self, weight: float = 0.20):
        """Initialize with default weight from master plan."""
        super().__init__(name="Volume Profile", weight=weight)

    def get_required_data(self) -> List[str]:
        """Required data fields for volume profile analysis."""
        return [
            "price_history",  # Recent price/volume data
            "stock_price",  # Current stock price
        ]

    def calculate(self, data: Dict[str, Any]) -> SignalResult:
        """
        Calculate directional bias from volume profile analysis.

        Args:
            data: Must contain price_history (DataFrame with OHLCV), stock_price

        Returns:
            SignalResult with volume profile-based directional bias
        """
        if not self.validate_data(data):
            return self._create_neutral_result("Missing required data")

        price_history = data["price_history"]
        stock_price = float(data.get("stock_price", 0))

        if price_history.empty or stock_price <= 0:
            return self._create_neutral_result("Invalid data values")

        # Calculate volume profile metrics
        profile_metrics = self._calculate_volume_profile(price_history, stock_price)

        if profile_metrics is None:
            return self._create_neutral_result("Insufficient price/volume history")

        # Determine directional bias from volume profile
        direction, score, confidence, rationale = self._interpret_profile(
            profile_metrics, stock_price
        )

        return SignalResult(
            signal_name=self.name,
            direction=direction,
            score=score,
            confidence=self.get_adjusted_confidence(confidence),
            rationale=rationale,
            details=profile_metrics,
            timestamp=datetime.now(),
        )

    def _calculate_volume_profile(
        self, price_history: pd.DataFrame, current_price: float
    ) -> Optional[Dict[str, Any]]:
        """
        Calculate volume profile metrics from price history.

        Returns dictionary with:
        - poc: Point of Control (price level with most volume)
        - poc_volume: Volume at POC
        - value_area_high: Upper bound of value area (70% volume)
        - value_area_low: Lower bound of value area
        - price_position: "above_poc", "at_poc", "below_poc"
        - distance_from_poc_pct: % distance from POC
        - volume_at_current: Volume concentration at current price
        - recent_volume_surge: Is recent volume elevated?
        """
        try:
            # Need at least 20 periods for meaningful profile
            if len(price_history) < 20:
                return None

            df = price_history.copy()

            # Normalize column names
            if "close" not in df.columns:
                df["close"] = df.get("Close", df.get("CLOSE"))
            if "volume" not in df.columns:
                df["volume"] = df.get("Volume", df.get("VOLUME"))

            closes = df["close"].values
            volumes = df["volume"].values

            # Create price bins for volume profile
            num_bins = min(50, len(closes) // 2)  # Adaptive binning
            price_range = (closes.min(), closes.max())
            bins = np.linspace(price_range[0], price_range[1], num_bins)

            # Aggregate volume by price level
            volume_profile = np.zeros(len(bins) - 1)

            for i in range(len(closes)):
                price = closes[i]
                volume = volumes[i]

                # Find which bin this price falls into
                bin_idx = np.searchsorted(bins, price, side='right') - 1
                bin_idx = max(0, min(len(volume_profile) - 1, bin_idx))

                volume_profile[bin_idx] += volume

            # Calculate Point of Control (POC)
            poc_idx = np.argmax(volume_profile)
            poc_price = (bins[poc_idx] + bins[poc_idx + 1]) / 2
            poc_volume = volume_profile[poc_idx]

            # Calculate Value Area (70% of total volume)
            total_volume = volume_profile.sum()
            target_volume = total_volume * 0.70

            # Start from POC and expand outward to capture 70% volume
            value_area_indices = [poc_idx]
            accumulated_volume = poc_volume

            left_idx = poc_idx - 1
            right_idx = poc_idx + 1

            while accumulated_volume < target_volume:
                left_vol = volume_profile[left_idx] if left_idx >= 0 else 0
                right_vol = volume_profile[right_idx] if right_idx < len(volume_profile) else 0

                if left_vol == 0 and right_vol == 0:
                    break

                if left_vol >= right_vol and left_idx >= 0:
                    value_area_indices.append(left_idx)
                    accumulated_volume += left_vol
                    left_idx -= 1
                elif right_idx < len(volume_profile):
                    value_area_indices.append(right_idx)
                    accumulated_volume += right_vol
                    right_idx += 1
                else:
                    break

            # Value area bounds
            va_low = bins[min(value_area_indices)]
            va_high = bins[max(value_area_indices) + 1]

            # Price position relative to POC
            distance_from_poc = ((current_price - poc_price) / poc_price) * 100

            if current_price > poc_price * 1.02:
                price_position = "above_poc"
            elif current_price < poc_price * 0.98:
                price_position = "below_poc"
            else:
                price_position = "at_poc"

            # Volume at current price level
            current_bin_idx = np.searchsorted(bins, current_price, side='right') - 1
            current_bin_idx = max(0, min(len(volume_profile) - 1, current_bin_idx))
            volume_at_current = volume_profile[current_bin_idx]

            # Detect recent volume surge
            recent_avg_volume = np.mean(volumes[-5:])
            historical_avg_volume = np.mean(volumes)
            volume_surge_ratio = recent_avg_volume / historical_avg_volume if historical_avg_volume > 0 else 1.0

            return {
                "poc": float(poc_price),
                "poc_volume": float(poc_volume),
                "value_area_high": float(va_high),
                "value_area_low": float(va_low),
                "price_position": price_position,
                "distance_from_poc_pct": float(distance_from_poc),
                "volume_at_current": float(volume_at_current),
                "volume_surge_ratio": float(volume_surge_ratio),
                "current_in_value_area": va_low <= current_price <= va_high,
                "poc_volume_pct": float((poc_volume / total_volume) * 100),
            }

        except Exception as e:
            print(f"Error calculating volume profile: {e}")
            return None

    def _interpret_profile(
        self, metrics: Dict[str, Any], current_price: float
    ) -> tuple[Direction, float, float, str]:
        """
        Interpret volume profile metrics to determine directional bias.

        Returns: (direction, score, confidence, rationale)
        """
        poc = metrics["poc"]
        va_high = metrics["value_area_high"]
        va_low = metrics["value_area_low"]
        price_position = metrics["price_position"]
        distance_from_poc = metrics["distance_from_poc_pct"]
        volume_surge = metrics["volume_surge_ratio"]
        in_value_area = metrics["current_in_value_area"]
        poc_volume_pct = metrics["poc_volume_pct"]

        # Initialize
        score = 0.0
        confidence = 50.0

        # Key signals from volume profile

        # 1. Price above POC with volume surge = bullish breakout
        if price_position == "above_poc" and volume_surge > 1.3:
            direction = Direction.BULLISH
            score = 50 + min(40, abs(distance_from_poc) * 3)
            confidence = 65 + min(25, (volume_surge - 1.0) * 30)

            rationale = (
                f"Bullish volume profile breakout: Price {abs(distance_from_poc):.1f}% above POC "
                f"(${poc:.2f}) with {volume_surge:.1f}x volume surge. "
                f"Breaking above value area high (${va_high:.2f}) signals institutional accumulation. "
                f"Strong momentum continuation expected as price moves through low resistance zone."
            )

        # 2. Price below POC with volume surge = bearish breakdown
        elif price_position == "below_poc" and volume_surge > 1.3:
            direction = Direction.BEARISH
            score = -(50 + min(40, abs(distance_from_poc) * 3))
            confidence = 65 + min(25, (volume_surge - 1.0) * 30)

            rationale = (
                f"Bearish volume profile breakdown: Price {abs(distance_from_poc):.1f}% below POC "
                f"(${poc:.2f}) with {volume_surge:.1f}x volume surge. "
                f"Breaking below value area low (${va_low:.2f}) signals institutional distribution. "
                f"Downside acceleration expected as price falls through weak support."
            )

        # 3. Price at POC = balanced, look for volume surge direction
        elif price_position == "at_poc":
            if volume_surge > 1.5:
                # High volume at POC = preparing for breakout (direction unclear)
                direction = Direction.NEUTRAL
                score = 0
                confidence = 55

                rationale = (
                    f"Price consolidating at POC (${poc:.2f}) with {volume_surge:.1f}x volume. "
                    f"Heavy trading at this level suggests institutional positioning. "
                    f"Wait for directional breakout from value area (${va_low:.2f}-${va_high:.2f}) "
                    f"before taking directional stance."
                )
            else:
                # Low volume at POC = balanced market
                direction = Direction.NEUTRAL
                score = 0
                confidence = 50

                rationale = (
                    f"Price balanced at POC (${poc:.2f}) with normal volume. "
                    f"Market is in equilibrium within value area (${va_low:.2f}-${va_high:.2f}). "
                    f"No strong directional bias from volume profile - wait for breakout."
                )

        # 4. Price above POC but low volume = weak breakout (potential reversal)
        elif price_position == "above_poc" and volume_surge < 1.0:
            direction = Direction.BEARISH
            score = -25
            confidence = 55

            rationale = (
                f"Weak breakout: Price above POC (${poc:.2f}) but volume declining ({volume_surge:.2f}x). "
                f"Lack of volume confirmation suggests false breakout. "
                f"Expect pullback toward value area high (${va_high:.2f}) as buyers lose conviction."
            )

        # 5. Price below POC but low volume = weak breakdown (potential bounce)
        elif price_position == "below_poc" and volume_surge < 1.0:
            direction = Direction.BULLISH
            score = 25
            confidence = 55

            rationale = (
                f"Weak breakdown: Price below POC (${poc:.2f}) but volume declining ({volume_surge:.2f}x). "
                f"Lack of volume confirmation suggests false breakdown. "
                f"Expect bounce toward value area low (${va_low:.2f}) as sellers exhaust."
            )

        # 6. Price at value area edges = high probability reversal zones
        elif current_price >= va_high * 0.99 and current_price <= va_high * 1.01:
            if volume_surge > 1.2:
                direction = Direction.BULLISH
                score = 35
                confidence = 70
                rationale = (
                    f"Bullish value area breakout: Price testing value area high (${va_high:.2f}) "
                    f"with {volume_surge:.1f}x volume. Breaking above this resistance with conviction "
                    f"typically leads to continuation toward next high volume node."
                )
            else:
                direction = Direction.BEARISH
                score = -30
                confidence = 65
                rationale = (
                    f"Rejection at value area high (${va_high:.2f}) with weak volume ({volume_surge:.2f}x). "
                    f"Failure to break resistance suggests reversal back toward POC (${poc:.2f})."
                )

        elif current_price >= va_low * 0.99 and current_price <= va_low * 1.01:
            if volume_surge > 1.2:
                direction = Direction.BEARISH
                score = -35
                confidence = 70
                rationale = (
                    f"Bearish value area breakdown: Price testing value area low (${va_low:.2f}) "
                    f"with {volume_surge:.1f}x volume. Breaking below this support with conviction "
                    f"typically leads to acceleration toward next low volume node."
                )
            else:
                direction = Direction.BULLISH
                score = 30
                confidence = 65
                rationale = (
                    f"Bounce at value area low (${va_low:.2f}) with weak volume ({volume_surge:.2f}x). "
                    f"Support holding suggests reversal back toward POC (${poc:.2f})."
                )

        else:
            # Price in middle of value area - neutral
            direction = Direction.NEUTRAL
            score = 0
            confidence = 50
            rationale = (
                f"Price within value area (${va_low:.2f}-${va_high:.2f}), "
                f"currently trading at ${current_price:.2f} with POC at ${poc:.2f}. "
                f"No clear directional bias from volume profile structure. "
                f"Monitor for breakout from value area boundaries."
            )

        # Boost confidence if POC is very concentrated (strong level)
        if poc_volume_pct > 15:
            confidence += 5

        return direction, score, min(90, confidence), rationale

    def _create_neutral_result(self, reason: str) -> SignalResult:
        """Create a neutral result when signal cannot be calculated."""
        return SignalResult(
            signal_name=self.name,
            direction=Direction.NEUTRAL,
            score=0.0,
            confidence=0.0,
            rationale=f"No volume profile signal: {reason}",
            details={"error": reason},
            timestamp=datetime.now(),
        )
