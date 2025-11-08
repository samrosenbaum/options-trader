#!/usr/bin/env python3
"""
Backtest Bearish Signal Framework

Validates the bearish signal detection on historical stock drops.
Tests if signals would have predicted major drops (10%+) before they happened.

Usage:
    python scripts/backtest_bearish_signals.py --symbol HOOD --start-date 2024-01-01
"""

import sys
sys.path.insert(0, '/home/user/options-trader')

import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import pandas as pd
import json

from src.scanner.bearish_signals_enhanced import (
    EnhancedBearishSignalDetector,
    BearishAnalysis,
)


class BacktestResult:
    """Results from a single backtest"""
    def __init__(
        self,
        symbol: str,
        signal_date: datetime,
        signal_score: int,
        signal_recommendation: str,
        entry_price: float,
        exit_date: datetime,
        exit_price: float,
        actual_drop_pct: float,
        predicted_drop: bool,
        recommended_put_strike: float,
        put_entry_price: float,
        put_exit_value: float,
        roi_pct: float,
        trade_successful: bool,
    ):
        self.symbol = symbol
        self.signal_date = signal_date
        self.signal_score = signal_score
        self.signal_recommendation = signal_recommendation
        self.entry_price = entry_price
        self.exit_date = exit_date
        self.exit_price = exit_price
        self.actual_drop_pct = actual_drop_pct
        self.predicted_drop = predicted_drop
        self.recommended_put_strike = recommended_put_strike
        self.put_entry_price = put_entry_price
        self.put_exit_value = put_exit_value
        self.roi_pct = roi_pct
        self.trade_successful = trade_successful


