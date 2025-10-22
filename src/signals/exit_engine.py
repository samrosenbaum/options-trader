"""
Exit Signal Engine - Know When to Take Profits or Cut Losses

Strategy:
  - Tiered profit taking (25%, 50%, 100%)
  - Trailing stops to protect gains
  - Momentum indicators (volume, direction, IV)
  - Different logic for PULLBACK, BREAKOUT, BOUNCE plays

NO PREDICTIONS - Just indicators and risk management.
"""

import yfinance as yf
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Literal
from dataclasses import dataclass
import pandas as pd


SignalType = Literal["SELL_ALL", "SELL_PARTIAL", "HOLD", "CUT_LOSS"]


@dataclass
class ExitSignal:
    """Exit signal with reasoning."""
    signal: SignalType
    confidence: float  # 0-100
    reasoning: List[str]
    trailing_stop_price: Optional[float] = None
    suggested_action: str = ""

    # Momentum indicators
    momentum_strength: str = "UNKNOWN"  # STRONG, WEAKENING, DEAD
    volume_ratio: Optional[float] = None
    iv_change_pct: Optional[float] = None


class ExitSignalEngine:
    """Generate exit signals for open positions."""

    def __init__(self):
        pass

    def analyze_position(
        self,
        # Entry data
        symbol: str,
        option_type: str,  # "call" or "put"
        strike: float,
        expiration: str,
        entry_price: float,
        entry_date: str,
        entry_stock_price: float,
        play_type: str,  # "PULLBACK", "BREAKOUT", "BOUNCE"

        # Current data
        current_option_price: float,
        current_stock_price: float,

        # Optional tracking
        peak_price: Optional[float] = None,
        stop_loss_pct: float = -50,
        target_profit_pct: float = 50,
    ) -> ExitSignal:
        """
        Analyze a position and generate exit signal.

        Returns:
            ExitSignal with SELL_ALL, SELL_PARTIAL, HOLD, or CUT_LOSS
        """

        # Calculate profit
        profit_pct = ((current_option_price - entry_price) / entry_price) * 100

        # Track peak for trailing stop
        if peak_price is None:
            peak_price = max(entry_price, current_option_price)
        else:
            peak_price = max(peak_price, current_option_price)

        # Calculate trailing stop (20% from peak)
        trailing_stop = peak_price * 0.80

        # Days to expiration
        exp_date = datetime.strptime(expiration, "%Y-%m-%d")
        dte = (exp_date - datetime.now()).days

        # Get momentum indicators
        momentum = self._check_momentum(
            symbol,
            option_type,
            entry_stock_price,
            current_stock_price,
            play_type
        )

        # Build reasoning
        reasoning = []

        # UNIVERSAL RULES (apply to all play types)

        # Rule 1: Stop loss
        if profit_pct <= stop_loss_pct:
            reasoning.append(f"🛑 Stop loss hit ({profit_pct:.1f}% loss)")
            reasoning.append("Cut loser and preserve capital for next trade")
            return ExitSignal(
                signal="CUT_LOSS",
                confidence=100,
                reasoning=reasoning,
                suggested_action=f"Exit now - down {abs(profit_pct):.1f}%",
                momentum_strength=momentum['strength'],
                volume_ratio=momentum['volume_ratio'],
                iv_change_pct=momentum.get('iv_change_pct')
            )

        # Rule 2: Theta danger (0-1 DTE)
        if dte <= 1:
            reasoning.append(f"⏰ Only {dte} day{'s' if dte != 1 else ''} left - theta burn extreme")
            if profit_pct > 0:
                reasoning.append(f"Lock in {profit_pct:.1f}% gain before decay")
                return ExitSignal(
                    signal="SELL_ALL",
                    confidence=95,
                    reasoning=reasoning,
                    suggested_action=f"Exit now - secure +{profit_pct:.1f}%",
                    momentum_strength=momentum['strength'],
                    volume_ratio=momentum['volume_ratio']
                )
            else:
                reasoning.append("Minimize further losses from theta decay")
                return ExitSignal(
                    signal="SELL_ALL",
                    confidence=90,
                    reasoning=reasoning,
                    suggested_action="Exit to stop bleeding",
                    momentum_strength=momentum['strength']
                )

        # Rule 3: Trailing stop hit (protecting gains)
        if profit_pct > 25 and current_option_price < trailing_stop:
            reasoning.append(f"📉 Trailing stop triggered (peak ${peak_price:.2f} → ${current_option_price:.2f})")
            reasoning.append(f"Locked in {profit_pct:.1f}% gain before bigger reversal")
            return ExitSignal(
                signal="SELL_ALL",
                confidence=85,
                reasoning=reasoning,
                trailing_stop_price=trailing_stop,
                suggested_action=f"Exit - trailing stop hit (+{profit_pct:.1f}%)",
                momentum_strength=momentum['strength']
            )

        # PLAY-SPECIFIC RULES

        if play_type == "PULLBACK":
            return self._analyze_pullback(
                profit_pct, dte, momentum, entry_stock_price,
                current_stock_price, option_type, reasoning,
                target_profit_pct, trailing_stop, peak_price
            )

        elif play_type == "BREAKOUT":
            return self._analyze_breakout(
                profit_pct, dte, momentum, reasoning,
                target_profit_pct, trailing_stop, peak_price
            )

        elif play_type == "BOUNCE":
            return self._analyze_bounce(
                profit_pct, dte, momentum, entry_stock_price,
                current_stock_price, option_type, reasoning,
                target_profit_pct, trailing_stop, peak_price
            )

        else:
            # Default conservative exit
            return self._default_exit_logic(
                profit_pct, dte, momentum, reasoning,
                target_profit_pct, trailing_stop, peak_price
            )

    def _analyze_pullback(
        self,
        profit_pct: float,
        dte: int,
        momentum: Dict[str, Any],
        entry_stock_price: float,
        current_stock_price: float,
        option_type: str,
        reasoning: List[str],
        target_profit_pct: float,
        trailing_stop: float,
        peak_price: float
    ) -> ExitSignal:
        """
        PULLBACK play: Stock ripped up, bought puts for pullback.

        Exit when:
        - Stock pulled back enough (thesis complete)
        - Hit profit target (30-50%)
        - Stock reversing back up (thesis failing)
        """

        # Calculate stock movement
        stock_move_pct = ((current_stock_price - entry_stock_price) / entry_stock_price) * 100

        # For puts, we want stock to go DOWN
        if option_type.lower() == "put":
            pullback_amount = -stock_move_pct  # Negative stock move = good for puts
        else:
            pullback_amount = stock_move_pct

        # SELL signals

        # Hit profit target (30-50% for quick scalps)
        if profit_pct >= target_profit_pct:
            reasoning.append(f"🎯 Hit {profit_pct:.1f}% profit target")
            if pullback_amount >= 3:
                reasoning.append(f"✅ Stock pulled back {pullback_amount:.1f}% (thesis complete)")
            reasoning.append("Lock in gains - pullback plays are quick scalps")
            return ExitSignal(
                signal="SELL_ALL",
                confidence=90,
                reasoning=reasoning,
                suggested_action=f"Exit - target hit (+{profit_pct:.1f}%)",
                momentum_strength=momentum['strength'],
                volume_ratio=momentum['volume_ratio']
            )

        # Thesis complete (stock pulled back enough)
        if pullback_amount >= 4 and profit_pct >= 20:
            reasoning.append(f"✅ Stock pulled back {pullback_amount:.1f}% - objective met")
            reasoning.append(f"💰 Secured {profit_pct:.1f}% profit on quick play")
            reasoning.append("Mission accomplished - don't get greedy")
            return ExitSignal(
                signal="SELL_ALL",
                confidence=85,
                reasoning=reasoning,
                suggested_action="Exit - thesis complete",
                momentum_strength=momentum['strength']
            )

        # Stock reversing (thesis failing)
        if momentum['strength'] == "REVERSING":
            if profit_pct > 10:
                reasoning.append("⚠️ Stock reversing back up - exit with gains")
                reasoning.append(f"Take {profit_pct:.1f}% profit before it evaporates")
                return ExitSignal(
                    signal="SELL_ALL",
                    confidence=75,
                    reasoning=reasoning,
                    suggested_action="Exit before reversal",
                    momentum_strength=momentum['strength']
                )
            else:
                reasoning.append("❌ Thesis failing - stock not pulling back")
                reasoning.append("Cut small loss before it gets bigger")
                return ExitSignal(
                    signal="SELL_ALL",
                    confidence=70,
                    reasoning=reasoning,
                    suggested_action="Exit - thesis invalidated",
                    momentum_strength=momentum['strength']
                )

        # HOLD signals

        # Still room to run
        if pullback_amount < 3 and momentum['strength'] in ["STRONG", "MODERATE"]:
            reasoning.append(f"✋ Stock only pulled back {pullback_amount:.1f}% so far")
            reasoning.append(f"Current profit: {profit_pct:.1f}% (target: {target_profit_pct}%)")
            reasoning.append("Momentum still down - hold for more pullback")
            return ExitSignal(
                signal="HOLD",
                confidence=70,
                reasoning=reasoning,
                trailing_stop_price=trailing_stop if profit_pct > 20 else None,
                suggested_action=f"Hold - thesis playing out",
                momentum_strength=momentum['strength'],
                volume_ratio=momentum['volume_ratio']
            )

        # Default: Conservative hold
        reasoning.append(f"📊 Watching for {target_profit_pct}% profit or {pullback_amount+1:.0f}% pullback")
        return ExitSignal(
            signal="HOLD",
            confidence=60,
            reasoning=reasoning,
            suggested_action="Monitor closely",
            momentum_strength=momentum['strength']
        )

    def _analyze_breakout(
        self,
        profit_pct: float,
        dte: int,
        momentum: Dict[str, Any],
        reasoning: List[str],
        target_profit_pct: float,
        trailing_stop: float,
        peak_price: float
    ) -> ExitSignal:
        """
        BREAKOUT play: Ride momentum.

        Strategy:
        - Sell 1/3 at 50%
        - Sell 1/3 at 100%
        - Let 1/3 ride with trailing stop
        """

        # Tiered profit taking

        # First tier: 50% gain
        if 40 <= profit_pct < 80 and momentum['strength'] == "WEAKENING":
            reasoning.append(f"💰 At {profit_pct:.1f}% profit")
            reasoning.append("⚠️ Momentum weakening - take profits")
            reasoning.append("Consider: Sell 50%, let rest ride with trailing stop")
            return ExitSignal(
                signal="SELL_PARTIAL",
                confidence=75,
                reasoning=reasoning,
                trailing_stop_price=trailing_stop,
                suggested_action=f"Sell half - lock in {profit_pct:.1f}% gain",
                momentum_strength=momentum['strength'],
                volume_ratio=momentum['volume_ratio']
            )

        # Momentum still strong at 50%+
        if 40 <= profit_pct < 90 and momentum['strength'] == "STRONG":
            reasoning.append(f"🚀 At {profit_pct:.1f}% profit")
            reasoning.append("📈 Momentum still STRONG - let it run")
            reasoning.append(f"Volume {momentum['volume_ratio']:.1f}x average - confirmed strength")
            reasoning.append(f"Trailing stop protection at ${trailing_stop:.2f}")
            return ExitSignal(
                signal="HOLD",
                confidence=80,
                reasoning=reasoning,
                trailing_stop_price=trailing_stop,
                suggested_action="Hold - momentum accelerating",
                momentum_strength=momentum['strength'],
                volume_ratio=momentum['volume_ratio']
            )

        # Second tier: 100% gain (doubled!)
        if profit_pct >= 90:
            if momentum['strength'] == "STRONG":
                reasoning.append(f"💎 DOUBLED YOUR MONEY ({profit_pct:.1f}%)")
                reasoning.append("🚀 Momentum still strong")
                reasoning.append("Sell 50%, let rest ride to the moon")
                reasoning.append(f"Trailing stop at ${trailing_stop:.2f} (-20% from peak)")
                return ExitSignal(
                    signal="SELL_PARTIAL",
                    confidence=85,
                    reasoning=reasoning,
                    trailing_stop_price=trailing_stop,
                    suggested_action="Sell half - let winners run",
                    momentum_strength=momentum['strength'],
                    volume_ratio=momentum['volume_ratio']
                )
            else:
                reasoning.append(f"🎯 DOUBLED YOUR MONEY ({profit_pct:.1f}%)")
                reasoning.append("⚠️ Momentum weakening - lock it in")
                reasoning.append("Don't let a winner turn into a loser")
                return ExitSignal(
                    signal="SELL_ALL",
                    confidence=90,
                    reasoning=reasoning,
                    suggested_action="Exit - secure 100%+ gain",
                    momentum_strength=momentum['strength']
                )

        # Early stage - just hold
        if profit_pct < 40:
            reasoning.append(f"📊 Current profit: {profit_pct:.1f}% (target: 50%+)")
            reasoning.append(f"Momentum: {momentum['strength']}")
            reasoning.append("Hold for more upside")
            return ExitSignal(
                signal="HOLD",
                confidence=70,
                reasoning=reasoning,
                suggested_action="Hold - early in trade",
                momentum_strength=momentum['strength']
            )

        # Default
        return self._default_exit_logic(profit_pct, dte, momentum, reasoning, target_profit_pct, trailing_stop, peak_price)

    def _analyze_bounce(
        self,
        profit_pct: float,
        dte: int,
        momentum: Dict[str, Any],
        entry_stock_price: float,
        current_stock_price: float,
        option_type: str,
        reasoning: List[str],
        target_profit_pct: float,
        trailing_stop: float,
        peak_price: float
    ) -> ExitSignal:
        """
        BOUNCE play: Oversold bounce - quick scalp mentality.

        Exit when:
        - Hit 25-30% gain (quick wins)
        - Stock bounced 3%+
        - Momentum stalling
        """

        stock_move_pct = ((current_stock_price - entry_stock_price) / entry_stock_price) * 100

        # SELL signals (be aggressive on bounces - don't get greedy)

        # Quick 30% scalp
        if profit_pct >= 25:
            reasoning.append(f"✅ Quick {profit_pct:.1f}% gain on bounce")
            reasoning.append(f"Stock bounced {abs(stock_move_pct):.1f}%")
            reasoning.append("Bounces are fast - take the money")
            return ExitSignal(
                signal="SELL_ALL",
                confidence=85,
                reasoning=reasoning,
                suggested_action=f"Exit - quick scalp complete (+{profit_pct:.1f}%)",
                momentum_strength=momentum['strength'],
                volume_ratio=momentum['volume_ratio']
            )

        # Bounce complete (stock moved 3%+)
        if abs(stock_move_pct) >= 3 and profit_pct >= 15:
            reasoning.append(f"✅ 3% bounce complete ({abs(stock_move_pct):.1f}%)")
            reasoning.append(f"Secured {profit_pct:.1f}% profit")
            reasoning.append("Objective met - don't overstay")
            return ExitSignal(
                signal="SELL_ALL",
                confidence=80,
                reasoning=reasoning,
                suggested_action="Exit - bounce objective hit",
                momentum_strength=momentum['strength']
            )

        # Momentum stalling
        if momentum['strength'] == "WEAKENING" and profit_pct >= 10:
            reasoning.append("⚠️ Bounce momentum stalling")
            reasoning.append(f"Take {profit_pct:.1f}% quick profit")
            reasoning.append("Bounces can reverse fast")
            return ExitSignal(
                signal="SELL_ALL",
                confidence=75,
                reasoning=reasoning,
                suggested_action="Exit - momentum dying",
                momentum_strength=momentum['strength']
            )

        # HOLD signals

        # Bounce strengthening
        if momentum['strength'] == "STRONG" and abs(stock_move_pct) < 3:
            reasoning.append(f"📈 Bounce gaining momentum")
            reasoning.append(f"Current bounce: {abs(stock_move_pct):.1f}% (target: 3%)")
            reasoning.append(f"Profit: {profit_pct:.1f}% (target: 25-30%)")
            reasoning.append("Hold for quick scalp target")
            return ExitSignal(
                signal="HOLD",
                confidence=70,
                reasoning=reasoning,
                suggested_action="Hold - bounce developing",
                momentum_strength=momentum['strength'],
                volume_ratio=momentum['volume_ratio']
            )

        # Default
        reasoning.append(f"📊 Watching for 25% gain or 3% bounce")
        reasoning.append(f"Current: {profit_pct:.1f}% profit, {abs(stock_move_pct):.1f}% move")
        return ExitSignal(
            signal="HOLD",
            confidence=60,
            reasoning=reasoning,
            suggested_action="Monitor - bounce play",
            momentum_strength=momentum['strength']
        )

    def _default_exit_logic(
        self,
        profit_pct: float,
        dte: int,
        momentum: Dict[str, Any],
        reasoning: List[str],
        target_profit_pct: float,
        trailing_stop: float,
        peak_price: float
    ) -> ExitSignal:
        """Conservative default logic for undefined play types."""

        # Take profit at target
        if profit_pct >= target_profit_pct:
            reasoning.append(f"🎯 Hit {profit_pct:.1f}% profit target")
            reasoning.append("Lock in gains and move to next trade")
            return ExitSignal(
                signal="SELL_ALL",
                confidence=80,
                reasoning=reasoning,
                suggested_action=f"Exit - target hit (+{profit_pct:.1f}%)",
                momentum_strength=momentum['strength']
            )

        # Near target with weak momentum
        if profit_pct >= target_profit_pct * 0.75 and momentum['strength'] == "WEAKENING":
            reasoning.append(f"💰 At {profit_pct:.1f}% (close to {target_profit_pct}% target)")
            reasoning.append("⚠️ Momentum weakening")
            reasoning.append("Take profits before reversal")
            return ExitSignal(
                signal="SELL_ALL",
                confidence=75,
                reasoning=reasoning,
                suggested_action="Exit - secure gains",
                momentum_strength=momentum['strength']
            )

        # Hold with trailing stop
        reasoning.append(f"📊 Current profit: {profit_pct:.1f}% (target: {target_profit_pct}%)")
        reasoning.append(f"Momentum: {momentum['strength']}")
        if profit_pct > 20:
            reasoning.append(f"Trailing stop: ${trailing_stop:.2f}")
        return ExitSignal(
            signal="HOLD",
            confidence=65,
            reasoning=reasoning,
            trailing_stop_price=trailing_stop if profit_pct > 20 else None,
            suggested_action="Hold - monitoring",
            momentum_strength=momentum['strength']
        )

    def _check_momentum(
        self,
        symbol: str,
        option_type: str,
        entry_stock_price: float,
        current_stock_price: float,
        play_type: str
    ) -> Dict[str, Any]:
        """
        Check momentum indicators.

        Returns:
            Dict with strength, volume_ratio, direction, etc.
        """

        try:
            stock = yf.Ticker(symbol)
            hist = stock.history(period="5d")

            if len(hist) < 2:
                return {
                    'strength': 'UNKNOWN',
                    'volume_ratio': None,
                    'direction': 'UNKNOWN'
                }

            # Volume analysis
            avg_volume = hist['Volume'][:-1].mean()  # Exclude today
            current_volume = hist['Volume'].iloc[-1]
            volume_ratio = current_volume / avg_volume if avg_volume > 0 else 1.0

            # Price momentum (last 3 days)
            recent_changes = hist['Close'].pct_change().tail(3) * 100

            # For PULLBACK puts: Want stock going DOWN
            # For BREAKOUT calls: Want stock going UP
            # For BOUNCE calls: Want stock going UP

            if play_type == "PULLBACK" and option_type.lower() == "put":
                # Want negative momentum (stock falling)
                down_days = (recent_changes < 0).sum()
                if down_days >= 2 and volume_ratio >= 1.5:
                    strength = "STRONG"
                elif down_days >= 1:
                    strength = "MODERATE"
                elif down_days == 0:
                    strength = "REVERSING"  # Uh oh, stock going back up
                else:
                    strength = "WEAKENING"
            else:
                # Want positive momentum (stock rising)
                up_days = (recent_changes > 0).sum()
                if up_days >= 2 and volume_ratio >= 1.5:
                    strength = "STRONG"
                elif up_days >= 1:
                    strength = "MODERATE"
                elif up_days == 0:
                    strength = "DEAD"
                else:
                    strength = "WEAKENING"

            return {
                'strength': strength,
                'volume_ratio': volume_ratio,
                'direction': 'UP' if current_stock_price > entry_stock_price else 'DOWN',
                'recent_changes': recent_changes.tolist()
            }

        except Exception as e:
            print(f"Error checking momentum for {symbol}: {e}")
            return {
                'strength': 'UNKNOWN',
                'volume_ratio': None,
                'direction': 'UNKNOWN'
            }


# CLI for testing
if __name__ == "__main__":
    engine = ExitSignalEngine()

    # Example: HOOD pullback play
    signal = engine.analyze_position(
        symbol="HOOD",
        option_type="put",
        strike=135,
        expiration="2025-10-26",
        entry_price=2.10,
        entry_date="2025-10-21",
        entry_stock_price=135.80,
        play_type="PULLBACK",
        current_option_price=3.15,
        current_stock_price=131.00,
        target_profit_pct=50
    )

    print(f"\n{'='*60}")
    print(f"SIGNAL: {signal.signal} (Confidence: {signal.confidence}%)")
    print(f"{'='*60}")
    print(f"\nAction: {signal.suggested_action}")
    print(f"\nReasoning:")
    for reason in signal.reasoning:
        print(f"  {reason}")
    print(f"\nMomentum: {signal.momentum_strength}")
    if signal.volume_ratio:
        print(f"Volume: {signal.volume_ratio:.1f}x average")
    if signal.trailing_stop_price:
        print(f"Trailing Stop: ${signal.trailing_stop_price:.2f}")
    print()
