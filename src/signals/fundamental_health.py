"""Fundamental health score calculator for risk assessment.

This is NOT a directional signal - it's a risk multiplier that adjusts position sizing
and confidence based on a company's financial health.

Theory: Even with strong technical signals, weak fundamentals increase risk of
unexpected negative catalysts (earnings misses, debt issues, liquidity problems).
Conversely, strong fundamentals provide a safety net and allow more aggressive sizing.

Health Factors:
1. Leverage (Debt/Equity) - Can the company service debt?
2. Cash Generation (Free Cash Flow) - Real profitability
3. Growth (Revenue Growth) - Business momentum
4. Profitability (Profit Margins) - Competitive advantage
5. Returns (ROE) - Capital efficiency
6. Liquidity (Quick/Current Ratio) - Short-term safety
"""

from typing import Any, Dict, Optional


class FundamentalHealthCalculator:
    """Calculate fundamental health score from company financials."""

    def calculate(self, ticker_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate fundamental health score (0.0 to 1.0).

        Args:
            ticker_info: Dictionary from yfinance ticker.info

        Returns:
            Dictionary with:
            - health_score: 0.0 (terrible) to 1.0 (excellent)
            - factors: Dict of individual factor scores
            - risk_level: "low", "medium", "high"
            - position_multiplier: Recommended position size adjustment
            - confidence_multiplier: Confidence adjustment factor
        """
        factors = {}
        score = 0.0
        max_score = 0.0

        # 1. Leverage Check (20 points)
        debt_to_equity = ticker_info.get('debtToEquity')
        if debt_to_equity is not None:
            max_score += 0.2
            if debt_to_equity < 50:
                factors['leverage'] = 0.2  # Excellent
                score += 0.2
            elif debt_to_equity < 100:
                factors['leverage'] = 0.15  # Good
                score += 0.15
            elif debt_to_equity < 200:
                factors['leverage'] = 0.1  # Acceptable
                score += 0.1
            elif debt_to_equity < 300:
                factors['leverage'] = 0.05  # Concerning
                score += 0.05
            else:
                factors['leverage'] = 0.0  # High risk
                score += 0.0

        # 2. Cash Generation (20 points)
        free_cashflow = ticker_info.get('freeCashflow')
        operating_cashflow = ticker_info.get('operatingCashflow')
        if free_cashflow is not None and operating_cashflow is not None:
            max_score += 0.2
            if free_cashflow > 0 and free_cashflow / max(operating_cashflow, 1) > 0.7:
                factors['cash_generation'] = 0.2  # Strong FCF conversion
                score += 0.2
            elif free_cashflow > 0:
                factors['cash_generation'] = 0.15  # Positive FCF
                score += 0.15
            elif operating_cashflow > 0:
                factors['cash_generation'] = 0.1  # At least generating operating cash
                score += 0.1
            else:
                factors['cash_generation'] = 0.0  # Cash burn
                score += 0.0

        # 3. Revenue Growth (20 points)
        revenue_growth = ticker_info.get('revenueGrowth')
        if revenue_growth is not None:
            max_score += 0.2
            if revenue_growth > 0.20:
                factors['growth'] = 0.2  # High growth
                score += 0.2
            elif revenue_growth > 0.10:
                factors['growth'] = 0.15  # Good growth
                score += 0.15
            elif revenue_growth > 0:
                factors['growth'] = 0.1  # Positive
                score += 0.1
            elif revenue_growth > -0.05:
                factors['growth'] = 0.05  # Slight decline
                score += 0.05
            else:
                factors['growth'] = 0.0  # Declining
                score += 0.0

        # 4. Profitability (20 points)
        profit_margins = ticker_info.get('profitMargins')
        if profit_margins is not None:
            max_score += 0.2
            if profit_margins > 0.20:
                factors['profitability'] = 0.2  # Excellent margins
                score += 0.2
            elif profit_margins > 0.10:
                factors['profitability'] = 0.15  # Good margins
                score += 0.15
            elif profit_margins > 0.05:
                factors['profitability'] = 0.1  # Decent
                score += 0.1
            elif profit_margins > 0:
                factors['profitability'] = 0.05  # Thin margins
                score += 0.05
            else:
                factors['profitability'] = 0.0  # Unprofitable
                score += 0.0

        # 5. Return on Equity (10 points)
        roe = ticker_info.get('returnOnEquity')
        if roe is not None:
            max_score += 0.1
            if roe > 0.20:
                factors['returns'] = 0.1  # Excellent
                score += 0.1
            elif roe > 0.15:
                factors['returns'] = 0.08  # Good
                score += 0.08
            elif roe > 0.10:
                factors['returns'] = 0.05  # Acceptable
                score += 0.05
            else:
                factors['returns'] = 0.0  # Poor
                score += 0.0

        # 6. Liquidity (10 points)
        quick_ratio = ticker_info.get('quickRatio')
        current_ratio = ticker_info.get('currentRatio')
        if quick_ratio is not None or current_ratio is not None:
            max_score += 0.1
            ratio = quick_ratio if quick_ratio is not None else current_ratio
            if ratio > 1.5:
                factors['liquidity'] = 0.1  # Strong
                score += 0.1
            elif ratio > 1.0:
                factors['liquidity'] = 0.08  # Adequate
                score += 0.08
            elif ratio > 0.75:
                factors['liquidity'] = 0.05  # Concerning
                score += 0.05
            else:
                factors['liquidity'] = 0.0  # Weak
                score += 0.0

        # Normalize score (handle cases where not all data is available)
        if max_score > 0:
            normalized_score = score / max_score
        else:
            # No fundamental data available - neutral
            normalized_score = 0.5

        # Determine risk level
        if normalized_score >= 0.7:
            risk_level = "low"
            position_multiplier = 1.2  # Allow 20% larger positions
            confidence_multiplier = 1.0  # No reduction
        elif normalized_score >= 0.4:
            risk_level = "medium"
            position_multiplier = 1.0  # Standard sizing
            confidence_multiplier = 1.0  # No adjustment
        else:
            risk_level = "high"
            position_multiplier = 0.5  # Reduce position size by 50%
            confidence_multiplier = 0.7  # Reduce confidence by 30%

        return {
            "health_score": round(normalized_score, 3),
            "factors": factors,
            "risk_level": risk_level,
            "position_multiplier": position_multiplier,
            "confidence_multiplier": confidence_multiplier,
            "data_completeness": round(max_score, 2),  # How much data was available
        }
