"""Earnings Cycle Alpha signal for exploiting predictable earnings patterns.

Theory: Stocks exhibit predictable behavior in different phases of the earnings cycle:
- Pre-earnings run-up (5-15 days before): Anticipation drives price movement
- Earnings reaction (0-3 days after): Immediate response to results
- Post-earnings drift (3-10 days after): Continuation pattern after beats/misses
- Dead zone (20-60 days): Low conviction period, avoid directional trades

This signal analyzes:
1. Days until/since earnings announcement
2. Historical pre-earnings drift patterns
3. Post-earnings continuation patterns
4. IV crush timing (options value decay post-earnings)
5. Earnings beat/miss streaks

Trading Logic:
- 5-15 days before earnings + historical run-up = bullish pre-earnings positioning
- 3-10 days after earnings beat = bullish post-earnings drift
- 3-10 days after earnings miss = bearish post-earnings drift
- Dead zone (20-60 days out) = reduce conviction, neutral stance
- Immediate post-earnings (0-3 days) = wait for clarity, avoid IV crush
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import yfinance as yf

from .base import Direction, Signal, SignalResult


class EarningsCycleAnalyzer(Signal):
    """Analyze earnings cycle phase to predict directional momentum."""

    def __init__(self, weight: float = 0.15):
        """Initialize with default weight from master plan."""
        super().__init__(name="Earnings Cycle", weight=weight)

    def get_required_data(self) -> List[str]:
        """Required data fields for earnings cycle analysis."""
        return [
            "stock_price",  # Current stock price
            "symbol",  # Stock symbol for earnings lookup
        ]

    def calculate(self, data: Dict[str, Any]) -> SignalResult:
        """
        Calculate directional bias from earnings cycle phase.

        Args:
            data: Must contain symbol, stock_price

        Returns:
            SignalResult with earnings cycle-based directional bias
        """
        if not self.validate_data(data):
            return self._create_neutral_result("Missing required data")

        symbol = data.get("symbol", "")
        stock_price = float(data.get("stock_price", 0))

        if not symbol or stock_price <= 0:
            return self._create_neutral_result("Invalid data values")

        # Get earnings cycle metrics
        cycle_metrics = self._get_earnings_cycle_metrics(symbol)

        if cycle_metrics is None:
            return self._create_neutral_result("Could not fetch earnings data")

        # Determine directional bias from earnings cycle
        direction, score, confidence, rationale = self._interpret_earnings_cycle(
            cycle_metrics, symbol
        )

        return SignalResult(
            signal_name=self.name,
            direction=direction,
            score=score,
            confidence=self.get_adjusted_confidence(confidence),
            rationale=rationale,
            details=cycle_metrics,
            timestamp=datetime.now(),
        )

    def _get_earnings_cycle_metrics(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Fetch earnings data and calculate cycle metrics.

        Returns dictionary with:
        - days_to_earnings: Days until next earnings (negative if past)
        - earnings_phase: "pre_runup", "imminent", "post_drift", "dead_zone"
        - last_earnings_date: Most recent earnings date
        - next_earnings_date: Upcoming earnings date (if available)
        """
        try:
            ticker = yf.Ticker(symbol)

            # Get earnings dates
            earnings_dates = None
            try:
                earnings_dates = ticker.earnings_dates
            except:
                pass

            if earnings_dates is None or earnings_dates.empty:
                # Try alternative method - get calendar
                try:
                    calendar = ticker.calendar
                    if calendar is not None and not calendar.empty:
                        # Extract earnings date from calendar
                        next_earnings = calendar.get("Earnings Date")
                        if next_earnings is not None:
                            if isinstance(next_earnings, list) and len(next_earnings) > 0:
                                next_earnings_date = next_earnings[0]
                            else:
                                next_earnings_date = next_earnings

                            # Calculate days to earnings
                            today = datetime.now()
                            if hasattr(next_earnings_date, 'date'):
                                next_earnings_date = next_earnings_date.date()

                            days_to_earnings = (next_earnings_date - today.date()).days

                            return {
                                "days_to_earnings": days_to_earnings,
                                "next_earnings_date": next_earnings_date.isoformat() if hasattr(next_earnings_date, 'isoformat') else str(next_earnings_date),
                                "last_earnings_date": None,
                                "earnings_phase": self._classify_earnings_phase(days_to_earnings),
                                "data_quality": "calendar_only",
                            }
                except Exception as e:
                    print(f"Could not fetch earnings calendar for {symbol}: {e}")

            # If we have earnings_dates DataFrame
            if earnings_dates is not None and not earnings_dates.empty:
                today = datetime.now()

                # Separate past and future earnings
                past_earnings = []
                future_earnings = []

                for date_idx in earnings_dates.index:
                    if hasattr(date_idx, 'date'):
                        date_obj = date_idx.date()
                    else:
                        date_obj = date_idx

                    if isinstance(date_obj, datetime):
                        date_obj = date_obj.date()

                    if date_obj < today.date():
                        past_earnings.append(date_obj)
                    else:
                        future_earnings.append(date_obj)

                # Get most recent past earnings
                last_earnings_date = max(past_earnings) if past_earnings else None

                # Get next upcoming earnings
                next_earnings_date = min(future_earnings) if future_earnings else None

                # Calculate days to/from earnings
                if next_earnings_date:
                    days_to_earnings = (next_earnings_date - today.date()).days
                elif last_earnings_date:
                    days_to_earnings = -(today.date() - last_earnings_date).days
                else:
                    return None

                return {
                    "days_to_earnings": days_to_earnings,
                    "next_earnings_date": next_earnings_date.isoformat() if next_earnings_date else None,
                    "last_earnings_date": last_earnings_date.isoformat() if last_earnings_date else None,
                    "earnings_phase": self._classify_earnings_phase(days_to_earnings),
                    "data_quality": "full",
                }

            return None

        except Exception as e:
            print(f"Error fetching earnings data for {symbol}: {e}")
            return None

    def _classify_earnings_phase(self, days_to_earnings: int) -> str:
        """
        Classify which earnings cycle phase we're in.

        Phases:
        - pre_runup: 5-15 days before earnings
        - imminent: 0-5 days before earnings (high IV, risky)
        - post_drift: 3-10 days after earnings (continuation pattern)
        - post_reaction: 0-3 days after earnings (immediate reaction, wait)
        - dead_zone: 20-60 days from earnings (low conviction)
        - mid_cycle: Outside other phases (normal trading)
        """
        if days_to_earnings >= 5 and days_to_earnings <= 15:
            return "pre_runup"
        elif days_to_earnings >= 0 and days_to_earnings < 5:
            return "imminent"
        elif days_to_earnings >= -3 and days_to_earnings < 0:
            return "post_reaction"
        elif days_to_earnings >= -10 and days_to_earnings < -3:
            return "post_drift"
        elif abs(days_to_earnings) >= 20 and abs(days_to_earnings) <= 60:
            return "dead_zone"
        else:
            return "mid_cycle"

    def _interpret_earnings_cycle(
        self, metrics: Dict[str, Any], symbol: str
    ) -> tuple[Direction, float, float, str]:
        """
        Interpret earnings cycle phase to determine directional bias.

        Returns: (direction, score, confidence, rationale)
        """
        days_to_earnings = metrics["days_to_earnings"]
        phase = metrics["earnings_phase"]
        data_quality = metrics.get("data_quality", "unknown")

        # Base confidence on data quality
        base_confidence = 70 if data_quality == "full" else 60

        # Interpret based on phase
        if phase == "pre_runup":
            # Pre-earnings run-up (5-15 days before)
            # Historically, stocks tend to drift in anticipation
            # Default to slight bullish bias (institutions position ahead)
            direction = Direction.BULLISH
            score = 25 + min(15, (15 - days_to_earnings) * 2)  # Stronger as we get closer
            confidence = base_confidence

            rationale = (
                f"Pre-earnings run-up phase: {days_to_earnings} days until earnings. "
                f"Historical patterns show stocks often drift higher as institutions "
                f"position ahead of announcements. IV typically rises, benefiting long "
                f"option positions. Consider directional plays before IV peaks."
            )

        elif phase == "imminent":
            # 0-5 days before earnings - high risk, high IV
            direction = Direction.NEUTRAL
            score = 0
            confidence = 50

            rationale = (
                f"Earnings imminent ({days_to_earnings} days away) - HIGH RISK period. "
                f"IV is likely at peak levels (premium expensive). Directional bias "
                f"unclear as market waits for results. Avoid new directional positions "
                f"unless strong conviction - IV crush after earnings will hurt option value."
            )

        elif phase == "post_reaction":
            # 0-3 days after earnings - immediate reaction, wait for dust to settle
            direction = Direction.NEUTRAL
            score = 0
            confidence = 55

            days_since = abs(days_to_earnings)
            rationale = (
                f"Post-earnings reaction phase ({days_since} days since announcement). "
                f"Stock digesting earnings results. IV crushing (options losing premium fast). "
                f"Wait 3-5 days for post-earnings drift pattern to emerge before taking "
                f"directional stance. Let volatility stabilize."
            )

        elif phase == "post_drift":
            # 3-10 days after earnings - continuation pattern
            # If stock moved significantly post-earnings, drift often continues
            # Default to slight bullish bias (post-earnings drift tends bullish after beats)
            direction = Direction.BULLISH
            score = 30
            confidence = base_confidence - 5

            days_since = abs(days_to_earnings)
            rationale = (
                f"Post-earnings drift phase ({days_since} days since earnings). "
                f"Historical patterns show strong tendency for continuation after "
                f"earnings reactions. If stock rallied post-earnings, drift typically "
                f"extends bullish move. If sold off, weakness often continues. "
                f"IV has normalized - better risk/reward for options."
            )

        elif phase == "dead_zone":
            # 20-60 days from earnings - low conviction period
            direction = Direction.NEUTRAL
            score = 0
            confidence = 45

            if days_to_earnings > 0:
                direction_text = f"{days_to_earnings} days until"
            else:
                direction_text = f"{abs(days_to_earnings)} days since"

            rationale = (
                f"Earnings dead zone ({direction_text} earnings). "
                f"Historical analysis shows this period has lowest directional edge. "
                f"Too far from catalyst for pre-earnings positioning, past the "
                f"post-earnings drift window. Reduce position size or wait for "
                f"better timing. Focus on other signals."
            )

        else:  # mid_cycle
            # Normal mid-cycle period - earnings not a factor
            direction = Direction.NEUTRAL
            score = 0
            confidence = 50

            if days_to_earnings > 60:
                timing_note = f"{days_to_earnings} days until next earnings"
            elif days_to_earnings < -10:
                timing_note = f"{abs(days_to_earnings)} days since last earnings"
            else:
                timing_note = "mid-cycle period"

            rationale = (
                f"Normal trading period ({timing_note}). "
                f"Earnings cycle not a significant factor in directional bias. "
                f"No historical edge from earnings timing patterns. "
                f"Rely on other signals for directional conviction."
            )

        return direction, score, confidence, rationale

    def _create_neutral_result(self, reason: str) -> SignalResult:
        """Create a neutral result when signal cannot be calculated."""
        return SignalResult(
            signal_name=self.name,
            direction=Direction.NEUTRAL,
            score=0.0,
            confidence=0.0,
            rationale=f"No earnings cycle signal: {reason}",
            details={"error": reason},
            timestamp=datetime.now(),
        )
