"""IV Mean Reversion Predictor and Scorer.

This module predicts whether implied volatility is likely to expand or contract
based on statistical analysis, helping identify:
- Premium selling opportunities (when IV is elevated and likely to crush)
- Premium buying opportunities (when IV is depressed and likely to expand)

Key concepts:
- Ornstein-Uhlenbeck process for IV mean reversion
- IV term structure analysis
- IV velocity (rate of change)
- Realized vs implied volatility spread
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional, Tuple

import numpy as np


class IVMeanReversionPredictor:
    """Predict IV direction using statistical mean reversion models."""

    def __init__(self, lookback_days: int = 252):
        """
        Initialize predictor.

        Args:
            lookback_days: Number of days of IV history to use (default 1 year)
        """
        self.lookback_days = lookback_days

    def predict(
        self,
        current_iv: float,
        historical_iv: Optional[np.ndarray] = None,
        realized_vol: Optional[float] = None,
        front_month_iv: Optional[float] = None,
        back_month_iv: Optional[float] = None,
    ) -> Dict[str, any]:
        """
        Predict IV direction and magnitude of expected change.

        Args:
            current_iv: Current implied volatility (as decimal, e.g., 0.30)
            historical_iv: Array of historical IV values
            realized_vol: Recent realized volatility (e.g., 20-day)
            front_month_iv: IV of front-month options
            back_month_iv: IV of back-month options

        Returns:
            Prediction dictionary with direction, magnitude, and confidence
        """
        result = {
            "iv_direction": "neutral",
            "expected_iv_change_pct": 0.0,
            "days_to_mean": None,
            "confidence": 0.0,
            "signals": [],
            "recommendation": "",
        }

        signals = []
        confidence_factors = []

        # Signal 1: Z-score analysis
        if historical_iv is not None and len(historical_iv) >= 20:
            zscore_signal = self._analyze_zscore(current_iv, historical_iv)
            signals.append(zscore_signal)
            if zscore_signal["signal"] != "neutral":
                confidence_factors.append(min(abs(zscore_signal["zscore"]) / 2, 1.0))

        # Signal 2: IV vs Realized Vol spread
        if realized_vol is not None and realized_vol > 0:
            rv_signal = self._analyze_iv_rv_spread(current_iv, realized_vol)
            signals.append(rv_signal)
            if rv_signal["signal"] != "neutral":
                confidence_factors.append(min(abs(rv_signal["spread"]) / 0.15, 1.0))

        # Signal 3: Term structure
        if front_month_iv is not None and back_month_iv is not None:
            term_signal = self._analyze_term_structure(front_month_iv, back_month_iv)
            signals.append(term_signal)
            if term_signal["signal"] != "neutral":
                confidence_factors.append(0.7)

        # Signal 4: IV velocity (if we have history)
        if historical_iv is not None and len(historical_iv) >= 5:
            velocity_signal = self._analyze_iv_velocity(historical_iv)
            signals.append(velocity_signal)
            if velocity_signal["signal"] != "neutral":
                confidence_factors.append(0.5)

        # Aggregate signals
        result["signals"] = signals
        result = self._aggregate_signals(result, signals, confidence_factors)

        # Calculate expected days to mean reversion
        if historical_iv is not None and len(historical_iv) >= 60:
            half_life = self._estimate_halflife(historical_iv)
            result["days_to_mean"] = half_life

        # Generate recommendation
        result["recommendation"] = self._generate_recommendation(result)

        return result

    def _analyze_zscore(
        self, current_iv: float, historical_iv: np.ndarray
    ) -> Dict[str, any]:
        """Analyze IV using z-score relative to historical distribution."""
        mean_iv = np.mean(historical_iv)
        std_iv = np.std(historical_iv)

        if std_iv <= 0:
            return {"name": "zscore", "signal": "neutral", "zscore": 0}

        zscore = (current_iv - mean_iv) / std_iv

        if zscore >= 2.0:
            signal = "contract"
            description = f"IV {zscore:.1f}σ above mean - likely to contract"
        elif zscore >= 1.0:
            signal = "slight_contract"
            description = f"IV {zscore:.1f}σ above mean - may contract"
        elif zscore <= -2.0:
            signal = "expand"
            description = f"IV {abs(zscore):.1f}σ below mean - likely to expand"
        elif zscore <= -1.0:
            signal = "slight_expand"
            description = f"IV {abs(zscore):.1f}σ below mean - may expand"
        else:
            signal = "neutral"
            description = f"IV near historical mean (z={zscore:.2f})"

        return {
            "name": "zscore",
            "signal": signal,
            "zscore": zscore,
            "mean_iv": mean_iv,
            "std_iv": std_iv,
            "description": description,
        }

    def _analyze_iv_rv_spread(
        self, current_iv: float, realized_vol: float
    ) -> Dict[str, any]:
        """Analyze spread between implied and realized volatility."""
        spread = current_iv - realized_vol
        spread_pct = spread / realized_vol if realized_vol > 0 else 0

        if spread_pct >= 0.30:  # IV 30%+ above RV
            signal = "contract"
            description = f"IV significantly overpricing actual moves ({spread_pct:.0%} premium)"
        elif spread_pct >= 0.15:
            signal = "slight_contract"
            description = f"IV elevated vs realized vol ({spread_pct:.0%} premium)"
        elif spread_pct <= -0.20:
            signal = "expand"
            description = f"IV underpricing actual moves ({abs(spread_pct):.0%} discount)"
        elif spread_pct <= -0.10:
            signal = "slight_expand"
            description = f"IV slightly discounted vs realized ({abs(spread_pct):.0%})"
        else:
            signal = "neutral"
            description = f"IV fairly priced vs realized vol"

        return {
            "name": "iv_rv_spread",
            "signal": signal,
            "spread": spread,
            "spread_pct": spread_pct,
            "description": description,
        }

    def _analyze_term_structure(
        self, front_iv: float, back_iv: float
    ) -> Dict[str, any]:
        """Analyze IV term structure for event premium."""
        if back_iv <= 0:
            return {"name": "term_structure", "signal": "neutral", "ratio": 1.0}

        ratio = front_iv / back_iv

        if ratio >= 1.20:  # Front month 20%+ above back
            signal = "contract"
            description = f"Backwardation ({ratio:.2f}x) - event premium likely to crush"
        elif ratio >= 1.10:
            signal = "slight_contract"
            description = f"Slight backwardation ({ratio:.2f}x) - elevated event premium"
        elif ratio <= 0.90:
            signal = "expand"
            description = f"Contango ({ratio:.2f}x) - front month IV may expand"
        elif ratio <= 0.95:
            signal = "slight_expand"
            description = f"Slight contango ({ratio:.2f}x)"
        else:
            signal = "neutral"
            description = f"Normal term structure ({ratio:.2f}x)"

        return {
            "name": "term_structure",
            "signal": signal,
            "ratio": ratio,
            "front_iv": front_iv,
            "back_iv": back_iv,
            "description": description,
        }

    def _analyze_iv_velocity(self, historical_iv: np.ndarray) -> Dict[str, any]:
        """Analyze rate of IV change (velocity)."""
        if len(historical_iv) < 5:
            return {"name": "velocity", "signal": "neutral", "velocity": 0}

        # Calculate 5-day change rate
        recent_5d = historical_iv[-5:]
        older_5d = historical_iv[-10:-5] if len(historical_iv) >= 10 else historical_iv[:5]

        recent_avg = np.mean(recent_5d)
        older_avg = np.mean(older_5d)

        velocity = (recent_avg - older_avg) / older_avg if older_avg > 0 else 0

        if velocity >= 0.15:  # IV up 15%+ in 5 days
            signal = "contract"
            description = f"IV spiking (+{velocity:.0%} in 5d) - likely to revert"
        elif velocity >= 0.08:
            signal = "slight_contract"
            description = f"IV rising quickly (+{velocity:.0%} in 5d)"
        elif velocity <= -0.15:
            signal = "expand"
            description = f"IV collapsing ({velocity:.0%} in 5d) - may bounce"
        elif velocity <= -0.08:
            signal = "slight_expand"
            description = f"IV declining ({velocity:.0%} in 5d)"
        else:
            signal = "neutral"
            description = f"IV stable ({velocity:+.1%} in 5d)"

        return {
            "name": "velocity",
            "signal": signal,
            "velocity": velocity,
            "description": description,
        }

    def _aggregate_signals(
        self,
        result: Dict,
        signals: List[Dict],
        confidence_factors: List[float],
    ) -> Dict:
        """Aggregate all signals into final prediction."""
        if not signals:
            return result

        # Count signal directions
        contract_signals = sum(
            1 for s in signals if s["signal"] in ("contract", "slight_contract")
        )
        expand_signals = sum(
            1 for s in signals if s["signal"] in ("expand", "slight_expand")
        )
        strong_contract = sum(1 for s in signals if s["signal"] == "contract")
        strong_expand = sum(1 for s in signals if s["signal"] == "expand")

        # Determine direction
        if contract_signals > expand_signals:
            if strong_contract >= 2 or (strong_contract >= 1 and contract_signals >= 3):
                result["iv_direction"] = "contract"
                result["expected_iv_change_pct"] = -15.0  # Expect 15% IV decline
            else:
                result["iv_direction"] = "slight_contract"
                result["expected_iv_change_pct"] = -8.0
        elif expand_signals > contract_signals:
            if strong_expand >= 2 or (strong_expand >= 1 and expand_signals >= 3):
                result["iv_direction"] = "expand"
                result["expected_iv_change_pct"] = 15.0
            else:
                result["iv_direction"] = "slight_expand"
                result["expected_iv_change_pct"] = 8.0
        else:
            result["iv_direction"] = "neutral"
            result["expected_iv_change_pct"] = 0.0

        # Calculate confidence
        if confidence_factors:
            base_confidence = np.mean(confidence_factors) * 100
            # Boost confidence if signals agree
            agreement_rate = max(contract_signals, expand_signals) / len(signals)
            result["confidence"] = min(95, base_confidence * (0.5 + 0.5 * agreement_rate))
        else:
            result["confidence"] = 0

        return result

    def _estimate_halflife(self, historical_iv: np.ndarray) -> float:
        """
        Estimate mean reversion half-life using Ornstein-Uhlenbeck process.

        The half-life tells us how many days until IV is expected to be
        halfway back to its mean.
        """
        if len(historical_iv) < 60:
            return 30.0  # Default assumption

        # Calculate daily changes
        iv_changes = np.diff(historical_iv)
        iv_levels = historical_iv[:-1]

        # Simple OLS regression: dIV = theta * (mean - IV) * dt + noise
        # Rearranged: dIV/IV = theta * (mean/IV - 1) * dt
        mean_iv = np.mean(historical_iv)

        # Estimate theta using linear regression
        try:
            deviation = iv_levels - mean_iv
            if np.std(deviation) > 0:
                # Regress changes on deviation from mean
                theta = -np.cov(iv_changes, deviation)[0, 1] / np.var(deviation)
                theta = max(0.001, min(1.0, theta))  # Bound theta
                half_life = np.log(2) / theta
                return min(max(5, half_life), 120)  # Bound between 5 and 120 days
        except Exception:
            pass

        return 30.0  # Default

    def _generate_recommendation(self, result: Dict) -> str:
        """Generate actionable recommendation based on prediction."""
        direction = result["iv_direction"]
        confidence = result["confidence"]

        if confidence < 40:
            return "Low confidence in IV direction - no strong edge"

        if direction == "contract":
            if confidence >= 70:
                return "HIGH CONVICTION: Sell premium (credit spreads, iron condors). IV likely to crush."
            else:
                return "Consider selling premium. IV elevated but watch for catalysts."
        elif direction == "slight_contract":
            return "Slightly elevated IV. Consider selling premium on rallies."
        elif direction == "expand":
            if confidence >= 70:
                return "HIGH CONVICTION: Buy premium (debit spreads, straddles). IV likely to expand."
            else:
                return "Consider buying premium. IV depressed, expansion likely."
        elif direction == "slight_expand":
            return "IV slightly depressed. Favor buying premium over selling."
        else:
            return "IV near fair value. No strong directional edge on volatility."


class IVMeanReversionScorer:
    """Scorer that incorporates IV mean reversion analysis."""

    key = "iv_mean_reversion"
    default_weight = 1.2

    def __init__(self):
        self.predictor = IVMeanReversionPredictor()

    def score(self, context) -> Tuple[float, List[str], List[str]]:
        """Score based on IV mean reversion prediction."""
        contract = context.contract
        reasons: List[str] = []
        tags: List[str] = []
        score = 0.0

        # Get IV data from market_data
        current_iv = contract.implied_volatility
        historical_iv = context.market_data.get("historical_iv")
        realized_vol = context.market_data.get("realized_vol")

        # Convert historical_iv to numpy array if it's a list
        if historical_iv is not None and not isinstance(historical_iv, np.ndarray):
            historical_iv = np.array(historical_iv)

        # Run prediction
        prediction = self.predictor.predict(
            current_iv=current_iv,
            historical_iv=historical_iv,
            realized_vol=realized_vol,
        )

        direction = prediction["iv_direction"]
        confidence = prediction["confidence"]
        expected_change = prediction["expected_iv_change_pct"]

        # Score based on prediction alignment with position
        # For long options (buying premium): want IV to expand or stay stable
        # For identifying opportunities: both directions are valuable info

        if direction in ("contract", "slight_contract"):
            # IV likely to crush - good for sellers, bad for buyers
            if confidence >= 60:
                score += 10  # Still useful signal
                reasons.append(f"IV expected to contract {abs(expected_change):.0f}% - favor selling")
                tags.append("iv-crush-likely")

                # Penalize long positions in high IV environment
                if current_iv > 0.40:  # High IV
                    score -= 5
                    reasons.append("High IV + expected crush - risky for premium buyers")
            elif confidence >= 40:
                score += 5
                reasons.append("IV slightly elevated, may contract")

        elif direction in ("expand", "slight_expand"):
            # IV likely to expand - good for buyers
            if confidence >= 60:
                score += 15
                reasons.append(f"IV expected to expand {expected_change:.0f}% - tailwind for buyers")
                tags.append("iv-expansion-likely")
            elif confidence >= 40:
                score += 8
                reasons.append("IV may expand - slight edge for premium buyers")

        else:
            # Neutral
            score += 3
            reasons.append("IV near fair value")

        # Add half-life info if available
        if prediction.get("days_to_mean"):
            half_life = prediction["days_to_mean"]
            dte = contract.days_to_expiration

            if dte > half_life * 1.5:
                score += 5
                reasons.append(f"DTE ({dte}d) > IV half-life ({half_life:.0f}d) - time for reversion")
            elif dte < half_life * 0.5:
                score -= 3
                reasons.append(f"DTE ({dte}d) < IV half-life ({half_life:.0f}d) - may not revert in time")

        # Store prediction in market_data for other scorers
        context.market_data["iv_prediction"] = prediction

        return score, reasons, tags


__all__ = ["IVMeanReversionPredictor", "IVMeanReversionScorer"]
