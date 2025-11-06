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

    # Risk context
    risk_score: Optional[float] = None
    recovery_score: Optional[float] = None
    probability_of_profit: Optional[float] = None
    unusual_activity_bias: Optional[str] = None

    # Additional context for friendly messages
    profit_pct: Optional[float] = None
    target_profit_pct: Optional[float] = None
    theta: Optional[float] = None
    option_price: Optional[float] = None
    unusual_activity_data: Optional[Dict[str, Any]] = None
    expected_move_pct: Optional[float] = None

    def get_friendly_message(self) -> str:
        """Generate a conversational, text-message style update from a smart friend."""
        parts = []

        # Opening - like you're texting a friend
        if self.signal == "HOLD":
            if self.profit_pct is not None and self.profit_pct < -15:
                parts.append("Hey - tough one, but I think we should hold tight 💪")
            else:
                parts.append("Hey! Let's hold this one 👍")
        elif self.signal == "SELL_ALL":
            if self.profit_pct and self.profit_pct > 0:
                parts.append("Yo! Time to take the money and run 💰")
            else:
                parts.append("Hey, I think we need to exit this one 👋")
        elif self.signal == "SELL_PARTIAL":
            parts.append("Let's lock in some profits here 🎯")
        elif self.signal == "CUT_LOSS":
            parts.append("Alright, time to cut this one loose 😬")

        # Main reasoning - keep it brief and conversational
        if self.profit_pct is not None:
            if self.profit_pct >= 0:
                parts.append(f"\nYou're up {self.profit_pct:.1f}% right now.")
            else:
                parts.append(f"\nCurrently down {abs(self.profit_pct):.1f}%.")

        # Key insight - ONE main point (choose most important)
        key_insight = None

        # Priority 1: Momentum (most actionable)
        if self.momentum_strength == "STRONG":
            key_insight = "Price is moving in our favor with solid volume 📈"
        elif self.momentum_strength == "REVERSING":
            key_insight = "Heads up - trend is reversing against us 🔄"
        elif self.momentum_strength == "WEAKENING":
            key_insight = "Momentum's fading a bit, watching it closely 👀"
        elif self.momentum_strength == "DEAD":
            key_insight = "Not much movement right now, just sitting there 😴"

        # Priority 2: Unusual activity (if very significant)
        if self.unusual_activity_data and not key_insight:
            total_vol = self.unusual_activity_data.get('total_volume')
            vol_ratio = self.unusual_activity_data.get('vol_oi_ratio')
            bias = self.unusual_activity_data.get('bias')

            if vol_ratio and vol_ratio >= 2.0:  # Only mention if really unusual
                key_insight = f"Seeing some big players moving in ({bias} bias) 🐋"

        # Priority 3: Probability (if extreme)
        if self.probability_of_profit is not None and not key_insight:
            prob_pct = self.probability_of_profit * 100
            if prob_pct >= 70:
                key_insight = "Math looks solid on this one 🎲"
            elif prob_pct < 35:
                key_insight = "Honestly, odds aren't great here 🎲"

        # Priority 4: Time decay (only if severe)
        if self.theta is not None and self.option_price is not None and not key_insight:
            theta_abs = abs(self.theta)
            daily_loss = theta_abs * 100 * (self.option_price if self.option_price > 0 else 1)

            if theta_abs >= 0.10:
                key_insight = f"Time decay is brutal - losing ~${daily_loss:.0f}/day ⏰"

        if key_insight:
            parts.append(key_insight)

        # Quick advice - what to do
        if self.signal == "HOLD":
            if self.profit_pct and self.profit_pct < -20:
                parts.append("\nCould bail if you want, but might still have a shot. Your call.")
            elif self.target_profit_pct and self.profit_pct and self.profit_pct < self.target_profit_pct * 0.7:
                parts.append("\nLet's give it some room to work.")
            else:
                parts.append("\nLet's see how it plays out 🎯")
        elif self.signal == "CUT_LOSS":
            parts.append("\nBetter to move on and find a better setup.")
        elif self.signal == "SELL_ALL":
            if self.profit_pct and self.profit_pct > 0:
                parts.append("\nLock it in! 💪")
            else:
                parts.append("\nTime to close this out.")
        elif self.signal == "SELL_PARTIAL":
            parts.append("\nLock some profit, let the rest ride. Best of both worlds 🎯")

        return "\n".join(parts)


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

        # NEW: Directional signals (optional)
        entry_directional_bias: Optional[str] = None,  # Direction at entry
        current_directional_bias: Optional[str] = None,  # Current direction
        current_directional_confidence: Optional[float] = None,  # Current confidence
        fundamental_health_score: Optional[float] = None,  # 0.0-1.0
        earnings_in_days: Optional[int] = None,  # Days to earnings
        entry_greeks: Optional[Dict[str, float]] = None,
        current_greeks: Optional[Dict[str, float]] = None,
        entry_iv: Optional[float] = None,
        current_iv: Optional[float] = None,
        probability_of_profit: Optional[float] = None,
        expected_move_pct: Optional[float] = None,
        sentiment_score: Optional[float] = None,
        unusual_activity: Optional[Dict[str, Any]] = None,
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
            play_type,
            strike,
            expiration,
            entry_iv,
            current_iv
        )

        # Evaluate risk context (Greeks, IV, unusual flow, sentiment)
        risk_context = self._evaluate_risk_context(
            option_type=option_type,
            profit_pct=profit_pct,
            base_stop=stop_loss_pct,
            dte=dte,
            momentum=momentum,
            entry_greeks=entry_greeks,
            current_greeks=current_greeks,
            entry_iv=entry_iv,
            current_iv=current_iv,
            probability_of_profit=probability_of_profit,
            expected_move_pct=expected_move_pct,
            sentiment_score=sentiment_score,
            unusual_activity=unusual_activity
        )

        # Build reasoning seeded with macro risk notes
        reasoning = list(risk_context.get("pre_reasoning", []))

        # NEW DIRECTIONAL SIGNAL CHECKS (apply before other rules)

        # Check 1: Pre-earnings caution (0-3 days before earnings)
        if earnings_in_days is not None and 0 < earnings_in_days <= 3:
            if profit_pct > 15:
                reasoning.append(f"⚠️ Earnings in {earnings_in_days} day{'s' if earnings_in_days != 1 else ''} - IV crush risk")
                reasoning.append(f"Take {profit_pct:.1f}% profit before binary event")
                return ExitSignal(
                    signal="SELL_ALL",
                    confidence=80,
                    reasoning=reasoning,
                    suggested_action=f"Exit before earnings - secure +{profit_pct:.1f}%",
                    momentum_strength=momentum['strength'],
                    volume_ratio=momentum['volume_ratio']
                )
            elif profit_pct > 0:
                reasoning.append(f"⚠️ Earnings in {earnings_in_days} day{'s' if earnings_in_days != 1 else ''} - high uncertainty")
                reasoning.append(f"Consider exiting - current +{profit_pct:.1f}% gain at risk")

        # Check 2: Directional thesis invalidated
        if (entry_directional_bias and current_directional_bias and
            current_directional_confidence and current_directional_confidence >= 60):

            # CALL position but directional bias flipped BEARISH
            if option_type.lower() == "call" and entry_directional_bias.upper() in ["BULLISH", "NEUTRAL"]:
                if current_directional_bias.upper() == "BEARISH":
                    reasoning.append(f"🔴 Directional thesis INVALIDATED - entered {entry_directional_bias.upper()}, now {current_directional_bias.upper()} ({current_directional_confidence:.0f}% confidence)")
                    if profit_pct > 10:
                        reasoning.append(f"Exit with +{profit_pct:.1f}% profit before reversal worsens")
                        return ExitSignal(
                            signal="SELL_ALL",
                            confidence=75,
                            reasoning=reasoning,
                            suggested_action=f"Thesis changed - exit at +{profit_pct:.1f}%",
                            momentum_strength=momentum['strength'],
                            volume_ratio=momentum['volume_ratio']
                        )
                    else:
                        reasoning.append(f"Cut position - thesis no longer supports CALL")
                        return ExitSignal(
                            signal="CUT_LOSS" if profit_pct < -15 else "SELL_ALL",
                            confidence=70,
                            reasoning=reasoning,
                            suggested_action=f"Exit - bias flipped against you",
                            momentum_strength=momentum['strength'],
                            volume_ratio=momentum['volume_ratio']
                        )

            # PUT position but directional bias flipped BULLISH
            elif option_type.lower() == "put" and entry_directional_bias.upper() in ["BEARISH", "NEUTRAL"]:
                if current_directional_bias.upper() == "BULLISH":
                    reasoning.append(f"🟢 Directional thesis INVALIDATED - entered {entry_directional_bias.upper()}, now {current_directional_bias.upper()} ({current_directional_confidence:.0f}% confidence)")
                    if profit_pct > 10:
                        reasoning.append(f"Exit with +{profit_pct:.1f}% profit before reversal worsens")
                        return ExitSignal(
                            signal="SELL_ALL",
                            confidence=75,
                            reasoning=reasoning,
                            suggested_action=f"Thesis changed - exit at +{profit_pct:.1f}%",
                            momentum_strength=momentum['strength'],
                            volume_ratio=momentum['volume_ratio']
                        )
                    else:
                        reasoning.append(f"Cut position - thesis no longer supports PUT")
                        return ExitSignal(
                            signal="CUT_LOSS" if profit_pct < -15 else "SELL_ALL",
                            confidence=70,
                            reasoning=reasoning,
                            suggested_action=f"Exit - bias flipped against you",
                            momentum_strength=momentum['strength'],
                            volume_ratio=momentum['volume_ratio']
                        )

        # Check 3: Fundamental health deterioration
        if fundamental_health_score is not None and fundamental_health_score < 0.3:
            if profit_pct > 5:
                reasoning.append(f"⚠️ Fundamental health deteriorated (score: {fundamental_health_score:.2f}/1.0)")
                reasoning.append(f"Elevated risk - consider exiting with +{profit_pct:.1f}%")
            elif profit_pct < -20:
                reasoning.append(f"🛑 Fundamental health poor (score: {fundamental_health_score:.2f}/1.0) + losing position")
                reasoning.append("Cut losses - company risk too high")
                return ExitSignal(
                    signal="CUT_LOSS",
                    confidence=75,
                    reasoning=reasoning,
                    suggested_action=f"Exit now - fundamental risk + {profit_pct:.1f}% loss",
                    momentum_strength=momentum['strength'],
                    volume_ratio=momentum['volume_ratio']
                )

        # UNIVERSAL RULES (apply to all play types)

        dynamic_stop = risk_context.get("dynamic_stop", stop_loss_pct)

        # Rule 1: Stop loss (dynamic based on Greeks/IV/flow)
        if profit_pct <= dynamic_stop:
            reasoning.append(
                f"🛑 Dynamic stop triggered ({profit_pct:.1f}% vs {dynamic_stop:.0f}% threshold)"
            )
            reasoning.extend(risk_context.get("stop_reasoning", []))
            return self._finalize_signal(
                ExitSignal(
                    signal="CUT_LOSS",
                    confidence=100,
                    reasoning=reasoning,
                    suggested_action=f"Exit now - down {abs(profit_pct):.1f}%",
                    momentum_strength=momentum['strength'],
                    volume_ratio=momentum['volume_ratio'],
                    iv_change_pct=momentum.get('iv_change_pct')
                ),
                momentum,
                risk_context
            )

        # Rule 2: Theta danger (0-1 DTE)
        if dte <= 1:
            reasoning.append(f"⏰ Only {dte} day{'s' if dte != 1 else ''} left - theta burn extreme")
            reasoning.extend(risk_context.get("theta_reasoning", []))
            roll_note = risk_context.get("roll_recommendation")
            if roll_note:
                reasoning.append(roll_note)

            if profit_pct > 0:
                if (
                    risk_context.get("recovery_score", 0) >= 65
                    and momentum['strength'] in {"STRONG", "MODERATE"}
                ):
                    reasoning.append(
                        f"Trim profits (+{profit_pct:.1f}%) and roll to maintain exposure with fresh time"
                    )
                    return self._finalize_signal(
                        ExitSignal(
                            signal="SELL_PARTIAL",
                            confidence=92,
                            reasoning=reasoning,
                            suggested_action="Scale out 50% and roll remainder to later expiry",
                            momentum_strength=momentum['strength'],
                            volume_ratio=momentum['volume_ratio']
                        ),
                        momentum,
                        risk_context
                    )

                reasoning.append(f"Lock in {profit_pct:.1f}% gain before decay")
                return self._finalize_signal(
                    ExitSignal(
                        signal="SELL_ALL",
                        confidence=95,
                        reasoning=reasoning,
                        suggested_action=f"Exit now - secure +{profit_pct:.1f}%",
                        momentum_strength=momentum['strength'],
                        volume_ratio=momentum['volume_ratio']
                    ),
                    momentum,
                    risk_context
                )
            else:
                reasoning.append("Minimize further losses from theta decay")
                return self._finalize_signal(
                    ExitSignal(
                        signal="SELL_ALL",
                        confidence=90,
                        reasoning=reasoning,
                        suggested_action="Exit to stop bleeding",
                        momentum_strength=momentum['strength']
                    ),
                    momentum,
                    risk_context
                )

        # Rule 3: Trailing stop hit (protecting gains)
        if profit_pct > 25 and current_option_price < trailing_stop:
            reasoning.append(f"📉 Trailing stop triggered (peak ${peak_price:.2f} → ${current_option_price:.2f})")
            reasoning.append(f"Locked in {profit_pct:.1f}% gain before bigger reversal")
            return self._finalize_signal(
                ExitSignal(
                    signal="SELL_ALL",
                    confidence=85,
                    reasoning=reasoning,
                    trailing_stop_price=trailing_stop,
                    suggested_action=f"Exit - trailing stop hit (+{profit_pct:.1f}%)",
                    momentum_strength=momentum['strength']
                ),
                momentum,
                risk_context
            )

        # High-conviction hold / scale-in opportunity
        if (
            risk_context.get("double_down")
            and profit_pct > dynamic_stop + 5
            and profit_pct < target_profit_pct
            and dte > 1
        ):
            dd_reasoning = reasoning.copy()
            dd_reasoning.extend(risk_context.get("flow_commentary", []))
            dd_reasoning.append(
                f"Risk/Reward skew: recovery score {risk_context.get('recovery_score', 0):.0f} vs risk {risk_context.get('risk_score', 0):.0f}"
            )
            expected_move = risk_context.get("expected_move_pct")
            if expected_move is not None:
                dd_reasoning.append(
                    f"Market pricing ±{expected_move:.1f}% move → still room toward target"
                )

            return self._finalize_signal(
                ExitSignal(
                    signal="HOLD",
                    confidence=75,
                    reasoning=dd_reasoning,
                    trailing_stop_price=trailing_stop if profit_pct > 15 else None,
                    suggested_action="Conviction hold - consider adding within risk plan",
                    momentum_strength=momentum['strength'],
                    volume_ratio=momentum['volume_ratio']
                ),
                momentum,
                risk_context
            )

        # PLAY-SPECIFIC RULES

        if play_type == "PULLBACK":
            signal = self._analyze_pullback(
                profit_pct, dte, momentum, entry_stock_price,
                current_stock_price, option_type, reasoning,
                target_profit_pct, trailing_stop, peak_price,
                risk_context
            )

        elif play_type == "BREAKOUT":
            signal = self._analyze_breakout(
                profit_pct, dte, momentum, reasoning,
                target_profit_pct, trailing_stop, peak_price,
                risk_context
            )

        elif play_type == "BOUNCE":
            signal = self._analyze_bounce(
                profit_pct, dte, momentum, entry_stock_price,
                current_stock_price, option_type, reasoning,
                target_profit_pct, trailing_stop, peak_price,
                risk_context
            )

        else:
            # Default conservative exit
            signal = self._default_exit_logic(
                profit_pct, dte, momentum, reasoning,
                target_profit_pct, trailing_stop, peak_price,
                risk_context
            )

        return self._finalize_signal(signal, momentum, risk_context)

    def _finalize_signal(
        self,
        signal: ExitSignal,
        momentum: Dict[str, Any],
        risk_context: Dict[str, Any]
    ) -> ExitSignal:
        """Attach contextual analytics to the outgoing signal."""

        if not signal.momentum_strength or signal.momentum_strength == "UNKNOWN":
            signal.momentum_strength = momentum.get("strength", signal.momentum_strength)

        if signal.volume_ratio is None:
            signal.volume_ratio = momentum.get("volume_ratio")

        if signal.iv_change_pct is None:
            signal.iv_change_pct = risk_context.get(
                "iv_change_pct",
                momentum.get("iv_change_pct")
            )

        signal.risk_score = risk_context.get("risk_score")
        signal.recovery_score = risk_context.get("recovery_score")
        signal.probability_of_profit = risk_context.get("probability_of_profit")
        signal.unusual_activity_bias = risk_context.get("flow_bias")

        supplemental = risk_context.get("supplemental_reasoning") or []
        for note in supplemental:
            if note not in signal.reasoning:
                signal.reasoning.append(note)

        if signal.signal == "HOLD":
            for note in risk_context.get("flow_commentary", []) or []:
                if note not in signal.reasoning:
                    signal.reasoning.append(note)

        expected_move = risk_context.get("expected_move_pct")
        if expected_move is not None and signal.signal in {"HOLD", "SELL_PARTIAL"}:
            note = f"Options market pricing ±{expected_move:.1f}% move ahead"
            if note not in signal.reasoning:
                signal.reasoning.append(note)

        return signal

    def _evaluate_risk_context(
        self,
        *,
        option_type: str,
        profit_pct: float,
        base_stop: float,
        dte: int,
        momentum: Dict[str, Any],
        entry_greeks: Optional[Dict[str, float]] = None,
        current_greeks: Optional[Dict[str, float]] = None,
        entry_iv: Optional[float] = None,
        current_iv: Optional[float] = None,
        probability_of_profit: Optional[float] = None,
        expected_move_pct: Optional[float] = None,
        sentiment_score: Optional[float] = None,
        unusual_activity: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Synthesize Greeks, IV and flow into a risk profile."""

        entry_greeks = entry_greeks or {}
        current_greeks = current_greeks or {}
        momentum = momentum or {}

        def _get_greek(name: str) -> Optional[float]:
            value = current_greeks.get(name)
            if value is None:
                value = entry_greeks.get(name)
            return value

        delta = _get_greek("delta")
        gamma = _get_greek("gamma")
        theta = _get_greek("theta")
        vega = _get_greek("vega")

        dynamic_stop = float(base_stop)
        stop_reasoning: List[str] = []
        pre_reasoning: List[str] = []
        theta_reasoning: List[str] = []
        supplemental_reasoning: List[str] = []
        flow_commentary: List[str] = []

        risk_score = 50.0
        recovery_score = 50.0

        probability = None
        if probability_of_profit is not None:
            probability = max(0.0, min(1.0, probability_of_profit))
            recovery_score = probability * 100

        current_iv = current_iv if current_iv is not None else momentum.get("current_iv")
        expected_move = expected_move_pct
        if expected_move is None and current_iv is not None and dte > 0:
            expected_move = (current_iv or 0) * (dte / 365) ** 0.5 * 100

        iv_change_pct = None
        iv_crush_risk = False
        iv_expansion = False
        if current_iv is not None and entry_iv:
            if entry_iv != 0:
                iv_change_pct = ((current_iv - entry_iv) / abs(entry_iv)) * 100
                if iv_change_pct <= -20:
                    iv_crush_risk = True
                elif iv_change_pct >= 20:
                    iv_expansion = True

        strength = momentum.get("strength")
        volume_ratio = momentum.get("volume_ratio") or 1.0

        if strength == "STRONG":
            pre_reasoning.append("Momentum remains strong in your favor")
            recovery_score += 10
        elif strength in {"MODERATE"}:
            recovery_score += 5
        elif strength in {"WEAKENING", "REVERSING"}:
            risk_score += 10
            stop_reasoning.append("Momentum is deteriorating - tighten risk")
        elif strength == "DEAD":
            risk_score += 12
            stop_reasoning.append("Momentum stalled - consider redeploying capital")

        if volume_ratio and volume_ratio >= 1.5:
            pre_reasoning.append(f"Volume {volume_ratio:.1f}x average - conviction flow")
            recovery_score += 6
        elif volume_ratio and volume_ratio < 0.8:
            risk_score += 4
            supplemental_reasoning.append("Volume drying up - move lacks sponsorship")

        if delta is not None:
            abs_delta = abs(delta)
            if abs_delta >= 0.7:
                dynamic_stop = max(dynamic_stop, -40)
                stop_reasoning.append("High delta contract - tighter leash warranted")
                risk_score += 7
            elif abs_delta <= 0.3 and dte > 7:
                dynamic_stop = min(dynamic_stop, -65)
                supplemental_reasoning.append("Low delta lotto - allow wider swings for a rebound")
                recovery_score += 5

        if theta is not None:
            theta_pressure = abs(theta)
            if theta_pressure >= 0.15:
                theta_reasoning.append(f"Theta bleeding {theta:.2f}/day - extreme")
                dynamic_stop = max(dynamic_stop, -40)
                risk_score += 12
            elif theta_pressure >= 0.08:
                theta_reasoning.append(f"Theta heavy at {theta:.2f}/day")
                dynamic_stop = max(dynamic_stop, -45)
                risk_score += 8
            elif theta_pressure >= 0.04:
                theta_reasoning.append(f"Theta noticeable at {theta:.2f}/day")
                risk_score += 4
        else:
            theta_pressure = 0.0

        if gamma is not None:
            gamma_pressure = abs(gamma)
            if gamma_pressure >= 0.05:
                stop_reasoning.append("High gamma - expect fast swings")
                if dte <= 7:
                    dynamic_stop = max(dynamic_stop, -45)
                    risk_score += 6
                else:
                    dynamic_stop = min(dynamic_stop, -60)
                    recovery_score += 4

        if vega is not None and iv_change_pct is not None:
            if iv_crush_risk:
                stop_reasoning.append("IV crushed >20% from entry - premium bleeding")
                dynamic_stop = max(dynamic_stop, -45)
                risk_score += 8
            elif iv_expansion:
                supplemental_reasoning.append(f"IV expanding +{iv_change_pct:.1f}% - tailwind if move continues")
                recovery_score += 5

        if probability is not None:
            if probability < 0.35:
                stop_reasoning.append("Low probability of finishing ITM (<35%)")
                dynamic_stop = max(dynamic_stop, -42)
                risk_score += 8
            elif probability > 0.65 and dte > 3:
                supplemental_reasoning.append("High probability setup (>65%) - can give trade breathing room")
                dynamic_stop = min(dynamic_stop, -60)
                recovery_score += 8

        if sentiment_score is not None:
            sentiment_pct = sentiment_score * 100
            if sentiment_score > 0.2:
                pre_reasoning.append(f"Directional models still bullish ({sentiment_pct:.0f}% confidence)")
                recovery_score += min(8, sentiment_pct / 12)
            elif sentiment_score < -0.2:
                stop_reasoning.append(f"Directional bias bearish ({sentiment_pct:.0f}% confidence)")
                risk_score += min(10, abs(sentiment_pct) / 10)

        flow_bias = None
        if unusual_activity:
            flow_bias = unusual_activity.get("bias")
            total_flow = unusual_activity.get("total_volume")
            dominant_vol = unusual_activity.get("dominant_volume")
            vol_ratio = unusual_activity.get("vol_oi_ratio")

            if total_flow:
                flow_commentary.append(f"Unusual flow {total_flow:,} contracts detected")
            if vol_ratio:
                flow_commentary.append(f"Flow running {vol_ratio:.1f}x vs open interest")
            if dominant_vol:
                flow_commentary.append(f"Largest block: {dominant_vol:,} contracts")

            side = option_type.lower()
            supportive_flow = (
                (side == "call" and flow_bias == "bullish")
                or (side == "put" and flow_bias == "bearish")
            )

            if supportive_flow:
                supplemental_reasoning.append("Smart money flow backing this position")
                recovery_score += 12
                dynamic_stop = min(dynamic_stop, base_stop - 10)
                risk_score = max(0.0, risk_score - 8)
            elif flow_bias:
                stop_reasoning.append(f"Unusual flow leaning {flow_bias} against position")
                risk_score += 10
                dynamic_stop = max(dynamic_stop, -40)

        risk_score = max(0.0, min(100.0, risk_score))
        recovery_score = max(0.0, min(100.0, recovery_score))

        theta_pressure_level = "LOW"
        if theta is not None:
            theta_abs = abs(theta)
            if theta_abs >= 0.15:
                theta_pressure_level = "EXTREME"
            elif theta_abs >= 0.08:
                theta_pressure_level = "HIGH"
            elif theta_abs >= 0.04:
                theta_pressure_level = "MODERATE"

        roll_recommendation = None
        if dte <= 3 and recovery_score >= 60:
            roll_recommendation = "Consider rolling to extend time while conviction remains"

        double_down = False
        supportive_flow = (
            (option_type.lower() == "call" and flow_bias == "bullish")
            or (option_type.lower() == "put" and flow_bias == "bearish")
        )
        if (
            supportive_flow
            and recovery_score >= 65
            and risk_score <= 45
            and momentum.get("strength") in {"STRONG", "MODERATE"}
            and profit_pct > base_stop
        ):
            double_down = True

        return {
            "dynamic_stop": float(dynamic_stop),
            "stop_reasoning": stop_reasoning,
            "theta_reasoning": theta_reasoning,
            "theta_pressure": theta_pressure_level,
            "roll_recommendation": roll_recommendation,
            "pre_reasoning": pre_reasoning,
            "supplemental_reasoning": supplemental_reasoning,
            "flow_commentary": flow_commentary,
            "flow_bias": flow_bias,
            "risk_score": float(risk_score),
            "recovery_score": float(recovery_score),
            "probability_of_profit": probability,
            "iv_change_pct": iv_change_pct,
            "iv_crush_risk": iv_crush_risk,
            "iv_expansion": iv_expansion,
            "expected_move_pct": expected_move,
            "double_down": double_down,
            "current_iv": current_iv,
        }

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
        peak_price: float,
        risk_context: Dict[str, Any]
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
        if (
            pullback_amount < 3
            and momentum['strength'] in ["STRONG", "MODERATE"]
            and risk_context.get("risk_score", 50) <= 65
        ):
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
        if risk_context.get("risk_score", 50) >= 70:
            reasoning.append("Risk score elevated - tighten alerts on reversal")
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
        peak_price: float,
        risk_context: Dict[str, Any]
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
        if (
            40 <= profit_pct < 90
            and momentum['strength'] == "STRONG"
            and risk_context.get("risk_score", 50) <= 60
        ):
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
        if profit_pct < 40 and risk_context.get("risk_score", 50) <= 65:
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
        return self._default_exit_logic(profit_pct, dte, momentum, reasoning, target_profit_pct, trailing_stop, peak_price, risk_context)

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
        peak_price: float,
        risk_context: Dict[str, Any]
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
        if (
            momentum['strength'] == "STRONG"
            and abs(stock_move_pct) < 3
            and risk_context.get("risk_score", 50) <= 65
        ):
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
        if risk_context.get("risk_score", 50) >= 70:
            reasoning.append("Risk score elevated - keep stops tight on bounce fade")
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
        peak_price: float,
        risk_context: Dict[str, Any]
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
        if risk_context.get("risk_score", 50) >= 70:
            reasoning.append("Risk score elevated - favor tight stops or partials")
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
        play_type: str,
        strike: float,
        expiration: str,
        entry_iv: Optional[float],
        current_iv_hint: Optional[float]
    ) -> Dict[str, Any]:
        """Check price, volume and IV momentum."""

        try:
            stock = yf.Ticker(symbol)
            hist = stock.history(period="1mo", interval="1d")

            if hist.empty or len(hist) < 3:
                hist = stock.history(period="5d", interval="1d")

            if len(hist) < 2:
                return {
                    'strength': 'UNKNOWN',
                    'volume_ratio': None,
                    'direction': 'UNKNOWN'
                }

            current_close = hist['Close'].iloc[-1]
            prev_close = hist['Close'].iloc[-2]
            recent_changes = hist['Close'].pct_change().tail(5).dropna() * 100

            # Volume analysis (10-day average)
            if len(hist) > 10:
                avg_volume = hist['Volume'].iloc[:-1].rolling(10).mean().iloc[-1]
            else:
                avg_volume = hist['Volume'].iloc[:-1].mean() if len(hist) > 1 else hist['Volume'].mean()
            current_volume = hist['Volume'].iloc[-1]
            volume_ratio = current_volume / avg_volume if avg_volume and avg_volume > 0 else None

            lookback = 5 if len(hist) >= 6 else len(hist) - 1
            price_trend_pct = 0.0
            if lookback > 0:
                price_trend_pct = ((current_close / hist['Close'].iloc[-lookback-1]) - 1) * 100

            short_ma = hist['Close'].rolling(window=min(5, len(hist))).mean().iloc[-1]
            long_window = 21 if len(hist) >= 21 else len(hist)
            long_ma = hist['Close'].rolling(window=long_window).mean().iloc[-1]
            slope_pct = ((short_ma - long_ma) / long_ma * 100) if long_ma else 0.0

            # ATR-based volatility context
            high_low = hist['High'] - hist['Low']
            high_close = (hist['High'] - hist['Close'].shift()).abs()
            low_close = (hist['Low'] - hist['Close'].shift()).abs()
            tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
            if len(tr) >= 14:
                atr = tr.rolling(14).mean().iloc[-1]
            else:
                atr = tr.mean()
            atr_pct = (atr / current_close) * 100 if atr and current_close else None

            desired_direction = 1
            if play_type == "PULLBACK" and option_type.lower() == "put":
                desired_direction = -1

            directional_metric = desired_direction * price_trend_pct

            if directional_metric > 3 and (volume_ratio or 0) >= 1.3:
                strength = "STRONG"
            elif directional_metric > 1:
                strength = "MODERATE"
            elif directional_metric < -2:
                strength = "REVERSING"
            elif directional_metric < 0:
                strength = "WEAKENING"
            else:
                strength = "DEAD" if abs(price_trend_pct) < 0.5 else "MODERATE"

            # Attempt to capture current IV from option chain when not provided
            current_iv = current_iv_hint
            if current_iv is None and expiration:
                try:
                    chain = stock.option_chain(expiration)
                    chain_df = chain.calls if option_type.lower() == "call" else chain.puts
                    match = chain_df.loc[(chain_df['strike'] - strike).abs() <= 0.01]
                    if not match.empty and 'impliedVolatility' in match:
                        current_iv = float(match['impliedVolatility'].iloc[0])
                except Exception:
                    current_iv = current_iv_hint

            iv_change_pct = None
            if current_iv is not None and entry_iv:
                if entry_iv != 0:
                    iv_change_pct = ((current_iv - entry_iv) / abs(entry_iv)) * 100

            momentum_score = directional_metric * 3
            if volume_ratio is not None:
                momentum_score += (volume_ratio - 1) * 10
            if not recent_changes.empty:
                momentum_score += recent_changes.iloc[-1]

            return {
                'strength': strength,
                'volume_ratio': volume_ratio,
                'direction': 'UP' if current_stock_price > entry_stock_price else 'DOWN',
                'recent_changes': recent_changes.tolist(),
                'price_trend_pct': price_trend_pct,
                'slope_pct': slope_pct,
                'atr_pct': atr_pct,
                'momentum_score': momentum_score,
                'iv_change_pct': iv_change_pct,
                'current_iv': current_iv
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
