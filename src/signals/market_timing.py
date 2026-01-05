"""Market Timing Signals.

Provides timing-based signals for optimal entry/exit:
- Time-of-day filters (avoid first 30 min, lunch lull)
- Day-of-week patterns (Monday selloff, Friday pin)
- Pre/post market session awareness
- Earnings/event proximity warnings

These signals help avoid poor execution during volatile or illiquid periods.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Dict, List, Optional, Tuple

try:
    import pytz
    HAS_PYTZ = True
except ImportError:
    HAS_PYTZ = False


@dataclass
class MarketTimingSignal:
    """Timing assessment result."""

    is_good_time: bool
    quality: str  # "excellent", "good", "acceptable", "poor", "avoid"
    score: int  # 0-100
    reason: str
    warnings: List[str]
    recommendations: List[str]

    # Market session info
    session: str  # "pre_market", "open", "regular", "close", "after_hours", "closed"
    minutes_since_open: int
    minutes_until_close: int


class MarketTimingFilter:
    """Filter and score entry/exit timing."""

    # Market hours (Eastern Time)
    MARKET_OPEN = time(9, 30)
    MARKET_CLOSE = time(16, 0)
    PRE_MARKET_START = time(4, 0)
    AFTER_HOURS_END = time(20, 0)

    # Quality windows (minutes from open)
    AVOID_OPEN_MINUTES = 30  # First 30 min - wide spreads, whipsaws
    GOOD_MORNING_START = 45  # 10:15 AM
    GOOD_MORNING_END = 90  # 11:00 AM
    LUNCH_START = 120  # 11:30 AM
    LUNCH_END = 210  # 1:00 PM
    GOOD_AFTERNOON_START = 210  # 1:00 PM
    GOOD_AFTERNOON_END = 330  # 2:30 PM
    AVOID_CLOSE_MINUTES = 15  # Last 15 min

    def get_timezone(self):
        """Get Eastern timezone."""
        if HAS_PYTZ:
            return pytz.timezone('US/Eastern')
        return None

    def check_timing(
        self,
        current_time: Optional[datetime] = None,
        symbol: Optional[str] = None,
        is_entry: bool = True,
        has_catalyst: bool = False,
        dte: Optional[int] = None,
    ) -> MarketTimingSignal:
        """
        Check if current time is good for entry/exit.

        Args:
            current_time: Time to check (defaults to now)
            symbol: Ticker symbol (for specific patterns)
            is_entry: True for entries, False for exits
            has_catalyst: True if there's a known catalyst (earnings, etc.)
            dte: Days to expiration (affects timing urgency)

        Returns:
            MarketTimingSignal with assessment
        """
        tz = self.get_timezone()

        if current_time is None:
            current_time = datetime.now(tz) if tz else datetime.now()
        elif tz and current_time.tzinfo is None:
            current_time = tz.localize(current_time)

        warnings = []
        recommendations = []

        # Extract time components
        if tz:
            et_time = current_time.astimezone(tz).time()
            weekday = current_time.astimezone(tz).weekday()
        else:
            et_time = current_time.time()
            weekday = current_time.weekday()

        # Check if market is open
        session, minutes_open, minutes_close = self._get_session_info(et_time, weekday)

        # Weekend check
        if weekday >= 5:  # Saturday or Sunday
            return MarketTimingSignal(
                is_good_time=False,
                quality="closed",
                score=0,
                reason="Market closed - weekend",
                warnings=["Market is closed"],
                recommendations=["Wait for Monday open"],
                session="closed",
                minutes_since_open=0,
                minutes_until_close=0,
            )

        # Pre-market
        if session == "pre_market":
            return MarketTimingSignal(
                is_good_time=False,
                quality="avoid",
                score=10,
                reason="Pre-market session - options not trading",
                warnings=["Options markets not open until 9:30 AM ET"],
                recommendations=["Queue order for open or wait for 10:00 AM"],
                session="pre_market",
                minutes_since_open=0,
                minutes_until_close=0,
            )

        # After hours
        if session == "after_hours":
            return MarketTimingSignal(
                is_good_time=False,
                quality="avoid",
                score=5,
                reason="After-hours session - options not trading",
                warnings=["Options markets closed"],
                recommendations=["Place order for next trading day"],
                session="after_hours",
                minutes_since_open=0,
                minutes_until_close=0,
            )

        # Closed
        if session == "closed":
            return MarketTimingSignal(
                is_good_time=False,
                quality="closed",
                score=0,
                reason="Market closed",
                warnings=["Market is closed"],
                recommendations=["Wait for next trading session"],
                session="closed",
                minutes_since_open=0,
                minutes_until_close=0,
            )

        # Market is open - evaluate timing quality
        score = 50  # Base score
        quality = "acceptable"
        reasons = []

        # Opening volatility (first 30 minutes)
        if minutes_open < self.AVOID_OPEN_MINUTES:
            score -= 30
            quality = "avoid" if is_entry else "poor"
            reasons.append(f"First {minutes_open} min - wide spreads, volatility")
            warnings.append("High bid-ask spreads during opening volatility")
            recommendations.append("Wait until 10:00-10:15 AM for better fills")

        # Prime morning window (10:15 - 11:00 AM)
        elif self.GOOD_MORNING_START <= minutes_open < self.GOOD_MORNING_END:
            score += 30
            quality = "excellent"
            reasons.append("Prime morning trading window")
            recommendations.append("Good liquidity and trend clarity")

        # Lunch lull (11:30 AM - 1:00 PM)
        elif self.LUNCH_START <= minutes_open < self.LUNCH_END:
            score -= 15
            quality = "poor"
            reasons.append("Lunch hour - lower volume")
            warnings.append("Lower liquidity may cause wider spreads")
            recommendations.append("Consider waiting for afternoon session")

        # Prime afternoon window (1:00 PM - 2:30 PM)
        elif self.GOOD_AFTERNOON_START <= minutes_open < self.GOOD_AFTERNOON_END:
            score += 25
            quality = "excellent"
            reasons.append("Prime afternoon trading window")
            recommendations.append("Good volume before close")

        # Power hour approach (2:30 PM - 3:45 PM)
        elif self.GOOD_AFTERNOON_END <= minutes_open < (390 - self.AVOID_CLOSE_MINUTES):
            score += 10
            quality = "good"
            reasons.append("Power hour - decent volume")

        # Closing volatility (last 15 min)
        if minutes_close <= self.AVOID_CLOSE_MINUTES:
            score -= 25
            quality = "poor" if quality != "avoid" else "avoid"
            reasons.append("Last 15 minutes - closing volatility")
            warnings.append("Erratic price action near close")
            if is_entry:
                recommendations.append("Avoid new entries, wait for next day")

        # Day-of-week patterns
        dow_adjustment = self._check_day_of_week(weekday, is_entry)
        score += dow_adjustment["score_adj"]
        if dow_adjustment.get("warning"):
            warnings.append(dow_adjustment["warning"])
        if dow_adjustment.get("recommendation"):
            recommendations.append(dow_adjustment["recommendation"])

        # DTE urgency
        if dte is not None and dte <= 1:
            if is_entry:
                score -= 20
                warnings.append("0-1 DTE - extreme theta, avoid new entries")
                quality = "avoid"
            else:
                score += 10
                recommendations.append("Near expiration - prioritize exit")

        # Catalyst consideration
        if has_catalyst:
            score += 5
            reasons.append("Known catalyst - timing may matter less than direction")

        # Determine final quality
        if score >= 75:
            quality = "excellent"
        elif score >= 60:
            quality = "good"
        elif score >= 45:
            quality = "acceptable"
        elif score >= 30:
            quality = "poor"
        else:
            quality = "avoid"

        is_good = quality in ("excellent", "good", "acceptable")

        reason = " | ".join(reasons) if reasons else "Standard trading hours"

        return MarketTimingSignal(
            is_good_time=is_good,
            quality=quality,
            score=max(0, min(100, score)),
            reason=reason,
            warnings=warnings,
            recommendations=recommendations,
            session=session,
            minutes_since_open=minutes_open,
            minutes_until_close=minutes_close,
        )

    def _get_session_info(
        self, current_time: time, weekday: int
    ) -> Tuple[str, int, int]:
        """
        Determine market session and timing info.

        Returns:
            Tuple of (session_name, minutes_since_open, minutes_until_close)
        """
        if weekday >= 5:  # Weekend
            return "closed", 0, 0

        # Convert to minutes for easier comparison
        current_minutes = current_time.hour * 60 + current_time.minute
        open_minutes = self.MARKET_OPEN.hour * 60 + self.MARKET_OPEN.minute
        close_minutes = self.MARKET_CLOSE.hour * 60 + self.MARKET_CLOSE.minute
        pre_market_minutes = self.PRE_MARKET_START.hour * 60 + self.PRE_MARKET_START.minute
        after_hours_minutes = self.AFTER_HOURS_END.hour * 60 + self.AFTER_HOURS_END.minute

        if current_minutes < pre_market_minutes:
            return "closed", 0, 0
        elif current_minutes < open_minutes:
            return "pre_market", 0, 0
        elif current_minutes < close_minutes:
            minutes_open = current_minutes - open_minutes
            minutes_close = close_minutes - current_minutes
            return "regular", minutes_open, minutes_close
        elif current_minutes < after_hours_minutes:
            return "after_hours", 0, 0
        else:
            return "closed", 0, 0

    def _check_day_of_week(
        self, weekday: int, is_entry: bool
    ) -> Dict[str, any]:
        """Check day-of-week patterns."""
        result = {"score_adj": 0}

        if weekday == 0:  # Monday
            result["score_adj"] = -5
            result["warning"] = "Monday: Watch for gap risk from weekend news"

        elif weekday == 4:  # Friday
            if is_entry:
                result["score_adj"] = -10
                result["warning"] = "Friday: Weekend theta decay, pin risk near expiration"
                result["recommendation"] = "Consider waiting for Monday unless urgent"
            else:
                result["score_adj"] = 5
                result["recommendation"] = "Friday exits avoid weekend decay"

        elif weekday == 2:  # Wednesday
            result["score_adj"] = 5  # Mid-week stability

        elif weekday == 3:  # Thursday
            result["score_adj"] = 5
            result["recommendation"] = "Thursday often good for entries before Friday"

        return result

    def get_next_optimal_window(
        self, current_time: Optional[datetime] = None
    ) -> Tuple[datetime, str]:
        """
        Find the next optimal entry window.

        Returns:
            Tuple of (next_optimal_time, description)
        """
        tz = self.get_timezone()

        if current_time is None:
            current_time = datetime.now(tz) if tz else datetime.now()

        if tz and current_time.tzinfo is None:
            current_time = tz.localize(current_time)

        # Get current Eastern time
        if tz:
            et_now = current_time.astimezone(tz)
        else:
            et_now = current_time

        weekday = et_now.weekday()

        # If weekend, find Monday
        if weekday >= 5:
            days_until_monday = 7 - weekday
            next_day = et_now + timedelta(days=days_until_monday)
            optimal_time = datetime.combine(next_day.date(), time(10, 15))
            if tz:
                optimal_time = tz.localize(optimal_time)
            return optimal_time, "Monday 10:15 AM - first good window after weekend"

        # If before market open, find 10:15 AM today
        current_time_only = et_now.time()
        if current_time_only < time(10, 15):
            optimal_time = datetime.combine(et_now.date(), time(10, 15))
            if tz:
                optimal_time = tz.localize(optimal_time)
            return optimal_time, "10:15 AM today - prime morning window"

        # If in lunch lull, find 1:00 PM
        if time(11, 30) <= current_time_only < time(13, 0):
            optimal_time = datetime.combine(et_now.date(), time(13, 0))
            if tz:
                optimal_time = tz.localize(optimal_time)
            return optimal_time, "1:00 PM today - afternoon window opens"

        # If after 3:45 PM, find next day 10:15 AM
        if current_time_only >= time(15, 45):
            next_day = et_now + timedelta(days=1)
            # Skip weekend
            if next_day.weekday() >= 5:
                days_until_monday = 7 - next_day.weekday()
                next_day = next_day + timedelta(days=days_until_monday)
            optimal_time = datetime.combine(next_day.date(), time(10, 15))
            if tz:
                optimal_time = tz.localize(optimal_time)
            return optimal_time, "10:15 AM next trading day"

        # Otherwise, current time is acceptable
        return et_now, "Current time is within acceptable trading hours"


class MarketTimingScorer:
    """Scorer component that uses timing signals."""

    key = "market_timing"
    default_weight = 0.5  # Lower weight - timing is helpful but not critical

    def __init__(self):
        self.filter = MarketTimingFilter()

    def score(self, context) -> Tuple[float, List[str], List[str]]:
        """Score based on market timing."""
        reasons = []
        tags = []

        # Get timing signal
        signal = self.filter.check_timing(
            dte=context.contract.days_to_expiration,
            is_entry=True,
        )

        # Convert timing quality to score
        quality_scores = {
            "excellent": 20,
            "good": 15,
            "acceptable": 8,
            "poor": 0,
            "avoid": -10,
            "closed": -20,
        }

        score = quality_scores.get(signal.quality, 0)

        if signal.quality in ("excellent", "good"):
            reasons.append(f"Good entry timing: {signal.reason}")
            tags.append("good-timing")
        elif signal.quality == "poor":
            reasons.append(f"Suboptimal timing: {signal.reason}")
            tags.append("timing-warning")
        elif signal.quality == "avoid":
            reasons.append(f"Avoid entry now: {signal.reason}")
            tags.append("avoid-entry")

        for warning in signal.warnings:
            reasons.append(f"⚠️ {warning}")

        return score, reasons, tags


__all__ = ["MarketTimingFilter", "MarketTimingSignal", "MarketTimingScorer"]
