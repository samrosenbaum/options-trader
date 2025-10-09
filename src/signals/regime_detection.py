"""Market regime detection for determining trending vs ranging conditions.

Theory: Markets alternate between trending (momentum) and ranging (mean reversion)
regimes. Correctly identifying the current regime helps predict whether momentum
strategies (follow the trend) or mean reversion strategies (fade extremes) will work.

This signal analyzes:
1. ADX (Average Directional Index) for trend strength
2. Bollinger Band width for volatility regime
3. Linear regression R-squared for trend quality
4. Price action patterns (higher highs/lower lows vs consolidation)

In trending regimes: Momentum continues, directional bias follows the trend
In ranging regimes: Mean reversion dominates, extremes get faded
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .base import Direction, Signal, SignalResult


class RegimeDetector(Signal):
    """Detect market regime (trending vs ranging) for directional prediction."""

    def __init__(self, weight: float = 0.25):
        """Initialize with default weight from master plan."""
        super().__init__(name="Regime Detection", weight=weight)

    def get_required_data(self) -> List[str]:
        """Required data fields for regime analysis."""
        return [
            "price_history",  # Recent price data (OHLC)
            "stock_price",  # Current stock price
        ]

    def calculate(self, data: Dict[str, Any]) -> SignalResult:
        """
        Calculate directional bias based on market regime.

        Args:
            data: Must contain price_history (DataFrame with OHLC), stock_price

        Returns:
            SignalResult with regime-based directional bias
        """
        if not self.validate_data(data):
            return self._create_neutral_result("Missing required data")

        price_history = data["price_history"]
        stock_price = float(data.get("stock_price", 0))

        if price_history.empty or stock_price <= 0:
            return self._create_neutral_result("Invalid data values")

        # Calculate regime metrics
        regime_metrics = self._calculate_regime_metrics(price_history, stock_price)

        if regime_metrics is None:
            return self._create_neutral_result("Insufficient price history")

        # Determine directional bias based on regime
        direction, score, confidence, rationale = self._interpret_regime(
            regime_metrics, price_history
        )

        return SignalResult(
            signal_name=self.name,
            direction=direction,
            score=score,
            confidence=self.get_adjusted_confidence(confidence),
            rationale=rationale,
            details=regime_metrics,
            timestamp=datetime.now(),
        )

    def _calculate_regime_metrics(
        self, price_history: pd.DataFrame, stock_price: float
    ) -> Optional[Dict[str, Any]]:
        """
        Calculate market regime indicators.

        Returns dictionary with:
        - adx: Average Directional Index (trend strength)
        - adx_signal: "strong_trend", "weak_trend", or "ranging"
        - bb_width: Bollinger Band width (volatility)
        - bb_width_percentile: Current BB width vs historical
        - r_squared: Linear regression R² (trend quality)
        - regime: "trending_bullish", "trending_bearish", "ranging"
        - regime_confidence: 0-100 confidence in regime classification
        - price_momentum: Current momentum direction
        """
        try:
            # Need at least 20 periods for meaningful calculations
            if len(price_history) < 20:
                return None

            df = price_history.copy()

            # Ensure we have the right columns
            if "close" not in df.columns:
                df["close"] = df.get("Close", df.get("CLOSE"))

            closes = df["close"].values
            highs = df.get("high", df.get("High", df.get("HIGH", closes))).values
            lows = df.get("low", df.get("Low", df.get("LOW", closes))).values

            # 1. Calculate ADX (Average Directional Index)
            adx, di_plus, di_minus = self._calculate_adx(highs, lows, closes)

            # Classify trend strength
            if adx > 25:
                adx_signal = "strong_trend"
            elif adx > 20:
                adx_signal = "weak_trend"
            else:
                adx_signal = "ranging"

            # 2. Calculate Bollinger Band Width
            bb_width, bb_width_pct = self._calculate_bb_width(closes)

            # 3. Calculate Linear Regression R-squared
            r_squared, slope = self._calculate_trend_quality(closes)

            # 4. Determine overall regime
            regime, regime_confidence = self._classify_regime(
                adx, r_squared, bb_width_pct, slope, di_plus, di_minus
            )

            # 5. Current momentum direction
            sma_20 = np.mean(closes[-20:])
            price_vs_sma = ((stock_price - sma_20) / sma_20) * 100

            if price_vs_sma > 2:
                momentum = "bullish"
            elif price_vs_sma < -2:
                momentum = "bearish"
            else:
                momentum = "neutral"

            return {
                "adx": float(adx),
                "adx_signal": adx_signal,
                "di_plus": float(di_plus),
                "di_minus": float(di_minus),
                "bb_width": float(bb_width),
                "bb_width_percentile": float(bb_width_pct),
                "r_squared": float(r_squared),
                "regression_slope": float(slope),
                "regime": regime,
                "regime_confidence": float(regime_confidence),
                "price_momentum": momentum,
                "price_vs_sma20": float(price_vs_sma),
            }

        except Exception as e:
            import traceback
            print(f"Error calculating regime metrics: {e}")
            traceback.print_exc()
            return None

    def _calculate_adx(
        self, highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int = 14
    ) -> tuple[float, float, float]:
        """
        Calculate Average Directional Index (ADX) and directional indicators.

        Returns: (adx, di_plus, di_minus)
        """
        # True Range
        high_low = highs - lows
        high_close = np.abs(highs - np.roll(closes, 1))
        low_close = np.abs(lows - np.roll(closes, 1))
        true_range = np.maximum(high_low, np.maximum(high_close, low_close))

        # Directional Movement
        plus_dm = np.maximum(highs - np.roll(highs, 1), 0)
        minus_dm = np.maximum(np.roll(lows, 1) - lows, 0)

        # When both are positive, only count the larger one
        mask_plus = minus_dm > plus_dm
        mask_minus = plus_dm > minus_dm
        plus_dm[mask_plus] = 0
        minus_dm[mask_minus] = 0

        # Smooth the values using Wilder's smoothing
        atr = self._wilder_smooth(true_range, period)
        plus_di_smooth = self._wilder_smooth(plus_dm, period)
        minus_di_smooth = self._wilder_smooth(minus_dm, period)

        # Directional Indicators (add small epsilon to avoid division by zero)
        epsilon = 1e-10
        plus_di = 100 * plus_di_smooth / (atr + epsilon)
        minus_di = 100 * minus_di_smooth / (atr + epsilon)

        # Directional Index (DX)
        dx = 100 * np.abs(plus_di - minus_di) / (plus_di + minus_di + 0.0001)

        # ADX is smoothed DX
        adx = self._wilder_smooth(dx, period)

        return adx[-1], plus_di[-1], minus_di[-1]

    def _wilder_smooth(self, data: np.ndarray, period: int) -> np.ndarray:
        """Wilder's smoothing (similar to EMA but different formula)."""
        smoothed = np.zeros_like(data)
        smoothed[period - 1] = np.mean(data[:period])

        for i in range(period, len(data)):
            smoothed[i] = (smoothed[i - 1] * (period - 1) + data[i]) / period

        return smoothed

    def _calculate_bb_width(
        self, closes: np.ndarray, period: int = 20, std_dev: float = 2.0
    ) -> tuple[float, float]:
        """
        Calculate Bollinger Band width and its percentile.

        Returns: (current_width, width_percentile)
        """
        if len(closes) < period:
            return 0.0, 50.0

        # Current BB width
        sma = np.mean(closes[-period:])
        std = np.std(closes[-period:])
        bb_width = (std_dev * std) / sma

        # Historical BB widths for percentile
        historical_widths = []
        for i in range(period, len(closes)):
            window_sma = np.mean(closes[i - period : i])
            window_std = np.std(closes[i - period : i])
            historical_widths.append((std_dev * window_std) / window_sma)

        if len(historical_widths) == 0:
            return bb_width, 50.0

        # Percentile (what % of historical widths are below current)
        percentile = (
            np.sum(np.array(historical_widths) < bb_width)
            / len(historical_widths)
            * 100
        )

        return bb_width, percentile

    def _calculate_trend_quality(
        self, closes: np.ndarray
    ) -> tuple[float, float]:
        """
        Calculate linear regression R-squared to measure trend quality.

        Returns: (r_squared, slope)
        """
        n = len(closes)
        x = np.arange(n)
        y = closes

        # Linear regression
        x_mean = np.mean(x)
        y_mean = np.mean(y)

        numerator = np.sum((x - x_mean) * (y - y_mean))
        denominator_x = np.sum((x - x_mean) ** 2)
        denominator_y = np.sum((y - y_mean) ** 2)

        if denominator_x == 0:
            return 0.0, 0.0

        slope = numerator / denominator_x

        # R-squared
        y_pred = slope * (x - x_mean) + y_mean
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = denominator_y

        if ss_tot == 0:
            return 0.0, slope

        r_squared = 1 - (ss_res / ss_tot)

        return max(0.0, min(1.0, r_squared)), slope

    def _classify_regime(
        self,
        adx: float,
        r_squared: float,
        bb_width_percentile: float,
        slope: float,
        di_plus: float,
        di_minus: float,
    ) -> tuple[str, float]:
        """
        Classify the market regime based on all indicators.

        Returns: (regime_name, confidence)
        """
        confidence = 50.0

        # Strong trending conditions
        if adx > 25 and r_squared > 0.5:
            # Determine trend direction
            if slope > 0 and di_plus > di_minus:
                regime = "trending_bullish"
                confidence = 70 + min(20, (adx - 25))
            elif slope < 0 and di_minus > di_plus:
                regime = "trending_bearish"
                confidence = 70 + min(20, (adx - 25))
            else:
                # Mixed signals
                regime = "trending_unclear"
                confidence = 60

        # Weak trend or transitioning
        elif adx > 20:
            if r_squared > 0.3:
                if slope > 0:
                    regime = "weak_bullish_trend"
                    confidence = 55
                else:
                    regime = "weak_bearish_trend"
                    confidence = 55
            else:
                regime = "transitioning"
                confidence = 45
        else:
            # Ranging market
            regime = "ranging"
            confidence = 60 + min(15, (20 - adx))

            # In ranging markets, low BB width = consolidation
            if bb_width_percentile < 30:
                regime = "tight_consolidation"
                confidence += 10

        return regime, min(90, confidence)

    def _interpret_regime(
        self, metrics: Dict[str, Any], price_history: pd.DataFrame
    ) -> tuple[Direction, float, float, str]:
        """
        Interpret regime metrics to determine directional bias.

        Returns: (direction, score, confidence, rationale)
        """
        regime = metrics["regime"]
        regime_confidence = metrics["regime_confidence"]
        price_momentum = metrics["price_momentum"]
        adx = metrics["adx"]
        r_squared = metrics["r_squared"]

        # Initialize
        score = 0.0
        confidence = regime_confidence

        # Strategy: In trending regimes, follow the trend
        # In ranging regimes, expect mean reversion (neutral or fade extremes)

        if regime == "trending_bullish":
            direction = Direction.BULLISH
            score = 60 + min(30, adx - 25)  # Stronger trends = higher score
            rationale = (
                f"Strong bullish trend detected (ADX={adx:.1f}, R²={r_squared:.2f}). "
                f"Market is in momentum regime - follow the uptrend with calls. "
                f"Trend strength suggests continuation is likely."
            )

        elif regime == "trending_bearish":
            direction = Direction.BEARISH
            score = -(60 + min(30, adx - 25))
            rationale = (
                f"Strong bearish trend detected (ADX={adx:.1f}, R²={r_squared:.2f}). "
                f"Market is in momentum regime - follow the downtrend with puts. "
                f"Trend strength suggests continuation is likely."
            )

        elif regime == "weak_bullish_trend":
            direction = Direction.BULLISH
            score = 30
            confidence = 55
            rationale = (
                f"Weak bullish trend forming (ADX={adx:.1f}). "
                f"Early momentum phase - calls have edge but trend not fully established. "
                f"Monitor for trend confirmation or reversal."
            )

        elif regime == "weak_bearish_trend":
            direction = Direction.BEARISH
            score = -30
            confidence = 55
            rationale = (
                f"Weak bearish trend forming (ADX={adx:.1f}). "
                f"Early downside momentum - puts have slight edge but trend not confirmed. "
                f"Watch for breakdown or bounce."
            )

        elif regime == "ranging" or regime == "tight_consolidation":
            direction = Direction.NEUTRAL
            score = 0
            confidence = 60

            consolidation_note = ""
            if regime == "tight_consolidation":
                consolidation_note = " Price is coiling in tight consolidation - breakout likely imminent."

            rationale = (
                f"Ranging market regime (ADX={adx:.1f}). "
                f"Mean reversion dominates - directional bias is low.{consolidation_note} "
                f"Consider waiting for regime shift or using neutral strategies."
            )

        elif regime == "transitioning":
            # Use price momentum to guide during transition
            if price_momentum == "bullish":
                direction = Direction.BULLISH
                score = 20
                confidence = 45
                rationale = (
                    f"Market transitioning between regimes (ADX={adx:.1f}). "
                    f"Current price momentum is bullish but conviction is low. "
                    f"Favor calls cautiously until regime clarity emerges."
                )
            elif price_momentum == "bearish":
                direction = Direction.BEARISH
                score = -20
                confidence = 45
                rationale = (
                    f"Market transitioning between regimes (ADX={adx:.1f}). "
                    f"Current price momentum is bearish but conviction is low. "
                    f"Favor puts cautiously until regime clarity emerges."
                )
            else:
                direction = Direction.NEUTRAL
                score = 0
                confidence = 40
                rationale = (
                    f"Market in transition with unclear direction (ADX={adx:.1f}). "
                    f"Both trend and mean reversion signals are weak. "
                    f"Wait for regime establishment before taking directional positions."
                )

        else:
            # trending_unclear
            direction = Direction.NEUTRAL
            score = 0
            confidence = 50
            rationale = (
                f"Trend strength detected but direction mixed (ADX={adx:.1f}). "
                f"Conflicting directional signals reduce conviction. "
                f"Monitor for trend resolution."
            )

        return direction, score, confidence, rationale

    def _create_neutral_result(self, reason: str) -> SignalResult:
        """Create a neutral result when signal cannot be calculated."""
        return SignalResult(
            signal_name=self.name,
            direction=Direction.NEUTRAL,
            score=0.0,
            confidence=0.0,
            rationale=f"No regime signal: {reason}",
            details={"error": reason},
            timestamp=datetime.now(),
        )
