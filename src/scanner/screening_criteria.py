"""
Enhanced Options Screening Criteria Framework

Implements sophisticated multi-layer filtering for options trading:
1. Stock-level filters (market cap, volume, price, trend)
2. Options-specific filters (OI, volume, bid-ask spread, IV rank)
3. Trade structure parameters (directional vs income strategies)
4. Risk management rules
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import pandas as pd
import numpy as np


@dataclass
class TrendAnalysis:
    """EMA-based trend analysis results"""
    direction: str  # "UPTREND", "DOWNTREND", "NEUTRAL"
    ema_20: float
    ema_50: float
    current_price: float
    alignment_score: float  # 0-100


@dataclass
class TradeStructure:
    """Parameters for different trade types"""
    strategy_type: str  # "directional" or "income"
    min_delta: float
    max_delta: float
    min_dte: int
    max_dte: int
    min_pop: float  # probability of profit
    target_return: float  # target return percentage


# Strategy configurations
DIRECTIONAL_STRUCTURE = TradeStructure(
    strategy_type="directional",
    min_delta=0.40,
    max_delta=0.60,
    min_dte=45,
    max_dte=90,
    min_pop=0.40,
    target_return=1.0  # 100% return target
)

INCOME_STRUCTURE = TradeStructure(
    strategy_type="income",
    min_delta=0.20,
    max_delta=0.30,
    min_dte=30,
    max_dte=45,
    min_pop=0.60,
    target_return=0.33  # 33% return target
)


class StockScreener:
    """Stock-level filtering criteria"""

    MIN_MARKET_CAP = 2_000_000_000  # $2B
    MIN_AVG_VOLUME = 1_000_000  # 1M shares
    MIN_PRICE = 10.0  # $10

    @staticmethod
    def calculate_ema(prices: pd.Series, period: int) -> pd.Series:
        """Calculate Exponential Moving Average"""
        return prices.ewm(span=period, adjust=False).mean()

    @classmethod
    def analyze_trend(cls, price_history: pd.DataFrame) -> Optional[TrendAnalysis]:
        """
        Analyze stock trend using 20/50 EMA alignment

        Args:
            price_history: DataFrame with 'close' column and at least 50 days of data

        Returns:
            TrendAnalysis object or None if insufficient data
        """
        if price_history.empty or len(price_history) < 50:
            return None

        closes = price_history['close'].astype(float)

        ema_20 = cls.calculate_ema(closes, 20).iloc[-1]
        ema_50 = cls.calculate_ema(closes, 50).iloc[-1]
        current_price = closes.iloc[-1]

        # Determine trend direction
        if ema_20 > ema_50 and current_price > ema_20:
            direction = "UPTREND"
            # Score based on separation between EMAs and price
            ema_separation = ((ema_20 - ema_50) / ema_50) * 100
            price_above_ema = ((current_price - ema_20) / ema_20) * 100
            alignment_score = min(100, 50 + ema_separation * 10 + price_above_ema * 5)
        elif ema_20 < ema_50 and current_price < ema_20:
            direction = "DOWNTREND"
            ema_separation = ((ema_50 - ema_20) / ema_50) * 100
            price_below_ema = ((ema_20 - current_price) / ema_20) * 100
            alignment_score = min(100, 50 + ema_separation * 10 + price_below_ema * 5)
        else:
            direction = "NEUTRAL"
            alignment_score = 30  # Neutral gets lower score

        return TrendAnalysis(
            direction=direction,
            ema_20=float(ema_20),
            ema_50=float(ema_50),
            current_price=float(current_price),
            alignment_score=float(alignment_score)
        )

    @classmethod
    def passes_stock_filters(
        cls,
        market_cap: float,
        avg_volume: float,
        price: float
    ) -> Tuple[bool, List[str]]:
        """
        Check if stock passes basic filters

        Returns:
            (passes, reasons) - bool and list of failure reasons
        """
        reasons = []

        if market_cap < cls.MIN_MARKET_CAP:
            reasons.append(f"Market cap ${market_cap/1e9:.1f}B < ${cls.MIN_MARKET_CAP/1e9:.1f}B minimum")

        if avg_volume < cls.MIN_AVG_VOLUME:
            reasons.append(f"Avg volume {avg_volume:,.0f} < {cls.MIN_AVG_VOLUME:,.0f} minimum")

        if price < cls.MIN_PRICE:
            reasons.append(f"Price ${price:.2f} < ${cls.MIN_PRICE:.2f} minimum (penny stock)")

        return len(reasons) == 0, reasons


class OptionsScreener:
    """Options-specific filtering criteria"""

    MIN_OPEN_INTEREST = 1000
    MIN_VOLUME = 100
    MAX_BID_ASK_SPREAD_PCT = 0.05  # 5% of option price
    MIN_IV_RANK = 0.30  # 30th percentile
    MAX_IV_RANK = 0.70  # 70th percentile

    @classmethod
    def calculate_bid_ask_spread_pct(cls, bid: float, ask: float, last_price: float) -> float:
        """Calculate bid-ask spread as percentage of option price"""
        if last_price <= 0:
            return 1.0  # 100% = fail
        spread = ask - bid
        return spread / last_price

    @classmethod
    def passes_options_filters(
        cls,
        open_interest: int,
        volume: int,
        bid: float,
        ask: float,
        last_price: float,
        iv_rank: Optional[float] = None
    ) -> Tuple[bool, List[str]]:
        """
        Check if option passes quality filters

        Returns:
            (passes, reasons) - bool and list of failure reasons
        """
        reasons = []

        if open_interest < cls.MIN_OPEN_INTEREST:
            reasons.append(f"OI {open_interest} < {cls.MIN_OPEN_INTEREST} minimum")

        if volume < cls.MIN_VOLUME:
            reasons.append(f"Volume {volume} < {cls.MIN_VOLUME} minimum")

        spread_pct = cls.calculate_bid_ask_spread_pct(bid, ask, last_price)
        if spread_pct > cls.MAX_BID_ASK_SPREAD_PCT:
            reasons.append(f"Bid-ask spread {spread_pct*100:.1f}% > {cls.MAX_BID_ASK_SPREAD_PCT*100:.1f}% max")

        if iv_rank is not None:
            if iv_rank < cls.MIN_IV_RANK:
                reasons.append(f"IV Rank {iv_rank*100:.0f}% < {cls.MIN_IV_RANK*100:.0f}% minimum")
            elif iv_rank > cls.MAX_IV_RANK:
                reasons.append(f"IV Rank {iv_rank*100:.0f}% > {cls.MAX_IV_RANK*100:.0f}% maximum")

        return len(reasons) == 0, reasons


class TradeStructureFilter:
    """Filter options based on trade structure (directional vs income)"""

    @staticmethod
    def passes_structure_filters(
        delta: float,
        days_to_expiration: int,
        probability_of_profit: float,
        structure: TradeStructure
    ) -> Tuple[bool, List[str]]:
        """
        Check if option matches desired trade structure

        Returns:
            (passes, reasons) - bool and list of failure reasons
        """
        reasons = []

        abs_delta = abs(delta)

        if abs_delta < structure.min_delta:
            reasons.append(f"Delta {abs_delta:.2f} < {structure.min_delta:.2f} minimum for {structure.strategy_type}")
        elif abs_delta > structure.max_delta:
            reasons.append(f"Delta {abs_delta:.2f} > {structure.max_delta:.2f} maximum for {structure.strategy_type}")

        if days_to_expiration < structure.min_dte:
            reasons.append(f"DTE {days_to_expiration} < {structure.min_dte} minimum for {structure.strategy_type}")
        elif days_to_expiration > structure.max_dte:
            reasons.append(f"DTE {days_to_expiration} > {structure.max_dte} maximum for {structure.strategy_type}")

        if probability_of_profit < structure.min_pop:
            reasons.append(f"PoP {probability_of_profit*100:.0f}% < {structure.min_pop*100:.0f}% minimum for {structure.strategy_type}")

        return len(reasons) == 0, reasons

    @staticmethod
    def determine_best_structure(
        delta: float,
        days_to_expiration: int,
        probability_of_profit: float
    ) -> Optional[str]:
        """
        Determine which trade structure this option best fits

        Returns:
            "directional", "income", or None if doesn't fit either
        """
        abs_delta = abs(delta)

        # Check directional fit
        directional_passes, _ = TradeStructureFilter.passes_structure_filters(
            delta, days_to_expiration, probability_of_profit, DIRECTIONAL_STRUCTURE
        )

        # Check income fit
        income_passes, _ = TradeStructureFilter.passes_structure_filters(
            delta, days_to_expiration, probability_of_profit, INCOME_STRUCTURE
        )

        if directional_passes:
            return "directional"
        elif income_passes:
            return "income"
        else:
            return None


class TradeScoreCalculator:
    """Calculate comprehensive trade score from multiple factors"""

    @staticmethod
    def calculate_liquidity_score(
        open_interest: int,
        volume: int,
        bid_ask_spread_pct: float
    ) -> float:
        """
        Calculate liquidity score (0-100)

        Based on:
        - Open interest (high is good)
        - Volume (high is good)
        - Bid-ask spread (low is good)
        """
        score = 0.0

        # Open interest score (max 40 points)
        if open_interest >= 5000:
            score += 40
        elif open_interest >= 2000:
            score += 30
        elif open_interest >= 1000:
            score += 20
        else:
            score += max(0, (open_interest / 1000) * 20)

        # Volume score (max 40 points)
        if volume >= 500:
            score += 40
        elif volume >= 200:
            score += 30
        elif volume >= 100:
            score += 20
        else:
            score += max(0, (volume / 100) * 20)

        # Bid-ask spread score (max 20 points)
        if bid_ask_spread_pct <= 0.02:  # <= 2%
            score += 20
        elif bid_ask_spread_pct <= 0.05:  # <= 5%
            score += 15
        elif bid_ask_spread_pct <= 0.10:  # <= 10%
            score += 10
        else:
            score += max(0, 10 - (bid_ask_spread_pct * 100))

        return min(100.0, score)

    @staticmethod
    def calculate_risk_reward_score(
        expected_return: float,
        max_loss: float,
        probability_of_profit: float
    ) -> float:
        """
        Calculate risk/reward score (0-100)

        Based on:
        - Expected return vs max loss ratio
        - Probability of profit
        """
        if max_loss <= 0:
            return 0.0

        rr_ratio = expected_return / abs(max_loss)

        # Base score from R/R ratio (max 60 points)
        if rr_ratio >= 2.0:
            rr_score = 60
        elif rr_ratio >= 1.5:
            rr_score = 50
        elif rr_ratio >= 1.0:
            rr_score = 40
        else:
            rr_score = max(0, rr_ratio * 40)

        # Probability adjustment (max 40 points)
        pop_score = probability_of_profit * 40

        return min(100.0, rr_score + pop_score)

    @classmethod
    def calculate_trade_score(
        cls,
        trend_alignment_score: float,
        probability_of_profit: float,
        expected_return: float,
        max_loss: float,
        open_interest: int,
        volume: int,
        bid_ask_spread_pct: float
    ) -> Dict[str, float]:
        """
        Calculate comprehensive trade score with breakdown

        Weighting:
        - Technical alignment: 30%
        - Probability of profit: 30%
        - Risk/Reward: 20%
        - Liquidity: 20%

        Returns:
            Dictionary with total_score and component scores
        """
        # Component scores
        technical_score = trend_alignment_score
        probability_score = probability_of_profit * 100
        risk_reward_score = cls.calculate_risk_reward_score(
            expected_return, max_loss, probability_of_profit
        )
        liquidity_score = cls.calculate_liquidity_score(
            open_interest, volume, bid_ask_spread_pct
        )

        # Weighted total
        total_score = (
            technical_score * 0.30 +
            probability_score * 0.30 +
            risk_reward_score * 0.20 +
            liquidity_score * 0.20
        )

        return {
            'total_score': round(total_score, 2),
            'technical_score': round(technical_score, 2),
            'probability_score': round(probability_score, 2),
            'risk_reward_score': round(risk_reward_score, 2),
            'liquidity_score': round(liquidity_score, 2)
        }


class RiskManagement:
    """Risk management and position sizing rules"""

    STOP_LOSS_PCT = 0.50  # 50% of premium paid
    PROFIT_TARGET_PCT = 0.50  # 50% profit - consider taking half off
    FULL_EXIT_PCT = 1.00  # 100% profit - consider full exit

    @staticmethod
    def calculate_position_size(
        account_value: float,
        risk_per_trade_pct: float,
        option_price: float,
        max_loss: float
    ) -> Dict[str, float]:
        """
        Calculate position size based on risk management rules

        Position size: 1-3% max per trade

        Returns:
            Dictionary with contracts, dollar_amount, and risk_percent
        """
        # Risk amount in dollars
        risk_amount = account_value * risk_per_trade_pct

        # Calculate contracts based on max loss
        if max_loss > 0:
            contracts = risk_amount / (max_loss * 100)  # *100 for contract multiplier
        else:
            contracts = risk_amount / (option_price * 100)

        # Cap at reasonable limits
        contracts = max(1, min(contracts, 100))  # Between 1 and 100 contracts

        dollar_amount = contracts * option_price * 100
        actual_risk = (dollar_amount / account_value) * 100

        return {
            'contracts': int(contracts),
            'dollar_amount': round(dollar_amount, 2),
            'risk_percent': round(actual_risk, 2)
        }

    @staticmethod
    def check_earnings_date(
        symbol: str,
        expiration_date: datetime,
        earnings_dates: Optional[List[datetime]] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if earnings date falls within option lifetime

        Returns:
            (has_earnings, warning_message)
        """
        if not earnings_dates:
            return False, None

        for earnings_date in earnings_dates:
            if earnings_date < expiration_date:
                days_until = (earnings_date - datetime.now()).days
                return True, f"Earnings in {days_until} days (before expiration)"

        return False, None
