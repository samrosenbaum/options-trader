"""Portfolio Greeks Monitor.

Tracks aggregate Greeks across all open positions to:
- Monitor overall portfolio risk exposure
- Identify concentration risks
- Suggest hedging adjustments
- Track correlation between positions

Key metrics:
- Net Delta: P&L sensitivity to $1 move in underlying
- Net Gamma: Rate of delta change (convexity)
- Net Theta: Daily time decay across portfolio
- Net Vega: Sensitivity to 1% IV change
- Beta-weighted delta: Normalized to SPY for comparison
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np


@dataclass
class Position:
    """Represents an open option position."""

    symbol: str
    option_type: str  # "call" or "put"
    strike: float
    expiration: str
    contracts: int
    entry_price: float
    current_price: float
    stock_price: float

    # Greeks
    delta: float = 0.0
    gamma: float = 0.0
    theta: float = 0.0
    vega: float = 0.0
    iv: float = 0.0

    # Optional metadata
    sector: str = ""
    beta: float = 1.0  # Beta to SPY


@dataclass
class PortfolioGreeks:
    """Aggregate Greeks for the entire portfolio."""

    # Dollar Greeks (actual $ exposure)
    net_delta_dollars: float = 0.0  # P&L per $1 move in underlying
    net_gamma_dollars: float = 0.0  # Delta change per $1 move
    net_theta_daily: float = 0.0  # Daily time decay in $
    net_vega_dollars: float = 0.0  # P&L per 1% IV change

    # Normalized/Weighted metrics
    beta_weighted_delta: float = 0.0  # Delta normalized to SPY
    portfolio_delta_pct: float = 0.0  # Delta as % of portfolio

    # Risk metrics
    max_loss_1pct_move: float = 0.0  # Max loss on 1% adverse move
    max_gain_1pct_move: float = 0.0  # Max gain on 1% favorable move
    theta_as_pct_of_value: float = 0.0  # Daily decay as % of portfolio

    # Status flags
    is_delta_neutral: bool = False
    is_gamma_heavy: bool = False
    is_theta_bleeding: bool = False
    is_vega_exposed: bool = False

    # Breakdown by underlying
    greeks_by_symbol: Dict[str, Dict[str, float]] = field(default_factory=dict)

    # Warnings
    warnings: List[str] = field(default_factory=list)

    # Metadata
    total_positions: int = 0
    total_notional_value: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)


class PortfolioGreeksMonitor:
    """Monitor and analyze portfolio-level Greeks."""

    # Thresholds for warnings
    DELTA_NEUTRAL_THRESHOLD = 100  # Within ±100 delta
    GAMMA_HEAVY_THRESHOLD = 50  # Gamma > 50 per $1 move
    THETA_BLEEDING_THRESHOLD = 0.02  # > 2% daily decay
    VEGA_EXPOSED_THRESHOLD = 1000  # > $1000 per 1% IV move

    def __init__(self, spy_price: float = 500.0):
        """
        Initialize monitor.

        Args:
            spy_price: Current SPY price for beta-weighting
        """
        self.spy_price = spy_price

    def calculate_portfolio_greeks(
        self,
        positions: List[Position],
        portfolio_value: Optional[float] = None,
    ) -> PortfolioGreeks:
        """
        Calculate aggregate Greeks across all positions.

        Args:
            positions: List of open positions
            portfolio_value: Total portfolio value for percentage calculations

        Returns:
            PortfolioGreeks with aggregate metrics
        """
        if not positions:
            return PortfolioGreeks()

        result = PortfolioGreeks()
        result.total_positions = len(positions)

        # Accumulate Greeks
        greeks_by_symbol: Dict[str, Dict[str, float]] = {}

        for pos in positions:
            # Calculate dollar Greeks (per contract = 100 shares)
            multiplier = pos.contracts * 100

            # Adjust sign for puts (delta is negative)
            sign = 1 if pos.option_type.lower() == "call" else -1

            delta_dollars = pos.delta * multiplier * pos.stock_price * sign
            gamma_dollars = pos.gamma * multiplier * pos.stock_price
            theta_dollars = pos.theta * multiplier  # Already in $ per day
            vega_dollars = pos.vega * multiplier  # $ per 1% IV change

            # Accumulate totals
            result.net_delta_dollars += delta_dollars
            result.net_gamma_dollars += gamma_dollars
            result.net_theta_daily += theta_dollars
            result.net_vega_dollars += vega_dollars

            # Beta-weighted delta (normalize to SPY equivalent)
            spy_equivalent_delta = delta_dollars * pos.beta
            result.beta_weighted_delta += spy_equivalent_delta / self.spy_price

            # Track notional value
            position_value = pos.current_price * pos.contracts * 100
            result.total_notional_value += position_value

            # Track by symbol
            if pos.symbol not in greeks_by_symbol:
                greeks_by_symbol[pos.symbol] = {
                    "delta": 0, "gamma": 0, "theta": 0, "vega": 0,
                    "value": 0, "contracts": 0
                }

            greeks_by_symbol[pos.symbol]["delta"] += delta_dollars
            greeks_by_symbol[pos.symbol]["gamma"] += gamma_dollars
            greeks_by_symbol[pos.symbol]["theta"] += theta_dollars
            greeks_by_symbol[pos.symbol]["vega"] += vega_dollars
            greeks_by_symbol[pos.symbol]["value"] += position_value
            greeks_by_symbol[pos.symbol]["contracts"] += pos.contracts

        result.greeks_by_symbol = greeks_by_symbol

        # Calculate percentage metrics
        if portfolio_value and portfolio_value > 0:
            result.portfolio_delta_pct = (
                result.net_delta_dollars / portfolio_value * 100
            )
            result.theta_as_pct_of_value = (
                abs(result.net_theta_daily) / portfolio_value * 100
            )
        elif result.total_notional_value > 0:
            result.portfolio_delta_pct = (
                result.net_delta_dollars / result.total_notional_value * 100
            )
            result.theta_as_pct_of_value = (
                abs(result.net_theta_daily) / result.total_notional_value * 100
            )

        # Calculate move impact
        result.max_loss_1pct_move = self._calculate_move_impact(
            result.net_delta_dollars, result.net_gamma_dollars, -0.01
        )
        result.max_gain_1pct_move = self._calculate_move_impact(
            result.net_delta_dollars, result.net_gamma_dollars, 0.01
        )

        # Set status flags
        result.is_delta_neutral = abs(result.net_delta_dollars) < self.DELTA_NEUTRAL_THRESHOLD
        result.is_gamma_heavy = abs(result.net_gamma_dollars) > self.GAMMA_HEAVY_THRESHOLD
        result.is_theta_bleeding = result.theta_as_pct_of_value > self.THETA_BLEEDING_THRESHOLD * 100
        result.is_vega_exposed = abs(result.net_vega_dollars) > self.VEGA_EXPOSED_THRESHOLD

        # Generate warnings
        result.warnings = self._generate_warnings(result, positions)

        return result

    def _calculate_move_impact(
        self, delta: float, gamma: float, move_pct: float
    ) -> float:
        """
        Calculate P&L impact of a percentage move.

        Uses delta + 0.5 * gamma * move^2 approximation.
        """
        # Delta contribution
        pnl = delta * move_pct

        # Gamma contribution (convexity)
        pnl += 0.5 * gamma * (move_pct ** 2)

        return pnl

    def _generate_warnings(
        self, greeks: PortfolioGreeks, positions: List[Position]
    ) -> List[str]:
        """Generate risk warnings based on portfolio Greeks."""
        warnings = []

        # Delta exposure warning
        if abs(greeks.net_delta_dollars) > 5000:
            direction = "long" if greeks.net_delta_dollars > 0 else "short"
            warnings.append(
                f"High {direction} delta exposure: ${abs(greeks.net_delta_dollars):,.0f} per $1 move"
            )

        # Theta bleeding warning
        if greeks.is_theta_bleeding:
            warnings.append(
                f"High theta decay: ${abs(greeks.net_theta_daily):,.2f}/day "
                f"({greeks.theta_as_pct_of_value:.1f}% of portfolio)"
            )

        # Gamma concentration warning
        if greeks.is_gamma_heavy:
            warnings.append(
                f"High gamma exposure: ${greeks.net_gamma_dollars:,.0f} delta change per $1 move"
            )

        # Vega exposure warning
        if greeks.is_vega_exposed:
            direction = "long" if greeks.net_vega_dollars > 0 else "short"
            warnings.append(
                f"{direction.capitalize()} vega exposure: ${abs(greeks.net_vega_dollars):,.0f} per 1% IV change"
            )

        # Concentration warnings
        if positions:
            symbol_concentration = self._check_concentration(positions)
            if symbol_concentration:
                warnings.extend(symbol_concentration)

        # Directional imbalance
        if len(positions) >= 3:
            calls = sum(1 for p in positions if p.option_type.lower() == "call")
            puts = len(positions) - calls

            if calls > 0 and puts > 0:
                ratio = max(calls, puts) / min(calls, puts)
                if ratio >= 4:
                    dominant = "calls" if calls > puts else "puts"
                    warnings.append(
                        f"Directional imbalance: {calls} calls vs {puts} puts - heavily {dominant}"
                    )

        return warnings

    def _check_concentration(self, positions: List[Position]) -> List[str]:
        """Check for concentration risk."""
        warnings = []

        # Count by symbol
        symbol_counts = {}
        for pos in positions:
            symbol_counts[pos.symbol] = symbol_counts.get(pos.symbol, 0) + 1

        total = len(positions)

        for symbol, count in symbol_counts.items():
            if total >= 3 and count / total >= 0.5:
                warnings.append(
                    f"Concentration risk: {count}/{total} positions in {symbol}"
                )

        # Check sector concentration
        sector_counts = {}
        for pos in positions:
            if pos.sector:
                sector_counts[pos.sector] = sector_counts.get(pos.sector, 0) + 1

        for sector, count in sector_counts.items():
            if total >= 5 and count / total >= 0.6:
                warnings.append(
                    f"Sector concentration: {count}/{total} positions in {sector}"
                )

        return warnings

    def get_hedging_suggestions(
        self, greeks: PortfolioGreeks
    ) -> List[Dict[str, Any]]:
        """
        Suggest hedges based on portfolio Greeks.

        Returns list of suggested hedging actions.
        """
        suggestions = []

        # Delta hedging
        if abs(greeks.net_delta_dollars) > 1000:
            if greeks.net_delta_dollars > 0:
                # Long delta - hedge with SPY puts or short SPY
                spy_shares = int(greeks.net_delta_dollars / self.spy_price)
                suggestions.append({
                    "type": "delta_hedge",
                    "action": "BUY SPY PUTS or SHORT SPY",
                    "size": spy_shares,
                    "reason": f"Offset ${greeks.net_delta_dollars:,.0f} long delta exposure",
                    "urgency": "high" if greeks.net_delta_dollars > 5000 else "moderate",
                })
            else:
                # Short delta - hedge with SPY calls or long SPY
                spy_shares = int(abs(greeks.net_delta_dollars) / self.spy_price)
                suggestions.append({
                    "type": "delta_hedge",
                    "action": "BUY SPY CALLS or LONG SPY",
                    "size": spy_shares,
                    "reason": f"Offset ${abs(greeks.net_delta_dollars):,.0f} short delta exposure",
                    "urgency": "high" if greeks.net_delta_dollars < -5000 else "moderate",
                })

        # Vega hedging
        if abs(greeks.net_vega_dollars) > 2000:
            if greeks.net_vega_dollars > 0:
                # Long vega - vulnerable to IV crush
                suggestions.append({
                    "type": "vega_hedge",
                    "action": "SELL VIX CALLS or credit spreads",
                    "reason": f"Long ${greeks.net_vega_dollars:,.0f} vega - exposed to IV crush",
                    "urgency": "moderate",
                })
            else:
                # Short vega - vulnerable to IV spike
                suggestions.append({
                    "type": "vega_hedge",
                    "action": "BUY VIX CALLS or debit spreads",
                    "reason": f"Short ${abs(greeks.net_vega_dollars):,.0f} vega - exposed to IV spike",
                    "urgency": "high" if greeks.net_vega_dollars < -5000 else "moderate",
                })

        # Theta management
        if greeks.theta_as_pct_of_value > 3:
            suggestions.append({
                "type": "theta_management",
                "action": "ROLL positions or REDUCE",
                "reason": f"Bleeding ${abs(greeks.net_theta_daily):,.2f}/day ({greeks.theta_as_pct_of_value:.1f}%)",
                "urgency": "high",
            })

        return suggestions

    def format_summary(self, greeks: PortfolioGreeks) -> str:
        """Format portfolio Greeks as readable summary."""
        lines = [
            "=" * 50,
            "PORTFOLIO GREEKS SUMMARY",
            "=" * 50,
            "",
            f"Total Positions: {greeks.total_positions}",
            f"Total Notional Value: ${greeks.total_notional_value:,.2f}",
            "",
            "AGGREGATE GREEKS:",
            f"  Net Delta: ${greeks.net_delta_dollars:,.2f} (β-weighted: {greeks.beta_weighted_delta:,.0f} SPY shares)",
            f"  Net Gamma: ${greeks.net_gamma_dollars:,.2f} per $1 move",
            f"  Net Theta: ${greeks.net_theta_daily:,.2f}/day ({greeks.theta_as_pct_of_value:.2f}% of value)",
            f"  Net Vega:  ${greeks.net_vega_dollars:,.2f} per 1% IV change",
            "",
            "MOVE ANALYSIS:",
            f"  1% adverse move:  ${greeks.max_loss_1pct_move:,.2f}",
            f"  1% favorable move: ${greeks.max_gain_1pct_move:,.2f}",
            "",
            "STATUS:",
            f"  Delta Neutral: {'Yes' if greeks.is_delta_neutral else 'No'}",
            f"  Gamma Heavy: {'Yes' if greeks.is_gamma_heavy else 'No'}",
            f"  Theta Bleeding: {'Yes' if greeks.is_theta_bleeding else 'No'}",
            f"  Vega Exposed: {'Yes' if greeks.is_vega_exposed else 'No'}",
        ]

        if greeks.warnings:
            lines.append("")
            lines.append("WARNINGS:")
            for warning in greeks.warnings:
                lines.append(f"  ⚠️ {warning}")

        if greeks.greeks_by_symbol:
            lines.append("")
            lines.append("BY UNDERLYING:")
            for symbol, data in sorted(greeks.greeks_by_symbol.items()):
                lines.append(
                    f"  {symbol}: Δ=${data['delta']:,.0f} Γ=${data['gamma']:,.0f} "
                    f"Θ=${data['theta']:,.2f} V=${data['vega']:,.0f}"
                )

        lines.append("")
        lines.append("=" * 50)

        return "\n".join(lines)


__all__ = ["PortfolioGreeksMonitor", "PortfolioGreeks", "Position"]
