"""
Fundamentals Scanner Runner

Scans a universe of stocks for fundamental buy opportunities and stores results in Supabase.
"""

import os
import sys
from datetime import datetime, timedelta
from typing import List, Dict, Any
import yfinance as yf
from supabase import create_client, Client

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from signals.fundamentals_scanner import FundamentalsScanner

# Supabase configuration
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

# Default stock universe - mix of large cap, mid cap, and growth stocks
DEFAULT_UNIVERSE = [
    # Mega caps
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'BRK.B',
    # Large caps tech
    'NFLX', 'AMD', 'CRM', 'ORCL', 'ADBE', 'INTC', 'CSCO', 'QCOM',
    # Large caps finance
    'JPM', 'BAC', 'WFC', 'GS', 'MS', 'V', 'MA', 'AXP',
    # Large caps healthcare
    'JNJ', 'UNH', 'PFE', 'ABBV', 'TMO', 'MRK', 'LLY', 'ABT',
    # Large caps consumer
    'WMT', 'PG', 'KO', 'PEP', 'COST', 'NKE', 'MCD', 'SBUX',
    # Large caps industrial
    'BA', 'CAT', 'GE', 'MMM', 'HON', 'UPS', 'LMT', 'RTX',
    # Growth/Mid caps
    'SQ', 'SHOP', 'ROKU', 'SNAP', 'UBER', 'LYFT', 'ABNB', 'COIN',
    'PLTR', 'SNOW', 'DKNG', 'SOFI', 'RBLX', 'RIVN', 'LCID',
    # Energy
    'XOM', 'CVX', 'COP', 'SLB', 'EOG',
    # ETFs for diversification checks
    'SPY', 'QQQ', 'DIA', 'IWM',
]