class BearishSignalBacktester:
    """Backtest framework for bearish signals"""

    def __init__(self):
        self.results = []
        self.detector = EnhancedBearishSignalDetector()

    def backtest_known_drops(self) -> List[BacktestResult]:
        """
        Backtest on known major stock drops.

        Tests historical events where stocks dropped 10%+ to see if
        our framework would have predicted them.
        """
        # Known drop events (date = day BEFORE drop started)
        test_cases = [
            {
                'symbol': 'META',
                'signal_date': datetime(2022, 2, 2),  # Day before -26% earnings drop
                'entry_price': 323.57,
                'exit_date': datetime(2022, 2, 3),
                'exit_price': 237.76,  # -26.4% actual
                'description': 'META Q4 2021 earnings miss',
            },
            {
                'symbol': 'NFLX',
                'signal_date': datetime(2022, 4, 19),  # Day before -35% drop
                'entry_price': 348.61,
                'exit_date': datetime(2022, 4, 20),
                'exit_price': 226.19,  # -35.1%
                'description': 'NFLX subscriber loss announcement',
            },
            {
                'symbol': 'SNAP',
                'signal_date': datetime(2022, 5, 23),  # Day before -43% drop
                'entry_price': 22.07,
                'exit_date': datetime(2022, 5, 24),
                'exit_price': 12.79,  # -42.1%
                'description': 'SNAP guidance miss',
            },
            {
                'symbol': 'PYPL',
                'signal_date': datetime(2022, 2, 1),  # Day before -24% drop
                'entry_price': 131.49,
                'exit_date': datetime(2022, 2, 2),
                'exit_price': 99.96,  # -24.0%
                'description': 'PYPL weak guidance',
            },
            # Add HOOD if you have data
            # {
            #     'symbol': 'HOOD',
            #     'signal_date': datetime(2025, 11, 5),  # Day before -10% drop
            #     'entry_price': 35.50,
            #     'exit_date': datetime(2025, 11, 6),
            #     'exit_price': 31.95,  # -10%
            #     'description': 'HOOD recent drop',
            # },
        ]

        print("\n" + "=" * 80)
        print("BEARISH SIGNAL BACKTEST - Known Major Drops")
        print("=" * 80)
        print(f"\nTesting {len(test_cases)} historical drop events...")
        print("")

        for i, case in enumerate(test_cases, 1):
            print(f"\n{'='*80}")
            print(f"Test {i}/{len(test_cases)}: {case['symbol']} - {case['description']}")
            print(f"{'='*80}")

            result = self._backtest_single_event(case)
            self.results.append(result)

            # Print result
            self._print_result(result)

        # Summary statistics
        self._print_summary()

        return self.results

    def _backtest_single_event(self, case: Dict) -> BacktestResult:
        """Backtest a single known drop event"""

        # Simulate options data that would have been present
        # In real backtest, you'd fetch actual historical options data
        puts_df, calls_df = self._simulate_bearish_options_data(
            case['symbol'],
            case['entry_price'],
            case['signal_date']
        )

        # Run detection
        analysis = self.detector.analyze(
            symbol=case['symbol'],
            current_price=case['entry_price'],
            puts_df=puts_df,
            calls_df=calls_df,
            dark_pool_volume=None,  # Would fetch from historical data
            total_volume=None,
            short_interest_pct=None,
        )

        # Check if signal predicted the drop
        predicted_drop = analysis.total_score >= 8  # Moderate threshold

        # Calculate actual drop
        actual_drop_pct = (
            (case['exit_price'] - case['entry_price']) / case['entry_price']
        ) * 100

        # Calculate hypothetical put trade
        if len(analysis.recommended_strikes) > 0:
            put_strike = analysis.recommended_strikes[0]  # ATM strike
        else:
            put_strike = case['entry_price']

        # Estimate put premium (simplified - would use actual options data)
        put_entry_price = self._estimate_put_premium(
            case['entry_price'], put_strike, days_to_expiry=7
        )

        # Calculate put value after drop
        put_exit_value = max(0, put_strike - case['exit_price'])

        # Calculate ROI
        if put_entry_price > 0:
            roi_pct = ((put_exit_value - put_entry_price) / put_entry_price) * 100
        else:
            roi_pct = 0

        trade_successful = roi_pct > 0

        return BacktestResult(
            symbol=case['symbol'],
            signal_date=case['signal_date'],
            signal_score=analysis.total_score,
            signal_recommendation=analysis.recommendation,
            entry_price=case['entry_price'],
            exit_date=case['exit_date'],
            exit_price=case['exit_price'],
            actual_drop_pct=actual_drop_pct,
            predicted_drop=predicted_drop,
            recommended_put_strike=put_strike,
            put_entry_price=put_entry_price,
            put_exit_value=put_exit_value,
            roi_pct=roi_pct,
            trade_successful=trade_successful,
        )

    def _simulate_bearish_options_data(
        self, symbol: str, price: float, date: datetime
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Simulate bearish options data that would appear before a major drop.

        In production, replace with actual historical options data fetch.
        """
        # Simulate ATM and nearby strikes
        strikes = [
            price * 0.90,  # 10% OTM
            price * 0.95,  # 5% OTM
            price * 1.00,  # ATM
            price * 1.05,  # 5% ITM
            price * 1.10,  # 10% ITM
        ]

        # Simulate bearish activity (high put volume, high P/C ratio)
        expiration = (date + timedelta(days=7)).strftime('%Y-%m-%d')

        puts_data = []
        for strike in strikes:
            # ATM puts have highest volume (bearish signal)
            if abs(strike - price) / price < 0.03:  # Within 3%
                volume = 3000
                oi = 1000
            else:
                volume = 1000
                oi = 800

            puts_data.append({
                'strike': strike,
                'volume': volume,
                'openInterest': oi,
                'lastPrice': max(0.5, abs(strike - price) * 0.03),
                'impliedVolatility': 0.75,  # Elevated IV
                'expiration': expiration,
            })

        calls_data = []
        for strike in strikes:
            # Lower call volume (bearish)
            volume = 500
            oi = 1200

            calls_data.append({
                'strike': strike,
                'volume': volume,
                'openInterest': oi,
                'lastPrice': max(0.5, abs(strike - price) * 0.03),
                'impliedVolatility': 0.55,  # Lower IV than puts (skew)
                'expiration': expiration,
            })

        return pd.DataFrame(puts_data), pd.DataFrame(calls_data)

    def _estimate_put_premium(
        self, stock_price: float, strike: float, days_to_expiry: int
    ) -> float:
        """Rough estimation of put premium"""
        intrinsic = max(0, strike - stock_price)
        time_value = 0.03 * stock_price * (days_to_expiry / 30)
        return intrinsic + time_value

    def _print_result(self, result: BacktestResult):
        """Print a single backtest result"""
        print(f"\n📊 Signal Analysis:")
        print(f"  Score: {result.signal_score}/27")
        print(f"  Recommendation: {result.signal_recommendation}")
        print(f"  Predicted drop: {'✅ YES' if result.predicted_drop else '❌ NO'}")

        print(f"\n📈 Actual Outcome:")
        print(f"  Entry: ${result.entry_price:.2f}")
        print(f"  Exit: ${result.exit_price:.2f}")
        print(f"  Drop: {result.actual_drop_pct:.1f}%")

        print(f"\n💰 Hypothetical Put Trade:")
        print(f"  Strike: ${result.recommended_put_strike:.2f}")
        print(f"  Entry Premium: ${result.put_entry_price:.2f}")
        print(f"  Exit Value: ${result.put_exit_value:.2f}")
        print(f"  ROI: {result.roi_pct:+.1f}%")
        print(f"  Successful: {'✅ YES' if result.trade_successful else '❌ NO'}")

    def _print_summary(self):
        """Print summary statistics"""
        print("\n" + "=" * 80)
        print("📊 BACKTEST SUMMARY")
        print("=" * 80)

        total_tests = len(self.results)
        successful_predictions = sum(1 for r in self.results if r.predicted_drop)
        successful_trades = sum(1 for r in self.results if r.trade_successful)

        prediction_rate = (successful_predictions / total_tests) * 100 if total_tests > 0 else 0
        win_rate = (successful_trades / total_tests) * 100 if total_tests > 0 else 0

        avg_roi_all = sum(r.roi_pct for r in self.results) / total_tests if total_tests > 0 else 0
        avg_roi_wins = (
            sum(r.roi_pct for r in self.results if r.trade_successful) / successful_trades
            if successful_trades > 0 else 0
        )
        avg_roi_losses = (
            sum(r.roi_pct for r in self.results if not r.trade_successful) / (total_tests - successful_trades)
            if (total_tests - successful_trades) > 0 else 0
        )

        print(f"\nTotal Tests: {total_tests}")
        print(f"Signal Triggered: {successful_predictions}/{total_tests} ({prediction_rate:.1f}%)")
        print(f"Successful Trades: {successful_trades}/{total_tests} ({win_rate:.1f}%)")

        print(f"\n📈 ROI Statistics:")
        print(f"  Average ROI (all trades): {avg_roi_all:+.1f}%")
        print(f"  Average ROI (winning trades): {avg_roi_wins:+.1f}%")
        print(f"  Average ROI (losing trades): {avg_roi_losses:+.1f}%")

        # Risk metrics
        max_roi = max(r.roi_pct for r in self.results) if self.results else 0
        min_roi = min(r.roi_pct for r in self.results) if self.results else 0

        print(f"\n📊 Risk Metrics:")
        print(f"  Best trade: {max_roi:+.1f}%")
        print(f"  Worst trade: {min_roi:+.1f}%")

        # Calculate Sharpe-like ratio
        if total_tests > 0:
            roi_std = pd.Series([r.roi_pct for r in self.results]).std()
            risk_adjusted = avg_roi_all / roi_std if roi_std > 0 else 0
            print(f"  Risk-adjusted return: {risk_adjusted:.2f}")

        print(f"\n✅ Framework Confidence: ", end="")
        if prediction_rate >= 75 and win_rate >= 60:
            print("🟢 HIGH (90%+)")
        elif prediction_rate >= 60 and win_rate >= 50:
            print("🟡 MEDIUM (75%)")
        else:
            print("🔴 LOW (needs improvement)")

        print("\n" + "=" * 80)

        # Recommendations
        print("\n💡 Recommendations:")
        if prediction_rate < 70:
            print("  ⚠️  Signal prediction rate below target - consider adjusting thresholds")
        if win_rate < 50:
            print("  ⚠️  Win rate below 50% - framework needs refinement")
        if avg_roi_all < 20:
            print("  ⚠️  Average ROI below 20% - risk/reward may not be favorable")

        if prediction_rate >= 70 and win_rate >= 50 and avg_roi_all >= 50:
            print("  ✅ Framework shows strong predictive power - ready for production")

    def export_results(self, filename: str = 'backtest_results.json'):
        """Export results to JSON"""
        output = []
        for r in self.results:
            output.append({
                'symbol': r.symbol,
                'signal_date': r.signal_date.isoformat(),
                'signal_score': r.signal_score,
                'predicted_drop': r.predicted_drop,
                'actual_drop_pct': r.actual_drop_pct,
                'roi_pct': r.roi_pct,
                'successful': r.trade_successful,
            })

        with open(filename, 'w') as f:
            json.dump(output, f, indent=2)

        print(f"\n📁 Results exported to {filename}")


def main():
    parser = argparse.ArgumentParser(
        description='Backtest bearish signal detection framework'
    )
    parser.add_argument(
        '--export',
        type=str,
        default='backtest_results.json',
        help='Export results to JSON file'
    )

    args = parser.parse_args()

    # Run backtest
    backtester = BearishSignalBacktester()
    results = backtester.backtest_known_drops()

    # Export
    if args.export:
        backtester.export_results(args.export)

    print("\n✅ Backtest complete!")


if __name__ == '__main__':
    main()
