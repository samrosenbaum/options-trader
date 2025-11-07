"""
Bearish Signal Detection Module

Detects unusual options activity that predicts significant stock drops.
Scores bearish signals from 0-15 to recommend put positions.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import pandas as pd


@dataclass
class BearishSignal:
    """Represents a single bearish signal"""
    signal_type: str
    severity: str  # 'HIGH', 'MEDIUM', 'LOW'
    points: int
    strike: Optional[float] = None
    expiration: Optional[str] = None
    value: Optional[float] = None
    description: str = ""


@dataclass
class BearishAnalysis:
    """Complete bearish analysis for a symbol"""
    symbol: str
    current_price: float
    total_score: int
    recommendation: str
    signals: List[BearishSignal]
    put_call_ratio: float
    recommended_strikes: List[float]
    expected_roi: str
    timestamp: datetime


class BearishSignalDetector:
    """Detects bearish signals from options data"""

    # Signal thresholds
    PC_RATIO_STRONG = 1.5
    PC_RATIO_MODERATE = 1.0
    VOL_OI_STRONG = 3.0
    VOL_OI_MODERATE = 2.0
    LARGE_FLOW_STRONG = 50000
    LARGE_FLOW_MODERATE = 10000
    IV_SKEW_THRESHOLD = 20

    def __init__(self):
        self.signals = []

    def analyze(
        self,
        symbol: str,
        current_price: float,
        puts_df: pd.DataFrame,
        calls_df: pd.DataFrame,
    ) -> BearishAnalysis:
        """
        Analyze options data for bearish signals.

        Args:
            symbol: Stock ticker
            current_price: Current stock price
            puts_df: DataFrame with put options (columns: strike, volume, openInterest, lastPrice, impliedVolatility, expiration)
            calls_df: DataFrame with call options (same columns)

        Returns:
            BearishAnalysis with complete scoring and recommendations
        """
        self.signals = []

        # 1. Calculate Put/Call Ratio
        pc_ratio = self._analyze_put_call_ratio(puts_df, calls_df)

        # 2. Detect unusual put volume
        self._detect_unusual_put_volume(puts_df, current_price)

        # 3. Identify large premium flows
        self._identify_large_flows(puts_df)

        # 4. Check IV skew
        self._check_iv_skew(puts_df, calls_df, current_price)

        # 5. Check time concentration
        self._check_time_concentration(puts_df)

        # Calculate total score
        total_score = sum(signal.points for signal in self.signals)

        # Generate recommendation
        recommendation = self._generate_recommendation(total_score)

        # Identify best strike prices
        recommended_strikes = self._recommend_strikes(puts_df, current_price)

        # Estimate ROI
        expected_roi = self._estimate_roi(total_score)

        return BearishAnalysis(
            symbol=symbol,
            current_price=current_price,
            total_score=total_score,
            recommendation=recommendation,
            signals=self.signals,
            put_call_ratio=pc_ratio,
            recommended_strikes=recommended_strikes,
            expected_roi=expected_roi,
            timestamp=datetime.now(),
        )

    def _analyze_put_call_ratio(
        self, puts_df: pd.DataFrame, calls_df: pd.DataFrame
    ) -> float:
        """Calculate and score put/call ratio"""
        total_put_volume = puts_df["volume"].sum()
        total_call_volume = calls_df["volume"].sum()

        if total_call_volume == 0:
            pc_ratio = 0
        else:
            pc_ratio = total_put_volume / total_call_volume

        if pc_ratio >= self.PC_RATIO_STRONG:
            self.signals.append(
                BearishSignal(
                    signal_type="PUT_CALL_RATIO",
                    severity="HIGH",
                    points=3,
                    value=pc_ratio,
                    description=f"P/C ratio {pc_ratio:.2f} indicates strong bearish sentiment",
                )
            )
        elif pc_ratio >= self.PC_RATIO_MODERATE:
            self.signals.append(
                BearishSignal(
                    signal_type="PUT_CALL_RATIO",
                    severity="MEDIUM",
                    points=2,
                    value=pc_ratio,
                    description=f"P/C ratio {pc_ratio:.2f} shows elevated put activity",
                )
            )

        return pc_ratio

    def _detect_unusual_put_volume(
        self, puts_df: pd.DataFrame, current_price: float
    ):
        """Detect unusual put volume relative to open interest"""
        if len(puts_df) == 0:
            return

        # Calculate vol/OI ratio
        puts_df = puts_df.copy()
        puts_df["vol_oi_ratio"] = puts_df["volume"] / (puts_df["openInterest"] + 1)

        # Focus on ATM puts (within 5% of current price)
        puts_df["pct_from_price"] = (
            abs(puts_df["strike"] - current_price) / current_price * 100
        )
        atm_puts = puts_df[puts_df["pct_from_price"] <= 5]

        # Find unusual volume
        unusual_puts = atm_puts[atm_puts["vol_oi_ratio"] >= self.VOL_OI_MODERATE]

        for _, put in unusual_puts.iterrows():
            if put["vol_oi_ratio"] >= self.VOL_OI_STRONG:
                severity = "HIGH"
                points = 3
            else:
                severity = "MEDIUM"
                points = 2

            self.signals.append(
                BearishSignal(
                    signal_type="UNUSUAL_PUT_VOLUME",
                    severity=severity,
                    points=points,
                    strike=put["strike"],
                    expiration=put.get("expiration"),
                    value=put["vol_oi_ratio"],
                    description=f"${put['strike']:.2f} put Vol/OI: {put['vol_oi_ratio']:.2f}x",
                )
            )

    def _identify_large_flows(self, puts_df: pd.DataFrame):
        """Identify large premium flows indicating smart money"""
        if len(puts_df) == 0:
            return

        puts_df = puts_df.copy()
        puts_df["premium_flow"] = puts_df["volume"] * puts_df["lastPrice"] * 100

        # Find large flows
        large_flows = puts_df[puts_df["premium_flow"] >= self.LARGE_FLOW_MODERATE]

        for _, put in large_flows.iterrows():
            if put["premium_flow"] >= self.LARGE_FLOW_STRONG:
                severity = "HIGH"
                points = 3
            else:
                severity = "MEDIUM"
                points = 2

            self.signals.append(
                BearishSignal(
                    signal_type="LARGE_PUT_FLOW",
                    severity=severity,
                    points=points,
                    strike=put["strike"],
                    expiration=put.get("expiration"),
                    value=put["premium_flow"],
                    description=f"${put['strike']:.2f} put flow: ${put['premium_flow']:,.0f}",
                )
            )

    def _check_iv_skew(
        self, puts_df: pd.DataFrame, calls_df: pd.DataFrame, current_price: float
    ):
        """Check for IV skew (puts more expensive than calls)"""
        if len(puts_df) == 0 or len(calls_df) == 0:
            return

        # Get ATM options
        puts_df = puts_df.copy()
        calls_df = calls_df.copy()

        puts_df["distance"] = abs(puts_df["strike"] - current_price)
        calls_df["distance"] = abs(calls_df["strike"] - current_price)

        # Find closest to ATM
        atm_put = puts_df.loc[puts_df["distance"].idxmin()]
        atm_call = calls_df.loc[calls_df["distance"].idxmin()]

        put_iv = atm_put["impliedVolatility"]
        call_iv = atm_call["impliedVolatility"]

        iv_skew = (put_iv - call_iv) * 100  # Convert to percentage points

        if iv_skew >= self.IV_SKEW_THRESHOLD:
            self.signals.append(
                BearishSignal(
                    signal_type="IV_SKEW",
                    severity="MEDIUM",
                    points=2,
                    value=iv_skew,
                    description=f"Put IV {put_iv:.1%} vs Call IV {call_iv:.1%} = {iv_skew:.0f}pp skew",
                )
            )

    def _check_time_concentration(self, puts_df: pd.DataFrame):
        """Check if put volume is concentrated in near-term expirations"""
        if len(puts_df) == 0 or "expiration" not in puts_df.columns:
            return

        # Group by expiration
        exp_volume = puts_df.groupby("expiration")["volume"].sum().sort_index()

        if len(exp_volume) < 2:
            return

        # Check if first expiration has >70% of total volume
        first_exp_volume = exp_volume.iloc[0]
        total_volume = exp_volume.sum()
        concentration = first_exp_volume / total_volume

        if concentration >= 0.70:
            self.signals.append(
                BearishSignal(
                    signal_type="TIME_CONCENTRATION",
                    severity="MEDIUM",
                    points=2,
                    expiration=exp_volume.index[0],
                    value=concentration,
                    description=f"{concentration:.0%} of volume in nearest expiration (urgency signal)",
                )
            )

    def _generate_recommendation(self, total_score: int) -> str:
        """Generate recommendation based on total score"""
        if total_score >= 12:
            return "🔴 STRONG BEARISH - RECOMMEND PUTS (2-3% portfolio)"
        elif total_score >= 8:
            return "🚨 MODERATE BEARISH - CONSIDER PUTS (1-2% portfolio)"
        elif total_score >= 5:
            return "⚠️  WEAK BEARISH - MONITOR CLOSELY"
        else:
            return "✅ NEUTRAL - NO ACTION"

    def _recommend_strikes(
        self, puts_df: pd.DataFrame, current_price: float
    ) -> List[float]:
        """Recommend optimal put strike prices"""
        if len(puts_df) == 0:
            return []

        # ATM strike
        puts_df = puts_df.copy()
        puts_df["distance"] = abs(puts_df["strike"] - current_price)
        atm_strike = puts_df.loc[puts_df["distance"].idxmin()]["strike"]

        # Slightly OTM (3-7% below current price)
        otm_target = current_price * 0.95
        puts_df["otm_distance"] = abs(puts_df["strike"] - otm_target)
        otm_strike = puts_df.loc[puts_df["otm_distance"].idxmin()]["strike"]

        return [atm_strike, otm_strike]

    def _estimate_roi(self, total_score: int) -> str:
        """Estimate expected ROI based on signal strength"""
        if total_score >= 12:
            return "120-180% (if 10% drop occurs)"
        elif total_score >= 8:
            return "80-120% (if 10% drop occurs)"
        elif total_score >= 5:
            return "50-80% (if 10% drop occurs)"
        else:
            return "N/A"


def format_bearish_analysis(analysis: BearishAnalysis) -> str:
    """Format bearish analysis for display"""
    output = []

    output.append("=" * 80)
    output.append(f"BEARISH SIGNAL ANALYSIS - {analysis.symbol}")
    output.append("=" * 80)
    output.append("")

    output.append(f"Current Price: ${analysis.current_price:.2f}")
    output.append(f"Put/Call Ratio: {analysis.put_call_ratio:.2f}")
    output.append(f"Bearish Score: {analysis.total_score}/15")
    output.append(f"Timestamp: {analysis.timestamp.strftime('%Y-%m-%d %H:%M:%S')}")
    output.append("")

    output.append("🚨 DETECTED SIGNALS:")
    output.append("-" * 80)

    if not analysis.signals:
        output.append("No significant bearish signals detected.")
    else:
        # Group by severity
        high_signals = [s for s in analysis.signals if s.severity == "HIGH"]
        medium_signals = [s for s in analysis.signals if s.severity == "MEDIUM"]
        low_signals = [s for s in analysis.signals if s.severity == "LOW"]

        if high_signals:
            output.append("\n🔴 HIGH SEVERITY:")
            for signal in high_signals:
                output.append(f"  [{signal.points} pts] {signal.description}")

        if medium_signals:
            output.append("\n🟡 MEDIUM SEVERITY:")
            for signal in medium_signals:
                output.append(f"  [{signal.points} pts] {signal.description}")

        if low_signals:
            output.append("\n🟢 LOW SEVERITY:")
            for signal in low_signals:
                output.append(f"  [{signal.points} pts] {signal.description}")

    output.append("")
    output.append("=" * 80)
    output.append("📊 RECOMMENDATION")
    output.append("=" * 80)
    output.append(analysis.recommendation)

    if analysis.total_score >= 8:
        output.append("")
        output.append("💰 SUGGESTED PUT STRIKES:")
        for strike in analysis.recommended_strikes:
            output.append(f"  - ${strike:.2f}")

        output.append("")
        output.append(f"📈 Expected ROI: {analysis.expected_roi}")
        output.append("")
        output.append("⚠️  Risk Management:")
        output.append("  - Position size: 1-3% of portfolio")
        output.append("  - Stop loss: If stock rallies 5% from entry")
        output.append("  - Time frame: 1-2 weeks for move to materialize")

    output.append("=" * 80)

    return "\n".join(output)


# Example usage function
def analyze_symbol_for_bearish_signals(
    symbol: str,
    current_price: float,
    puts_data: List[Dict],
    calls_data: List[Dict],
) -> BearishAnalysis:
    """
    Convenience function to analyze a symbol for bearish signals.

    Args:
        symbol: Stock ticker
        current_price: Current stock price
        puts_data: List of put option dictionaries
        calls_data: List of call option dictionaries

    Returns:
        BearishAnalysis object
    """
    puts_df = pd.DataFrame(puts_data)
    calls_df = pd.DataFrame(calls_data)

    detector = BearishSignalDetector()
    analysis = detector.analyze(symbol, current_price, puts_df, calls_df)

    return analysis
