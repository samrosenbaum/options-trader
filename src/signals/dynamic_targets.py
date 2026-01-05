"""Dynamic Profit Target Calculator.

Adjusts profit targets and stop losses based on:
- IV percentile (high IV = lower targets, expect crush)
- DTE (shorter time = tighter targets)
- Position Greeks (high gamma = wider stops)
- Market regime (trending vs ranging)

This helps avoid leaving money on the table in high IV environments
while also giving trades room to work in low IV environments.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Optional, Tuple

import numpy as np


@dataclass
class DynamicTargets:
    """Dynamic profit target and stop loss levels."""

    profit_target_pct: float  # e.g., 0.50 for 50%
    stop_loss_pct: float  # e.g., -0.50 for -50%
    trailing_stop_activation: float  # When to activate trailing stop
    trailing_stop_distance: float  # Distance from peak
    first_scale_out_pct: float  # First partial exit level
    second_scale_out_pct: float  # Second partial exit level
    time_stop_dte: int  # Exit if DTE falls below this
    rationale: str


class DynamicTargetCalculator:
    """Calculate dynamic profit targets based on market conditions."""

    # Base targets for different play types
    BASE_TARGETS = {
        "SCALP": {"profit": 0.25, "stop": -0.30, "first_scale": 0.15},
        "SWING": {"profit": 0.50, "stop": -0.50, "first_scale": 0.30},
        "BREAKOUT": {"profit": 1.00, "stop": -0.50, "first_scale": 0.50},
        "PULLBACK": {"profit": 0.40, "stop": -0.40, "first_scale": 0.25},
        "BOUNCE": {"profit": 0.30, "stop": -0.35, "first_scale": 0.20},
        "DEFAULT": {"profit": 0.50, "stop": -0.50, "first_scale": 0.30},
    }

    def calculate_targets(
        self,
        play_type: str = "DEFAULT",
        iv_percentile: Optional[float] = None,
        dte: Optional[int] = None,
        delta: Optional[float] = None,
        gamma: Optional[float] = None,
        theta: Optional[float] = None,
        option_price: Optional[float] = None,
        market_regime: Optional[str] = None,
        historical_win_rate: Optional[float] = None,
    ) -> DynamicTargets:
        """
        Calculate dynamic profit targets and stop losses.

        Args:
            play_type: Type of trade (SCALP, SWING, BREAKOUT, etc.)
            iv_percentile: Current IV percentile (0-100)
            dte: Days to expiration
            delta: Option delta
            gamma: Option gamma
            theta: Option theta (daily decay)
            option_price: Current option price
            market_regime: "trending_bullish", "trending_bearish", "ranging"
            historical_win_rate: Historical win rate for similar setups

        Returns:
            DynamicTargets with adjusted levels
        """
        base = self.BASE_TARGETS.get(play_type.upper(), self.BASE_TARGETS["DEFAULT"])

        profit_target = base["profit"]
        stop_loss = base["stop"]
        first_scale = base["first_scale"]

        adjustments = []

        # 1. IV Percentile Adjustment
        # High IV = lower targets (premium already rich, expect crush)
        # Low IV = higher targets (need bigger move for profits)
        if iv_percentile is not None:
            iv_adj = self._adjust_for_iv(iv_percentile, profit_target, stop_loss)
            profit_target = iv_adj["profit"]
            stop_loss = iv_adj["stop"]
            if iv_adj.get("reason"):
                adjustments.append(iv_adj["reason"])

        # 2. DTE Adjustment
        # Shorter DTE = tighter targets (theta working against you)
        if dte is not None:
            dte_adj = self._adjust_for_dte(dte, profit_target, stop_loss)
            profit_target = dte_adj["profit"]
            stop_loss = dte_adj["stop"]
            if dte_adj.get("reason"):
                adjustments.append(dte_adj["reason"])

        # 3. Greeks Adjustment
        if delta is not None or gamma is not None or theta is not None:
            greeks_adj = self._adjust_for_greeks(
                delta, gamma, theta, option_price, profit_target, stop_loss
            )
            profit_target = greeks_adj["profit"]
            stop_loss = greeks_adj["stop"]
            if greeks_adj.get("reason"):
                adjustments.append(greeks_adj["reason"])

        # 4. Market Regime Adjustment
        if market_regime:
            regime_adj = self._adjust_for_regime(
                market_regime, profit_target, stop_loss, play_type
            )
            profit_target = regime_adj["profit"]
            stop_loss = regime_adj["stop"]
            if regime_adj.get("reason"):
                adjustments.append(regime_adj["reason"])

        # 5. Historical Performance Adjustment
        if historical_win_rate is not None:
            perf_adj = self._adjust_for_performance(
                historical_win_rate, profit_target, stop_loss
            )
            profit_target = perf_adj["profit"]
            stop_loss = perf_adj["stop"]
            if perf_adj.get("reason"):
                adjustments.append(perf_adj["reason"])

        # Calculate derived values
        trailing_activation = profit_target * 0.5  # Activate at 50% of target
        trailing_distance = 0.20  # 20% from peak

        second_scale = profit_target * 0.8  # Second scale at 80% of target

        # Time stop based on DTE
        if dte is not None:
            if dte <= 3:
                time_stop_dte = 1
            elif dte <= 7:
                time_stop_dte = 2
            elif dte <= 14:
                time_stop_dte = 3
            else:
                time_stop_dte = max(3, dte // 4)
        else:
            time_stop_dte = 3

        rationale = " | ".join(adjustments) if adjustments else "Using base targets"

        return DynamicTargets(
            profit_target_pct=round(profit_target, 3),
            stop_loss_pct=round(stop_loss, 3),
            trailing_stop_activation=round(trailing_activation, 3),
            trailing_stop_distance=trailing_distance,
            first_scale_out_pct=round(first_scale, 3),
            second_scale_out_pct=round(second_scale, 3),
            time_stop_dte=time_stop_dte,
            rationale=rationale,
        )

    def _adjust_for_iv(
        self, iv_percentile: float, profit: float, stop: float
    ) -> Dict[str, any]:
        """Adjust targets based on IV percentile."""
        result = {"profit": profit, "stop": stop, "reason": None}

        if iv_percentile >= 80:
            # Very high IV - expect crush, take profits early
            result["profit"] = profit * 0.65
            result["stop"] = stop * 0.85  # Slightly tighter stop
            result["reason"] = f"High IV ({iv_percentile:.0f}%) - lower target, expect crush"

        elif iv_percentile >= 60:
            # Elevated IV
            result["profit"] = profit * 0.80
            result["reason"] = f"Elevated IV ({iv_percentile:.0f}%) - moderately lower target"

        elif iv_percentile <= 20:
            # Very low IV - need bigger move, give room
            result["profit"] = profit * 1.40
            result["stop"] = stop * 1.20  # Wider stop
            result["reason"] = f"Low IV ({iv_percentile:.0f}%) - higher target, need bigger move"

        elif iv_percentile <= 40:
            # Below average IV
            result["profit"] = profit * 1.20
            result["reason"] = f"Below-avg IV ({iv_percentile:.0f}%) - slightly higher target"

        return result

    def _adjust_for_dte(
        self, dte: int, profit: float, stop: float
    ) -> Dict[str, any]:
        """Adjust targets based on days to expiration."""
        result = {"profit": profit, "stop": stop, "reason": None}

        if dte <= 3:
            # Very short DTE - take what you can get
            result["profit"] = min(profit, 0.30)
            result["stop"] = max(stop, -0.40)
            result["reason"] = f"Short DTE ({dte}d) - tight targets, theta burning"

        elif dte <= 7:
            # Short DTE
            result["profit"] = profit * 0.75
            result["stop"] = max(stop, -0.45)
            result["reason"] = f"DTE {dte}d - reduced target due to theta"

        elif dte <= 14:
            # Moderate DTE
            result["profit"] = profit * 0.90
            result["reason"] = f"DTE {dte}d - slightly reduced target"

        elif dte >= 45:
            # Long DTE - can give it room
            result["profit"] = profit * 1.15
            result["stop"] = stop * 1.10
            result["reason"] = f"Long DTE ({dte}d) - room for thesis to play out"

        return result

    def _adjust_for_greeks(
        self,
        delta: Optional[float],
        gamma: Optional[float],
        theta: Optional[float],
        option_price: Optional[float],
        profit: float,
        stop: float,
    ) -> Dict[str, any]:
        """Adjust targets based on option Greeks."""
        result = {"profit": profit, "stop": stop, "reason": None}
        reasons = []

        # Delta adjustment
        if delta is not None:
            abs_delta = abs(delta)
            if abs_delta >= 0.70:
                # High delta (deep ITM) - behaves like stock
                result["profit"] = profit * 0.80
                result["stop"] = max(stop, -0.35)
                reasons.append("high delta - tighter mgmt")
            elif abs_delta <= 0.20:
                # Low delta (deep OTM) - lottery ticket
                result["profit"] = profit * 1.50
                result["stop"] = stop * 0.70  # Can lose it all anyway
                reasons.append("low delta - swing for fences")

        # Gamma adjustment
        if gamma is not None and gamma >= 0.08:
            # High gamma - moves fast both ways
            result["stop"] = max(stop, -0.40)
            reasons.append("high gamma - fast moves")

        # Theta adjustment
        if theta is not None and option_price and option_price > 0:
            theta_pct = abs(theta) / option_price
            if theta_pct >= 0.08:
                # Bleeding >8% per day
                result["profit"] = min(result["profit"], profit * 0.70)
                reasons.append("severe theta decay")
            elif theta_pct >= 0.05:
                result["profit"] = min(result["profit"], profit * 0.85)
                reasons.append("high theta decay")

        if reasons:
            result["reason"] = "Greeks: " + ", ".join(reasons)

        return result

    def _adjust_for_regime(
        self,
        regime: str,
        profit: float,
        stop: float,
        play_type: str,
    ) -> Dict[str, any]:
        """Adjust targets based on market regime."""
        result = {"profit": profit, "stop": stop, "reason": None}
        regime_lower = regime.lower()

        if "trending" in regime_lower:
            if play_type.upper() in ("BREAKOUT", "SWING"):
                # Trending + momentum play = let it run
                result["profit"] = profit * 1.25
                result["stop"] = stop * 1.10
                result["reason"] = f"Trending regime - extended targets"
            else:
                result["reason"] = f"Trending regime"

        elif "ranging" in regime_lower or "consolidation" in regime_lower:
            # Mean reversion - take profits quick
            result["profit"] = profit * 0.75
            result["stop"] = max(stop, -0.40)
            result["reason"] = "Ranging regime - tighter targets"

        elif "choppy" in regime_lower:
            # Choppy - very tight
            result["profit"] = profit * 0.65
            result["stop"] = max(stop, -0.35)
            result["reason"] = "Choppy regime - quick exits"

        return result

    def _adjust_for_performance(
        self,
        win_rate: float,
        profit: float,
        stop: float,
    ) -> Dict[str, any]:
        """Adjust based on historical win rate for similar setups."""
        result = {"profit": profit, "stop": stop, "reason": None}

        if win_rate >= 0.70:
            # High win rate - can be patient
            result["profit"] = profit * 1.15
            result["reason"] = f"High historical win rate ({win_rate:.0%})"
        elif win_rate <= 0.35:
            # Low win rate - need bigger wins
            result["profit"] = profit * 1.30
            result["stop"] = stop * 0.80  # Tighter stop
            result["reason"] = f"Low win rate ({win_rate:.0%}) - need bigger wins"

        return result

    def get_exit_recommendation(
        self,
        current_profit_pct: float,
        targets: DynamicTargets,
        momentum: str = "UNKNOWN",
        dte: Optional[int] = None,
    ) -> Tuple[str, str]:
        """
        Get exit recommendation based on current profit and targets.

        Returns:
            Tuple of (action, reason)
            action: "HOLD", "TAKE_PARTIAL", "TAKE_FULL", "CUT_LOSS"
        """
        # Check stop loss
        if current_profit_pct <= targets.stop_loss_pct * 100:
            return "CUT_LOSS", f"Hit stop loss ({targets.stop_loss_pct:.0%})"

        # Check time stop
        if dte is not None and dte <= targets.time_stop_dte:
            if current_profit_pct > 0:
                return "TAKE_FULL", f"Time stop ({dte} DTE) - taking profits"
            else:
                return "CUT_LOSS", f"Time stop ({dte} DTE) - cutting loss"

        # Check profit target
        if current_profit_pct >= targets.profit_target_pct * 100:
            if momentum == "STRONG":
                return "TAKE_PARTIAL", f"Hit target ({targets.profit_target_pct:.0%}) but momentum strong - partial exit"
            return "TAKE_FULL", f"Hit profit target ({targets.profit_target_pct:.0%})"

        # Check second scale out
        if current_profit_pct >= targets.second_scale_out_pct * 100:
            if momentum in ("WEAKENING", "DEAD"):
                return "TAKE_PARTIAL", f"Near target with weak momentum - partial exit"
            return "HOLD", f"Approaching target ({current_profit_pct:.1f}% of {targets.profit_target_pct:.0%})"

        # Check first scale out
        if current_profit_pct >= targets.first_scale_out_pct * 100:
            if momentum == "WEAKENING":
                return "TAKE_PARTIAL", f"Momentum weakening at +{current_profit_pct:.1f}%"
            return "HOLD", "On track - first milestone hit"

        # Trailing stop check
        if current_profit_pct >= targets.trailing_stop_activation * 100:
            return "HOLD", f"Trailing stop activated at +{current_profit_pct:.1f}%"

        # Default hold
        return "HOLD", f"Position working (+{current_profit_pct:.1f}%)"


__all__ = ["DynamicTargetCalculator", "DynamicTargets"]
