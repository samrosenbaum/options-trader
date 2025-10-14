"""Strategy validation using historical pattern matching.

This module validates option strategies by finding similar historical patterns
and analyzing their outcomes.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import yfinance as yf
import pandas as pd
import numpy as np


@dataclass
class BacktestResult:
    """Results from backtesting a similar strategy pattern."""

    # Pattern matching
    pattern_type: str
    similar_trades_found: int
    lookback_days: int

    # Win/loss statistics
    winning_trades: int
    losing_trades: int
    win_rate: float

    # P&L metrics
    avg_return_pct: float
    median_return_pct: float
    best_return_pct: float
    worst_return_pct: float
    total_return_pct: float

    # Risk metrics
    sharpe_ratio: Optional[float]
    max_drawdown_pct: float
    avg_days_held: float

    # Statistical confidence
    sample_size_quality: str  # 'low', 'medium', 'high'
    confidence_level: float

    # Pattern details
    pattern_description: str
    recent_examples: List[Dict[str, Any]]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'patternType': self.pattern_type,
            'similarTradesFound': self.similar_trades_found,
            'lookbackDays': self.lookback_days,
            'winningTrades': self.winning_trades,
            'losingTrades': self.losing_trades,
            'winRate': round(self.win_rate * 100, 1),
            'avgReturnPct': round(self.avg_return_pct * 100, 1),
            'medianReturnPct': round(self.median_return_pct * 100, 1),
            'bestReturnPct': round(self.best_return_pct * 100, 1),
            'worstReturnPct': round(self.worst_return_pct * 100, 1),
            'totalReturnPct': round(self.total_return_pct * 100, 1),
            'sharpeRatio': round(self.sharpe_ratio, 2) if self.sharpe_ratio else None,
            'maxDrawdownPct': round(self.max_drawdown_pct * 100, 1),
            'avgDaysHeld': round(self.avg_days_held, 1),
            'sampleSizeQuality': self.sample_size_quality,
            'confidenceLevel': round(self.confidence_level, 2),
            'patternDescription': self.pattern_description,
            'recentExamples': self.recent_examples[:3]  # Show top 3
        }


class StrategyValidator:
    """Validates strategies by finding and analyzing similar historical patterns."""

    def __init__(self, lookback_days: int = 365):
        """Initialize validator with lookback period."""
        self.lookback_days = lookback_days
        self._price_cache: Dict[str, pd.DataFrame] = {}

    def _get_historical_prices(self, symbol: str) -> Optional[pd.DataFrame]:
        """Fetch historical price data for a symbol."""
        if symbol in self._price_cache:
            return self._price_cache[symbol]

        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=f"{self.lookback_days}d", auto_adjust=True)

            if df.empty:
                return None

            self._price_cache[symbol] = df
            return df

        except Exception as e:
            print(f"Error fetching prices for {symbol}: {e}")
            return None

    def validate_strategy(
        self,
        symbol: str,
        option_type: str,
        strike: float,
        stock_price: float,
        premium: float,
        days_to_expiration: int,
        implied_volatility: float
    ) -> Optional[BacktestResult]:
        """Validate a strategy by finding similar historical patterns.

        Args:
            symbol: Stock ticker
            option_type: 'call' or 'put'
            strike: Strike price
            stock_price: Current stock price
            premium: Option premium (per contract)
            days_to_expiration: Days until expiration
            implied_volatility: Current IV

        Returns:
            BacktestResult with historical performance, or None if insufficient data
        """

        # Get historical price data
        prices_df = self._get_historical_prices(symbol)
        if prices_df is None or len(prices_df) < days_to_expiration + 30:
            return None

        # Calculate key characteristics of this opportunity
        moneyness = (stock_price / strike) if option_type == 'call' else (strike / stock_price)
        premium_pct = (premium / stock_price) * 100
        breakeven_move_pct = premium_pct

        # Find similar historical patterns
        similar_patterns = self._find_similar_patterns(
            prices_df=prices_df,
            option_type=option_type,
            moneyness=moneyness,
            premium_pct=premium_pct,
            days_to_exp=days_to_expiration,
            breakeven_move_pct=breakeven_move_pct
        )

        if not similar_patterns:
            return None

        # Analyze outcomes
        returns = [p['return_pct'] for p in similar_patterns]
        wins = [r for r in returns if r > 0]
        losses = [r for r in returns if r <= 0]

        win_rate = len(wins) / len(returns) if returns else 0
        avg_return = np.mean(returns) if returns else 0
        median_return = np.median(returns) if returns else 0

        # Calculate Sharpe ratio (assuming risk-free rate of 4.5%)
        if len(returns) > 1:
            returns_std = np.std(returns)
            sharpe = (avg_return - 0.045 / 12) / returns_std if returns_std > 0 else None
        else:
            sharpe = None

        # Calculate max drawdown
        equity_curve = np.cumsum(returns)
        running_max = np.maximum.accumulate(equity_curve)
        drawdown = equity_curve - running_max
        max_drawdown = abs(np.min(drawdown)) if len(drawdown) > 0 else 0

        # Sample size quality
        if len(similar_patterns) >= 20:
            sample_quality = 'high'
            confidence = 0.95
        elif len(similar_patterns) >= 10:
            sample_quality = 'medium'
            confidence = 0.80
        else:
            sample_quality = 'low'
            confidence = 0.60

        # Create pattern description
        if option_type == 'call':
            direction_text = f"{moneyness:.1%} ITM" if moneyness > 1 else f"{(1-moneyness)*100:.1f}% OTM"
        else:
            direction_text = f"{moneyness:.1%} ITM" if moneyness > 1 else f"{(1-moneyness)*100:.1f}% OTM"

        pattern_desc = (
            f"{option_type.upper()} {direction_text}, "
            f"{premium_pct:.1f}% premium, "
            f"~{days_to_expiration}d expiry on {symbol}"
        )

        # Get recent examples
        recent_examples = [
            {
                'date': p['entry_date'].strftime('%Y-%m-%d'),
                'returnPct': round(p['return_pct'] * 100, 1),
                'daysHeld': p['days_held'],
                'outcome': 'win' if p['return_pct'] > 0 else 'loss'
            }
            for p in sorted(similar_patterns, key=lambda x: x['entry_date'], reverse=True)[:5]
        ]

        return BacktestResult(
            pattern_type=f"{option_type}_{direction_text.replace(' ', '_')}",
            similar_trades_found=len(similar_patterns),
            lookback_days=self.lookback_days,
            winning_trades=len(wins),
            losing_trades=len(losses),
            win_rate=win_rate,
            avg_return_pct=avg_return,
            median_return_pct=median_return,
            best_return_pct=max(returns) if returns else 0,
            worst_return_pct=min(returns) if returns else 0,
            total_return_pct=sum(returns),
            sharpe_ratio=sharpe,
            max_drawdown_pct=max_drawdown,
            avg_days_held=np.mean([p['days_held'] for p in similar_patterns]),
            sample_size_quality=sample_quality,
            confidence_level=confidence,
            pattern_description=pattern_desc,
            recent_examples=recent_examples
        )

    def _find_similar_patterns(
        self,
        prices_df: pd.DataFrame,
        option_type: str,
        moneyness: float,
        premium_pct: float,
        days_to_exp: int,
        breakeven_move_pct: float
    ) -> List[Dict[str, Any]]:
        """Find similar historical patterns and simulate their outcomes."""

        patterns = []
        closes = prices_df['Close'].values
        dates = prices_df.index.to_pydatetime()

        # Strip timezone for consistent arithmetic
        dates = [d.replace(tzinfo=None) if d.tzinfo else d for d in dates]

        # Scan through history looking for similar setups
        for i in range(len(closes) - days_to_exp - 5):
            entry_price = closes[i]

            # Simulate option entry with similar moneyness
            if option_type == 'call':
                simulated_strike = entry_price / moneyness
            else:
                simulated_strike = entry_price * moneyness

            # Check if price moved favorably within the time window
            future_prices = closes[i:i + days_to_exp + 1]
            if len(future_prices) < days_to_exp + 1:
                continue

            # Simulate option outcome
            if option_type == 'call':
                # Call wins if stock goes up enough
                max_price = np.max(future_prices)
                move_pct = ((max_price - entry_price) / entry_price) * 100

                # Approximate option value at expiration
                final_price = future_prices[-1]
                if final_price > simulated_strike:
                    # ITM - intrinsic value
                    option_value = (final_price - simulated_strike) / entry_price * 100
                else:
                    # OTM - worthless
                    option_value = 0
            else:
                # Put wins if stock goes down enough
                min_price = np.min(future_prices)
                move_pct = ((entry_price - min_price) / entry_price) * 100

                final_price = future_prices[-1]
                if final_price < simulated_strike:
                    # ITM
                    option_value = (simulated_strike - final_price) / entry_price * 100
                else:
                    # OTM
                    option_value = 0

            # Calculate return
            # If option reached breakeven at any point, assume we could have profited
            if move_pct >= breakeven_move_pct:
                # Simulate taking profit at 50% gain
                return_pct = 0.50
            elif option_value > premium_pct:
                # Closed with some profit
                return_pct = (option_value - premium_pct) / premium_pct
            else:
                # Loss (option expired worthless or we closed for less than entry)
                return_pct = (option_value - premium_pct) / premium_pct

            patterns.append({
                'entry_date': dates[i],
                'entry_price': entry_price,
                'exit_date': dates[i + days_to_exp],
                'exit_price': final_price,
                'return_pct': return_pct,
                'days_held': days_to_exp,
                'max_move_pct': move_pct
            })

        return patterns
