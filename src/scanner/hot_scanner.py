"""
Hot Scanner - Find Obvious Momentum Plays

Focus: Big movers with volume confirmation and clear catalysts.
Strategy:
  - Pullbacks: Stock ripped up → buy puts for profit-taking pullback
  - Breakouts: Stock breaking out → ride momentum with calls
  - Bounces: Stock sold off hard → catch bounce with calls

Examples:
  - HOOD +$10 in one day → buy puts for pullback
  - NVDA breaking ATH on earnings → ride momentum
  - TSLA down 15% on bad news → buy calls for oversold bounce
"""

import yfinance as yf
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import pandas as pd


class HotScanner:
    """Scanner for high-volatility, catalyst-driven momentum plays."""

    def __init__(self):
        self.min_volume = 50  # Very relaxed - catch liquid plays
        self.min_oi = 50  # Very relaxed
        self.max_spread_pct = 0.60  # 60% spread OK for hot plays

    def scan_for_momentum_plays(
        self,
        symbols: List[str],
        max_opportunities: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Find obvious momentum plays:
        1. Big daily movers (>5%)
        2. Volume confirmation
        3. Clear setup (pullback, breakout, bounce)
        """
        opportunities = []

        for symbol in symbols:
            try:
                # Get stock data
                stock = yf.Ticker(symbol)
                hist = stock.history(period="5d")

                if len(hist) < 2:
                    continue

                # Calculate daily move
                current_price = hist['Close'].iloc[-1]
                prev_close = hist['Close'].iloc[-2]
                daily_change_pct = ((current_price - prev_close) / prev_close) * 100

                # Skip small movers (we want moves with momentum)
                if abs(daily_change_pct) < 3:  # 3% threshold to catch more plays
                    continue

                # Check volume confirmation
                avg_volume = hist['Volume'].mean()
                today_volume = hist['Volume'].iloc[-1]
                volume_ratio = today_volume / avg_volume if avg_volume > 0 else 0

                # Need at least 1.5x average volume for confirmation (relaxed)
                if volume_ratio < 1.5:
                    continue

                # Determine play type
                play_type, direction = self._determine_play_type(
                    daily_change_pct,
                    current_price,
                    hist
                )

                if not play_type:
                    continue

                # Scan options for this setup
                plays = self._scan_options_for_setup(
                    stock,
                    symbol,
                    current_price,
                    daily_change_pct,
                    play_type,
                    direction,
                    volume_ratio
                )

                opportunities.extend(plays)

            except Exception as e:
                print(f"Error scanning {symbol}: {e}")
                continue

        # Sort by hot score (highest first)
        opportunities.sort(key=lambda x: x.get('hotScore', 0), reverse=True)

        return opportunities[:max_opportunities]

    def _determine_play_type(
        self,
        daily_change_pct: float,
        current_price: float,
        hist: pd.DataFrame
    ) -> tuple[Optional[str], Optional[str]]:
        """
        Determine what kind of play this is:
        - PULLBACK: Stock ripped up fast → expect pullback
        - BREAKOUT: Stock breaking out → ride momentum
        - BOUNCE: Stock sold off hard → oversold bounce
        """

        # Pullback play: Stock up 3%+ → buy puts for pullback
        if daily_change_pct > 3:
            # Check if this is a parabolic move (multiple up days)
            recent_changes = hist['Close'].pct_change().tail(3) * 100
            up_days = (recent_changes > 1.5).sum()  # Lowered from 2% to 1.5%

            if up_days >= 2:
                return "PULLBACK", "put"  # Overbought, profit-taking likely
            else:
                return "BREAKOUT", "call"  # Fresh breakout, ride it

        # Bounce play: Stock down 3%+ → buy calls for oversold bounce
        elif daily_change_pct < -3:
            return "BOUNCE", "call"  # Oversold, bounce likely

        return None, None

    def _scan_options_for_setup(
        self,
        stock: yf.Ticker,
        symbol: str,
        current_price: float,
        daily_change_pct: float,
        play_type: str,
        direction: str,
        volume_ratio: float
    ) -> List[Dict[str, Any]]:
        """Scan options chain for best entries for this setup."""

        opportunities = []

        try:
            # Get options expirations
            expirations = stock.options
            if not expirations:
                return []

            # Focus on short-term (0-14 days) for quick wins
            today = datetime.now()
            short_term_exps = []

            for exp_str in expirations[:5]:  # Check first 5 expirations
                exp_date = datetime.strptime(exp_str, "%Y-%m-%d")
                days_to_exp = (exp_date - today).days

                if 0 <= days_to_exp <= 14:  # 0-14 DTE sweet spot
                    short_term_exps.append((exp_str, days_to_exp))

            for exp_str, dte in short_term_exps:
                chain = stock.option_chain(exp_str)

                # Select calls or puts based on direction
                if direction == "call":
                    options = chain.calls
                else:
                    options = chain.puts

                # Filter by liquidity (much more relaxed than conservative)
                liquid_options = options[
                    (options['volume'] >= self.min_volume) &
                    (options['openInterest'] >= self.min_oi)
                ]

                if liquid_options.empty:
                    continue

                # Find ATM/Near-ATM strikes (best delta for quick moves)
                liquid_options['strike_diff'] = abs(liquid_options['strike'] - current_price)
                liquid_options = liquid_options.nsmallest(3, 'strike_diff')

                for _, option in liquid_options.iterrows():
                    # Calculate spread
                    spread_pct = (option['ask'] - option['bid']) / max(option['lastPrice'], 0.01)

                    if spread_pct > self.max_spread_pct:
                        continue

                    # Calculate hot score (simple and effective)
                    hot_score = self._calculate_hot_score(
                        abs(daily_change_pct),
                        volume_ratio,
                        dte,
                        spread_pct
                    )

                    # Build opportunity
                    opp = {
                        'symbol': symbol,
                        'optionType': direction,
                        'strike': float(option['strike']),
                        'expiration': exp_str,
                        'premium': float(option['lastPrice']) * 100,  # Total contract cost
                        'bid': float(option['bid']),
                        'ask': float(option['ask']),
                        'volume': int(option['volume']),
                        'openInterest': int(option['openInterest']),
                        'impliedVolatility': float(option.get('impliedVolatility', 0)),
                        'stockPrice': current_price,
                        'daysToExpiration': dte,
                        'hotScore': hot_score,
                        'playType': play_type,
                        'dailyMove': daily_change_pct,
                        'volumeRatio': volume_ratio,
                        'tradeSummary': self._generate_trade_summary(
                            symbol,
                            play_type,
                            direction,
                            daily_change_pct,
                            dte
                        ),
                        'reasoning': self._generate_reasoning(
                            play_type,
                            daily_change_pct,
                            volume_ratio,
                            dte
                        ),
                        'greeks': {
                            'delta': float(option.get('delta', 0)),
                            'gamma': float(option.get('gamma', 0)),
                            'theta': float(option.get('theta', 0)),
                            'vega': float(option.get('vega', 0)),
                        }
                    }

                    opportunities.append(opp)

        except Exception as e:
            print(f"Error scanning options for {symbol}: {e}")

        return opportunities

    def _calculate_hot_score(
        self,
        abs_daily_move: float,
        volume_ratio: float,
        dte: int,
        spread_pct: float
    ) -> float:
        """
        Simple hot score:
        - Bigger move = higher score
        - More volume = higher score
        - Shorter DTE = higher score (quick wins)
        - Tighter spread = higher score
        """

        # Move score (0-40 points): bigger moves = better
        move_score = min(abs_daily_move * 4, 40)

        # Volume score (0-30 points): unusual volume = confirmation
        volume_score = min(volume_ratio * 6, 30)

        # DTE score (0-20 points): prefer 3-7 DTE for quick wins
        if 3 <= dte <= 7:
            dte_score = 20
        elif 1 <= dte <= 2 or 8 <= dte <= 10:
            dte_score = 15
        else:
            dte_score = 10

        # Spread score (0-10 points): tighter is better
        spread_score = max(10 - (spread_pct * 20), 0)

        return move_score + volume_score + dte_score + spread_score

    def _generate_trade_summary(
        self,
        symbol: str,
        play_type: str,
        direction: str,
        daily_change_pct: float,
        dte: int
    ) -> str:
        """Generate human-readable trade summary."""

        if play_type == "PULLBACK":
            return f"{symbol} ripped {daily_change_pct:+.1f}% - buy {direction}s for pullback (quick {dte}d play)"
        elif play_type == "BREAKOUT":
            return f"{symbol} breaking out {daily_change_pct:+.1f}% - ride momentum with {direction}s ({dte}d)"
        else:  # BOUNCE
            return f"{symbol} sold off {daily_change_pct:.1f}% - catch bounce with {direction}s ({dte}d)"

    def _generate_reasoning(
        self,
        play_type: str,
        daily_change_pct: float,
        volume_ratio: float,
        dte: int
    ) -> List[str]:
        """Generate reasoning for the trade."""

        reasons = []

        if play_type == "PULLBACK":
            reasons.append(f"Stock extended {abs(daily_change_pct):.1f}% - overbought, pullback likely")
            reasons.append("Profit-takers will step in after big run")
        elif play_type == "BREAKOUT":
            reasons.append(f"Fresh breakout with {abs(daily_change_pct):.1f}% move")
            reasons.append("Momentum likely to continue short-term")
        else:  # BOUNCE
            reasons.append(f"Oversold after {abs(daily_change_pct):.1f}% drop")
            reasons.append("Bounce play from support")

        reasons.append(f"Volume {volume_ratio:.1f}x normal - strong confirmation")
        reasons.append(f"{dte} days to capture move - quick in/out")

        return reasons


def run_hot_scan(symbols: Optional[List[str]] = None, max_results: int = 20) -> Dict[str, Any]:
    """
    Run hot scanner and return momentum plays.

    Args:
        symbols: List of symbols to scan (default: top movers)
        max_results: Max opportunities to return

    Returns:
        Dict with opportunities and metadata
    """

    # Default to scanning popular high-volume tickers
    if not symbols:
        symbols = [
            # Mega caps (always liquid)
            "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META",
            # Tech (high volatility)
            "AMD", "NFLX", "CRM", "ADBE", "INTC", "PYPL", "SQ", "COIN", "UBER", "LYFT",
            # Finance (momentum)
            "JPM", "BAC", "GS", "MS", "C", "WFC", "HOOD", "SOFI",
            # Growth (big swings)
            "PLTR", "RIVN", "LCID", "SNOW", "DKNG", "RBLX", "ARKK", "MARA", "RIOT",
            # Meme/Momentum stocks
            "GME", "AMC", "BB", "WISH", "PLUG", "NIO",
            # Semiconductors (trending)
            "TSM", "ASML", "MU", "QCOM", "AVGO",
            # Energy (volatile)
            "XOM", "CVX", "OXY", "SLB",
            # Retail/Consumer
            "WMT", "TGT", "COST", "DIS", "SBUX",
        ]

    scanner = HotScanner()
    opportunities = scanner.scan_for_momentum_plays(symbols, max_results)

    return {
        "opportunities": opportunities,
        "metadata": {
            "scanType": "HOT_MOMENTUM",
            "symbolsScanned": len(symbols),
            "opportunitiesFound": len(opportunities),
            "timestamp": datetime.now().isoformat(),
            "criteria": {
                "minDailyMove": 5.0,
                "minVolumeRatio": 2.0,
                "maxDTE": 14,
                "focus": "Quick wins on big movers with volume confirmation"
            }
        }
    }


if __name__ == "__main__":
    # Test the scanner
    print("Running Hot Scanner...")
    result = run_hot_scan(max_results=10)

    print(f"\nFound {len(result['opportunities'])} hot plays:\n")

    for opp in result['opportunities']:
        print(f"🔥 {opp['symbol']} {opp['optionType'].upper()} ${opp['strike']}")
        print(f"   {opp['tradeSummary']}")
        print(f"   Hot Score: {opp['hotScore']:.0f}/100")
        print(f"   Premium: ${opp['premium']:.2f}")
        print()
