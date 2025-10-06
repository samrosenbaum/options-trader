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

        moneyness = context.market_data.get("moneyness")
        if moneyness is None:
            moneyness = abs(contract.stock_price - contract.strike) / max(contract.stock_price, 0.01)
        if 0.01 < moneyness < 0.05:
            score += 18
            reasons.append("Optimal strike selection near ATM")
            tags.append("sweet-spot")
        elif moneyness < 0.01:
            score += 12
            reasons.append("At-the-money strike")
        elif 0.05 < moneyness < 0.10:
            score += 8
        else:
            score += 3

        context.market_data.setdefault("projected_returns", projected_returns)
        return score, reasons, tags

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

