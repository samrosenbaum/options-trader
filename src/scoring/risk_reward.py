from __future__ import annotations

from typing import List, Tuple

from .base import ScoreContext


class RiskRewardScorer:
    key = "risk_reward"
    default_weight = 1.5

    def score(self, context: ScoreContext) -> Tuple[float, List[str], List[str]]:
        contract = context.contract
        reasons: List[str] = []
        tags: List[str] = ["risk-reward"]
        score = 0.0

        projected_returns = context.market_data.get("projected_returns")
        if projected_returns is None:
            projected_returns = self._compute_returns(contract)

        ten_percent_rr = projected_returns.get("10%", 0.0)
        if ten_percent_rr > 5:
            score += 30
            reasons.append(f"Exceptional risk/reward ({ten_percent_rr:.1f}:1 on 10% move)")
            tags.append("asymmetric-payoff")
        elif ten_percent_rr > 3:
            score += 20
            reasons.append(f"Excellent risk/reward ({ten_percent_rr:.1f}:1)")
        elif ten_percent_rr > 2:
            score += 12
        else:
            score += 6

        theta_ratio = context.market_data.get("theta_ratio")
        if theta_ratio is not None:
            if theta_ratio < 0.02 and contract.days_to_expiration > 30:
                score += 15
                reasons.append("Low theta decay with plenty of time")
            elif theta_ratio > 0.05 and contract.days_to_expiration < 14:
                score -= 10
                reasons.append("High theta decay into expiration")
                tags.append("theta-risk")
            else:
                score += 5

        # Enhanced moneyness-based scoring with DTE awareness
        moneyness = context.market_data.get("moneyness")
        if moneyness is None:
            moneyness = abs(contract.stock_price - contract.strike) / max(contract.stock_price, 0.01)

        dte = contract.days_to_expiration
        moneyness_score, moneyness_reason, moneyness_tag = self._score_moneyness(
            moneyness, dte, contract.option_type
        )
        score += moneyness_score
        if moneyness_reason:
            reasons.append(moneyness_reason)
        if moneyness_tag:
            tags.append(moneyness_tag)

        # Add leverage efficiency score
        leverage_score, leverage_reason = self._score_leverage_efficiency(
            contract, moneyness, dte
        )
        score += leverage_score
        if leverage_reason:
            reasons.append(leverage_reason)

        context.market_data.setdefault("projected_returns", projected_returns)
        context.market_data.setdefault("moneyness", moneyness)
        return score, reasons, tags

    def _score_moneyness(
        self, moneyness: float, dte: int, option_type: str
    ) -> Tuple[float, str, str]:
        """
        Score based on moneyness with DTE awareness.

        Key insights:
        - Deep OTM (>15%) needs big move, risky with short DTE
        - Slightly OTM (5-10%) is sweet spot for directional plays
        - ATM best for quick scalps and high probability
        - ITM safer but lower leverage
        """
        # Deep OTM (>15% from ATM) - lottery ticket territory
        if moneyness > 0.15:
            if dte < 14:
                # Deep OTM with short DTE = very risky
                return -5, "Deep OTM with <14 DTE - low probability of profit", "lottery-risk"
            elif dte < 30:
                return 2, f"Deep OTM ({moneyness:.0%}) - needs significant move", "speculative"
            else:
                # More time = better chance
                return 5, f"Deep OTM with {dte} DTE - time for thesis to play out", ""

        # Moderately OTM (10-15%) - aggressive directional
        elif moneyness > 0.10:
            if dte < 7:
                return 0, "Moderately OTM near expiration - elevated risk", "theta-risk"
            elif dte < 21:
                return 8, f"Moderately OTM ({moneyness:.0%}) - good leverage if move happens fast", ""
            else:
                return 12, f"Moderately OTM ({moneyness:.0%}) with time - balanced risk/reward", ""

        # Sweet spot (5-10% OTM) - optimal for directional plays
        elif moneyness > 0.05:
            if dte < 7:
                return 10, "Sweet spot strike but short DTE", ""
            else:
                return 18, f"Optimal strike selection ({moneyness:.0%} OTM) - best leverage/probability balance", "sweet-spot"

        # Near ATM (1-5% OTM) - high probability zone
        elif moneyness > 0.01:
            if dte < 7:
                return 14, "Near ATM for quick scalp", "scalp-candidate"
            else:
                return 16, "Near ATM - high delta exposure", "high-probability"

        # ATM (<1%) - maximum delta, best for momentum plays
        else:
            return 12, "At-the-money strike - maximum delta", "atm"

    def _score_leverage_efficiency(
        self, contract, moneyness: float, dte: int
    ) -> Tuple[float, str]:
        """
        Score the leverage efficiency - how much exposure per dollar risked.

        Efficient options: Low premium relative to potential payoff
        Inefficient: Paying too much for the exposure
        """
        # Calculate effective leverage (delta * stock_price / option_price)
        delta = abs(contract.greeks.delta) if contract.greeks.delta else 0.5
        option_price = contract.last_price if contract.last_price > 0 else contract.mid_price

        if option_price <= 0:
            return 0, ""

        # Dollar delta = how much the option moves per $1 stock move
        dollar_delta = delta * 100  # Per contract

        # Cost basis
        cost_per_contract = option_price * 100

        # Leverage ratio = exposure / cost
        leverage_ratio = (delta * contract.stock_price * 100) / cost_per_contract

        # Score based on leverage efficiency
        if leverage_ratio > 10:
            return 8, f"High leverage efficiency ({leverage_ratio:.1f}x) - good bang for buck"
        elif leverage_ratio > 5:
            return 5, f"Solid leverage ({leverage_ratio:.1f}x)"
        elif leverage_ratio > 2:
            return 2, ""
        else:
            # Low leverage usually means ITM or very expensive premium
            return 0, ""

    @staticmethod
    def _compute_returns(contract) -> dict:
        results = {}
        for move_pct in (0.10, 0.20, 0.30):
            if contract.option_type == "call":
                target_price = contract.stock_price * (1 + move_pct)
                intrinsic = max(0.0, target_price - contract.strike)
            else:
                target_price = contract.stock_price * (1 - move_pct)
                intrinsic = max(0.0, contract.strike - target_price)
            potential_return = max(0.0, intrinsic - contract.last_price)
            risk_reward = potential_return / max(contract.last_price, 0.01)
            results[f"{int(move_pct*100)}%"] = round(risk_reward, 2)
        return results


__all__ = ["RiskRewardScorer"]

