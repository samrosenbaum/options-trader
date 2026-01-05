"""Dealer gamma positioning scorer with quantitative analysis.

This module calculates actual dealer gamma exposure from options data,
identifying:
- Net dealer gamma positioning (short vs long)
- Gamma flip levels (where dealer gamma changes sign)
- Squeeze potential based on gamma concentration
- Support/resistance from dealer hedging

Theory:
- Dealers (market makers) are typically short calls (retail buys calls)
- Dealers are typically long puts (retail buys protective puts)
- When dealers are short gamma, they must buy high/sell low to hedge
- This amplifies moves (gamma squeeze)
- When dealers are long gamma, they sell high/buy low
- This dampens moves (mean reversion)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from .base import ScoreContext


class DealerGammaAnalyzer:
    """Calculate quantitative dealer gamma exposure from options chain."""

    def analyze(
        self,
        options_chain: List[Dict[str, Any]],
        spot_price: float,
    ) -> Dict[str, Any]:
        """
        Analyze dealer gamma exposure across the options chain.

        Args:
            options_chain: List of option contracts with strike, type, gamma, openInterest
            spot_price: Current stock price

        Returns:
            Dictionary with gamma analysis metrics
        """
        if not options_chain or spot_price <= 0:
            return self._empty_result()

        # Calculate gamma at each strike
        gamma_by_strike: Dict[float, float] = {}
        total_call_gamma = 0.0
        total_put_gamma = 0.0
        total_call_oi = 0
        total_put_oi = 0

        for opt in options_chain:
            strike = float(opt.get("strike", 0))
            opt_type = str(opt.get("type", opt.get("option_type", ""))).lower()
            gamma = float(opt.get("gamma", 0))
            oi = int(opt.get("openInterest", opt.get("open_interest", 0)))

            if strike <= 0 or gamma <= 0 or oi <= 0:
                continue

            # Gamma dollars = gamma * OI * 100 * spot
            # This represents how much delta changes per $1 move
            gamma_dollars = gamma * oi * 100 * spot_price

            # Dealer positioning assumptions:
            # - Short calls (retail buys) = short gamma (negative)
            # - Long puts (retail buys) = long gamma (positive)
            if opt_type == "call":
                dealer_gamma = -gamma_dollars  # Dealers short calls
                total_call_gamma += gamma_dollars
                total_call_oi += oi
            else:  # put
                dealer_gamma = gamma_dollars  # Dealers long puts
                total_put_gamma += gamma_dollars
                total_put_oi += oi

            # Accumulate at strike
            gamma_by_strike[strike] = gamma_by_strike.get(strike, 0) + dealer_gamma

        if not gamma_by_strike:
            return self._empty_result()

        # Find net dealer gamma
        net_dealer_gamma = sum(gamma_by_strike.values())

        # Find gamma flip level (where cumulative dealer gamma crosses zero)
        gamma_flip = self._find_gamma_flip(gamma_by_strike, spot_price)

        # Find max gamma concentration (potential pin/magnet)
        strikes = sorted(gamma_by_strike.keys())
        max_gamma_strike = max(gamma_by_strike, key=lambda s: abs(gamma_by_strike[s]))
        max_gamma_value = gamma_by_strike[max_gamma_strike]

        # Determine risk level based on gamma exposure
        risk_level = self._assess_risk_level(
            net_dealer_gamma, spot_price, total_call_oi + total_put_oi
        )

        # Calculate squeeze potential
        squeeze_potential = self._calculate_squeeze_potential(
            gamma_by_strike, spot_price, net_dealer_gamma
        )

        # Find support/resistance from gamma walls
        support, resistance = self._find_gamma_walls(gamma_by_strike, spot_price)

        return {
            "net_dealer_gamma": net_dealer_gamma,
            "net_dealer_gamma_millions": net_dealer_gamma / 1_000_000,
            "gamma_flip": gamma_flip,
            "max_gamma_strike": max_gamma_strike,
            "max_gamma_value": max_gamma_value,
            "risk_level": risk_level,
            "squeeze_potential": squeeze_potential,
            "gamma_support": support,
            "gamma_resistance": resistance,
            "total_call_gamma": total_call_gamma,
            "total_put_gamma": total_put_gamma,
            "call_put_gamma_ratio": (
                total_call_gamma / total_put_gamma if total_put_gamma > 0 else float("inf")
            ),
            "dealer_positioning": "SHORT" if net_dealer_gamma < 0 else "LONG",
            "market_impact": self._describe_market_impact(net_dealer_gamma, gamma_flip, spot_price),
        }

    def _find_gamma_flip(
        self, gamma_by_strike: Dict[float, float], spot_price: float
    ) -> Optional[float]:
        """Find the strike where cumulative dealer gamma flips from positive to negative."""
        if not gamma_by_strike:
            return None

        strikes = sorted(gamma_by_strike.keys())
        cumulative = 0.0
        last_sign = None
        flip_strike = None

        for strike in strikes:
            cumulative += gamma_by_strike[strike]
            current_sign = 1 if cumulative >= 0 else -1

            if last_sign is not None and current_sign != last_sign:
                # Found a flip - interpolate
                flip_strike = strike
                break

            last_sign = current_sign

        return flip_strike

    def _assess_risk_level(
        self, net_gamma: float, spot_price: float, total_oi: int
    ) -> str:
        """Assess squeeze risk level based on gamma exposure."""
        if total_oi <= 0:
            return "MINIMAL"

        # Normalize gamma by notional value
        notional = spot_price * total_oi * 100
        if notional <= 0:
            return "MINIMAL"

        gamma_ratio = abs(net_gamma) / notional

        if net_gamma < 0:  # Dealers short gamma (squeeze risk)
            if gamma_ratio >= 0.05:
                return "EXTREME"
            elif gamma_ratio >= 0.03:
                return "HIGH"
            elif gamma_ratio >= 0.015:
                return "MODERATE"
            elif gamma_ratio >= 0.005:
                return "LOW"
        else:  # Dealers long gamma (dampening)
            if gamma_ratio >= 0.03:
                return "HIGH_DAMPENING"
            elif gamma_ratio >= 0.015:
                return "MODERATE_DAMPENING"

        return "MINIMAL"

    def _calculate_squeeze_potential(
        self,
        gamma_by_strike: Dict[float, float],
        spot_price: float,
        net_gamma: float,
    ) -> Dict[str, Any]:
        """Calculate potential for gamma squeeze."""
        if net_gamma >= 0:
            return {
                "direction": "dampened",
                "magnitude": "low",
                "nearest_trigger": None,
            }

        # Find strikes with high negative gamma near spot
        nearby_strikes = [
            s for s in gamma_by_strike.keys()
            if abs(s - spot_price) / spot_price < 0.05  # Within 5%
        ]

        if not nearby_strikes:
            return {
                "direction": "neutral",
                "magnitude": "low",
                "nearest_trigger": None,
            }

        # Sum gamma near current price
        nearby_gamma = sum(gamma_by_strike[s] for s in nearby_strikes)

        if nearby_gamma < -abs(net_gamma) * 0.3:  # 30%+ of gamma concentrated nearby
            return {
                "direction": "explosive",
                "magnitude": "high",
                "nearest_trigger": min(nearby_strikes, key=lambda s: abs(s - spot_price)),
            }
        elif nearby_gamma < 0:
            return {
                "direction": "upward_bias",
                "magnitude": "moderate",
                "nearest_trigger": min(nearby_strikes, key=lambda s: abs(s - spot_price)),
            }

        return {
            "direction": "neutral",
            "magnitude": "low",
            "nearest_trigger": None,
        }

    def _find_gamma_walls(
        self, gamma_by_strike: Dict[float, float], spot_price: float
    ) -> Tuple[Optional[float], Optional[float]]:
        """Find support and resistance levels from gamma concentration."""
        support = None
        resistance = None

        for strike, gamma in sorted(gamma_by_strike.items()):
            if strike < spot_price and gamma > 0:
                # Positive gamma below price = support (dealers buy dips)
                if support is None or gamma > gamma_by_strike.get(support, 0):
                    support = strike
            elif strike > spot_price and gamma > 0:
                # Positive gamma above price = resistance (dealers sell rallies)
                if resistance is None or gamma > gamma_by_strike.get(resistance, 0):
                    resistance = strike

        return support, resistance

    def _describe_market_impact(
        self, net_gamma: float, gamma_flip: Optional[float], spot_price: float
    ) -> str:
        """Generate human-readable market impact description."""
        if net_gamma < -500_000_000:
            impact = "Extreme short gamma - moves will be amplified significantly"
        elif net_gamma < -100_000_000:
            impact = "High short gamma - upside moves may accelerate"
        elif net_gamma < 0:
            impact = "Dealers slightly short gamma - modest amplification"
        elif net_gamma > 500_000_000:
            impact = "Extreme long gamma - moves will be dampened, expect mean reversion"
        elif net_gamma > 100_000_000:
            impact = "High long gamma - volatility likely compressed"
        else:
            impact = "Balanced gamma positioning"

        if gamma_flip and abs(gamma_flip - spot_price) / spot_price < 0.03:
            impact += f". Near gamma flip at ${gamma_flip:.2f} - regime change possible"

        return impact

    def _empty_result(self) -> Dict[str, Any]:
        """Return empty result when no data available."""
        return {
            "net_dealer_gamma": 0,
            "net_dealer_gamma_millions": 0,
            "gamma_flip": None,
            "max_gamma_strike": None,
            "max_gamma_value": 0,
            "risk_level": "MINIMAL",
            "squeeze_potential": {"direction": "neutral", "magnitude": "low"},
            "gamma_support": None,
            "gamma_resistance": None,
            "dealer_positioning": "NEUTRAL",
            "market_impact": "No gamma data available",
        }


class GammaSqueezeScorer:
    """Convert dealer gamma analytics into a weighted score."""

    key = "gamma_squeeze"
    default_weight = 1.1

    _LEVEL_SCORES = {
        "MINIMAL": 10.0,
        "LOW": 20.0,
        "MODERATE": 38.0,
        "HIGH": 55.0,
        "EXTREME": 70.0,
        "HIGH_DAMPENING": 25.0,
        "MODERATE_DAMPENING": 15.0,
    }

    def __init__(self):
        self.analyzer = DealerGammaAnalyzer()

    def score(self, context: ScoreContext) -> Tuple[float, List[str], List[str]]:
        signal = context.market_data.get("gamma_squeeze")
        reasons: List[str] = []
        tags: List[str] = ["gamma"]

        # Try to compute gamma analysis if options chain is available
        options_chain = context.market_data.get("options_chain")
        if options_chain and not signal:
            signal = self.analyzer.analyze(
                options_chain, context.contract.stock_price
            )
            context.market_data["gamma_squeeze"] = signal

        if not isinstance(signal, dict) or not signal:
            reasons.append("No gamma positioning data available")
            return 5.0, reasons, []

        risk_level = str(signal.get("risk_level", "MINIMAL")).upper()
        base_score = self._LEVEL_SCORES.get(risk_level, 10.0)

        score = base_score

        # Dealer positioning analysis
        net_gamma = signal.get("net_dealer_gamma", 0)
        net_gamma_millions = signal.get("net_dealer_gamma_millions", 0)
        positioning = signal.get("dealer_positioning", "NEUTRAL")

        if positioning == "SHORT" and net_gamma < 0:
            magnitude = abs(net_gamma_millions)
            if magnitude >= 500:
                score += 20
                reasons.append(f"Dealers massively short ${magnitude:.0f}M gamma - squeeze setup")
                tags.append("squeeze-setup")
            elif magnitude >= 100:
                score += 12
                reasons.append(f"Dealers short ${magnitude:.0f}M gamma - upside amplified")
                tags.append("dealer-short")
            elif magnitude >= 10:
                score += 5
                reasons.append(f"Dealers moderately short gamma")

        elif positioning == "LONG":
            magnitude = abs(net_gamma_millions)
            if magnitude >= 100:
                reasons.append(f"Dealers long ${magnitude:.0f}M gamma - moves dampened")
                tags.append("volatility-suppressed")
            else:
                reasons.append("Dealers slightly long gamma")

        # Gamma flip proximity
        gamma_flip = signal.get("gamma_flip")
        if gamma_flip is not None:
            spot = context.contract.stock_price
            distance_pct = abs(gamma_flip - spot) / spot * 100

            if distance_pct < 2:
                score += 8
                reasons.append(f"Near gamma flip at ${gamma_flip:.2f} - regime shift imminent")
                tags.append("gamma-flip-near")
            elif distance_pct < 5:
                score += 4
                reasons.append(f"Gamma flip at ${gamma_flip:.2f} ({distance_pct:.1f}% away)")
                tags.append("gamma-flip")

        # Squeeze potential
        squeeze = signal.get("squeeze_potential", {})
        if squeeze.get("magnitude") == "high":
            score += 15
            reasons.append(f"High squeeze potential - {squeeze.get('direction', 'explosive')} move likely")
            tags.append("high-squeeze-potential")
        elif squeeze.get("magnitude") == "moderate":
            score += 8
            reasons.append(f"Moderate squeeze potential")

        # Support/resistance from gamma walls
        support = signal.get("gamma_support")
        resistance = signal.get("gamma_resistance")
        spot = context.contract.stock_price

        if support and abs(spot - support) / spot < 0.03:
            reasons.append(f"Gamma support at ${support:.2f}")
            tags.append("gamma-support")
        if resistance and abs(resistance - spot) / spot < 0.03:
            reasons.append(f"Gamma resistance at ${resistance:.2f}")
            tags.append("gamma-resistance")

        # Volume surge at squeeze strike
        volume_ratio = signal.get("call_volume_ratio")
        if volume_ratio is not None and float(volume_ratio) >= 1.5:
            score += min(10.0, max(0.0, (float(volume_ratio) - 1.0) * 8.0))
            reasons.append(f"Call volume surge {float(volume_ratio):.1f}x at key strike")
            if float(volume_ratio) >= 2.0:
                tags.append("volume-surge")

        # Market impact summary
        impact = signal.get("market_impact")
        if impact and impact != "No gamma data available":
            reasons.append(impact)

        # Legacy compatibility
        extra_reasons = signal.get("reasons")
        if isinstance(extra_reasons, list):
            for item in extra_reasons:
                if item not in reasons:
                    reasons.append(str(item))

        return score, reasons, list(sorted(set(tags)))


__all__ = ["GammaSqueezeScorer", "DealerGammaAnalyzer"]