class FundamentalsRunner:
    """Runs fundamentals scanner and stores results in database"""

    def __init__(self, supabase_url: str = None, supabase_key: str = None):
        """Initialize scanner and database connection"""
        self.scanner = FundamentalsScanner()

        # Initialize Supabase
        url = supabase_url or SUPABASE_URL
        key = supabase_key or SUPABASE_KEY

        if not url or not key:
            raise ValueError(
                "Supabase credentials not found. Set NEXT_PUBLIC_SUPABASE_URL and "
                "SUPABASE_SERVICE_ROLE_KEY environment variables."
            )

        self.supabase: Client = create_client(url, key)

    def fetch_ticker_info(self, symbol: str) -> Dict[str, Any]:
        """Fetch ticker info from yfinance"""
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            # Add current price and volume if not present
            if 'currentPrice' not in info and 'regularMarketPrice' in info:
                info['currentPrice'] = info['regularMarketPrice']

            return info
        except Exception as e:
            print(f"❌ Error fetching {symbol}: {e}")
            return {}

    def scan_stocks(self, universe: List[str] = None, min_score: int = 50) -> List[Dict[str, Any]]:
        """
        Scan universe of stocks for fundamental opportunities.

        Args:
            universe: List of stock symbols to scan
            min_score: Minimum overall score to include (0-100)

        Returns:
            List of signals that meet the criteria
        """
        if universe is None:
            universe = DEFAULT_UNIVERSE

        print(f"🔍 Scanning {len(universe)} stocks for fundamental opportunities...")
        print(f"   Minimum score: {min_score}")
        print()

        signals = []
        skipped = 0

        for i, symbol in enumerate(universe, 1):
            print(f"[{i}/{len(universe)}] Analyzing {symbol}...", end=' ')

            # Fetch ticker info
            ticker_info = self.fetch_ticker_info(symbol)

            if not ticker_info or 'symbol' not in ticker_info:
                print("❌ No data")
                skipped += 1
                continue

            # Analyze fundamentals
            try:
                signal = self.scanner.analyze_stock(symbol, ticker_info)

                if signal is None:
                    print("⚠️  Insufficient data")
                    skipped += 1
                    continue

                # Filter by minimum score
                if signal.overall_score < min_score:
                    print(f"⏭️  Score too low ({signal.overall_score})")
                    skipped += 1
                    continue

                signals.append(signal)
                print(f"✅ {signal.quality_level.upper()} ({signal.overall_score}/100)")

            except Exception as e:
                print(f"❌ Error: {e}")
                skipped += 1
                continue

        print()
        print(f"✅ Found {len(signals)} opportunities (skipped {skipped})")
        return signals

    def store_signals(self, signals: List[Any]) -> int:
        """
        Store signals in Supabase database.

        Args:
            signals: List of FundamentalSignal objects

        Returns:
            Number of signals stored
        """
        if not signals:
            print("⚠️  No signals to store")
            return 0

        print(f"💾 Storing {len(signals)} signals in database...")

        # Clear old signals first (optional - could keep for historical reference)
        try:
            # Delete signals older than 7 days
            cutoff = (datetime.now() - timedelta(days=7)).isoformat()
            result = self.supabase.table('fundamentals_signals').delete().lt('generated_at', cutoff).execute()
            print(f"   Cleaned up old signals")
        except Exception as e:
            print(f"   Warning: Could not clean old signals: {e}")

        # Convert signals to database rows
        rows = []
        for signal in signals:
            row = {
                'symbol': signal.symbol,
                'overall_score': signal.overall_score,
                'quality_level': signal.quality_level,
                'recommendation': signal.recommendation,
                'buy_reason': signal.buy_reason,
                'current_price': signal.metrics.current_price,
                'week_52_high': signal.metrics.week_52_high,
                'week_52_low': signal.metrics.week_52_low,
                'percent_from_52w_high': signal.metrics.percent_from_52w_high,
                'percent_from_52w_low': signal.metrics.percent_from_52w_low,
                'health_score': signal.health_score,
                'growth_score': signal.growth_score,
                'profitability_score': signal.profitability_score,
                'leverage_score': signal.leverage_score,
                'valuation_score': signal.valuation_score,
                'pe_ratio': signal.metrics.pe_ratio,
                'forward_pe': signal.metrics.forward_pe,
                'peg_ratio': signal.metrics.peg_ratio,
                'ps_ratio': signal.metrics.ps_ratio,
                'pb_ratio': signal.metrics.pb_ratio,
                'price_to_fcf': signal.metrics.price_to_fcf,
                'revenue_growth': signal.metrics.revenue_growth,
                'earnings_growth': signal.metrics.earnings_growth,
                'profit_margin': signal.metrics.profit_margin,
                'operating_margin': signal.metrics.operating_margin,
                'roe': signal.metrics.roe,
                'roa': signal.metrics.roa,
                'debt_to_equity': signal.metrics.debt_to_equity,
                'current_ratio': signal.metrics.current_ratio,
                'quick_ratio': signal.metrics.quick_ratio,
                'free_cash_flow': signal.metrics.free_cash_flow,
                'operating_cash_flow': signal.metrics.operating_cash_flow,
                'analyst_rating': signal.metrics.analyst_rating,
                'analyst_target_price': signal.metrics.target_price,
                'target_upside_pct': signal.metrics.target_upside_pct,
                'num_analysts': signal.metrics.num_analysts,
                'recommendation_mean': signal.metrics.recommendation_mean,
                'market_cap': signal.metrics.market_cap,
                'sector': signal.metrics.sector,
                'industry': signal.metrics.industry,
                'avg_volume': signal.metrics.avg_volume,
                'volume_surge': False,  # Would need to calculate this
                'strengths': signal.strengths,
                'weaknesses': signal.weaknesses,
                'catalysts': signal.catalysts,
                'risk_level': signal.risk_level,
                'risk_factors': signal.risk_factors,
                'generated_at': signal.timestamp.isoformat(),
                'expires_at': (signal.timestamp + timedelta(days=7)).isoformat(),
            }
            rows.append(row)

        # Insert in batches
        batch_size = 10
        stored = 0

        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            try:
                result = self.supabase.table('fundamentals_signals').insert(batch).execute()
                stored += len(batch)
                print(f"   Stored batch {i // batch_size + 1} ({len(batch)} signals)")
            except Exception as e:
                print(f"   ❌ Error storing batch: {e}")

        print(f"✅ Stored {stored}/{len(signals)} signals")
        return stored

    def run(self, universe: List[str] = None, min_score: int = 50) -> Dict[str, Any]:
        """
        Run full fundamentals scan and store results.

        Args:
            universe: List of symbols to scan (defaults to DEFAULT_UNIVERSE)
            min_score: Minimum score threshold

        Returns:
            Summary statistics
        """
        start_time = datetime.now()

        # Scan stocks
        signals = self.scan_stocks(universe, min_score)

        # Store in database
        stored = self.store_signals(signals)

        # Calculate statistics
        duration = (datetime.now() - start_time).total_seconds()

        stats = {
            'total_scanned': len(universe or DEFAULT_UNIVERSE),
            'signals_found': len(signals),
            'signals_stored': stored,
            'duration_seconds': duration,
            'quality_breakdown': {
                'excellent': len([s for s in signals if s.quality_level == 'excellent']),
                'good': len([s for s in signals if s.quality_level == 'good']),
                'fair': len([s for s in signals if s.quality_level == 'fair']),
                'poor': len([s for s in signals if s.quality_level == 'poor']),
            }
        }

        return stats


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Scan stocks for fundamental buy opportunities')
    parser.add_argument('--symbols', nargs='+', help='Specific symbols to scan')
    parser.add_argument('--min-score', type=int, default=50, help='Minimum score threshold (default: 50)')
    parser.add_argument('--all', action='store_true', help='Scan full default universe')

    args = parser.parse_args()

    try:
        runner = FundamentalsRunner()

        # Determine universe
        universe = None
        if args.symbols:
            universe = args.symbols
        elif args.all:
            universe = DEFAULT_UNIVERSE
        else:
            # Default to a smaller sample for quick testing
            universe = DEFAULT_UNIVERSE[:20]

        # Run scanner
        print("=" * 60)
        print("📊 FUNDAMENTALS SCANNER")
        print("=" * 60)
        print()

        stats = runner.run(universe, args.min_score)

        # Print summary
        print()
        print("=" * 60)
        print("📈 SCAN COMPLETE")
        print("=" * 60)
        print(f"Scanned: {stats['total_scanned']} stocks")
        print(f"Found: {stats['signals_found']} opportunities")
        print(f"Stored: {stats['signals_stored']} in database")
        print(f"Duration: {stats['duration_seconds']:.1f} seconds")
        print()
        print("Quality Breakdown:")
        for quality, count in stats['quality_breakdown'].items():
            if count > 0:
                print(f"  {quality.upper()}: {count}")
        print()

    except Exception as e:
        print(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
