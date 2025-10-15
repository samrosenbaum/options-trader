#!/usr/bin/env python3
"""
Background Scanner - Runs Full Analysis and Caches Results

This script runs a complete institutional-grade scan with ALL features enabled
and stores the results in Supabase for instant serving to users.

Designed to be run on a schedule (every 10 minutes via cron/scheduler).
"""

import json
import os
import sys
import time
from datetime import datetime
from typing import Any, Dict, List

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.scanner.enhanced_service import run_enhanced_scan


def save_scan_to_supabase(
    opportunities: List[Dict[str, Any]],
    metadata: Dict[str, Any],
    total_evaluated: int,
    symbols_scanned: List[str],
    scan_duration: float,
    filter_mode: str = 'strict'
) -> bool:
    """
    Save scan results to Supabase cached_scan_results table.

    Args:
        opportunities: List of opportunity dictionaries
        metadata: Scan metadata
        total_evaluated: Number of options evaluated
        symbols_scanned: List of symbols that were scanned
        scan_duration: Time taken in seconds
        filter_mode: 'strict' or 'relaxed'

    Returns:
        True if successful, False otherwise
    """
    try:
        from supabase import create_client, Client

        # Get Supabase credentials
        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        # Use service role key for backend operations
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

        if not url or not key:
            print("❌ Missing Supabase credentials", file=sys.stderr)
            return False

        supabase: Client = create_client(url, key)

        # Prepare data for storage
        scan_data = {
            'scan_timestamp': datetime.now().isoformat(),
            'filter_mode': filter_mode,
            'opportunities': json.dumps(opportunities),  # Store as JSON
            'total_evaluated': total_evaluated,
            'symbols_scanned': symbols_scanned,
            'scan_duration_seconds': scan_duration,
            'metadata': json.dumps(metadata),
        }

        # Insert into Supabase
        result = supabase.table('cached_scan_results').insert(scan_data).execute()

        if result.data:
            print(f"✅ Saved scan to Supabase: {len(opportunities)} opportunities", file=sys.stderr)
            return True
        else:
            print(f"⚠️  Supabase insert returned no data", file=sys.stderr)
            return False

    except Exception as e:
        print(f"❌ Error saving to Supabase: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False


def run_background_scan(filter_mode: str = 'strict', max_symbols: int = None) -> None:
    """
    Run a complete background scan and cache results.

    Args:
        filter_mode: 'strict' or 'relaxed'
        max_symbols: Maximum symbols to scan (None = no limit, scan all)
    """
    print("\n" + "="*80, file=sys.stderr)
    print(f"🚀 BACKGROUND SCANNER STARTED - {datetime.now().isoformat()}", file=sys.stderr)
    print("="*80, file=sys.stderr)

    # Enable sentiment pre-screening for background scans (we have time!)
    os.environ['USE_SENTIMENT_PRESCREENING'] = '1'

    start_time = time.time()

    try:
        # Run full enhanced scan with ALL features
        print(f"📊 Running FULL enhanced scan (filter_mode={filter_mode}, max_symbols={max_symbols or 'unlimited'})", file=sys.stderr)

        result = run_enhanced_scan(
            max_symbols=max_symbols,
            force_refresh=True,  # Always fetch fresh data
            allow_relaxed_fallback=(filter_mode == 'relaxed'),
        )

        scan_duration = time.time() - start_time

        opportunities = result.opportunities
        metadata = result.metadata
        total_evaluated = metadata.get('totalEvaluated', 0)
        symbols_scanned = metadata.get('symbolsScanned', [])

        print(f"\n📈 Scan Complete:", file=sys.stderr)
        print(f"   ✓ Opportunities found: {len(opportunities)}", file=sys.stderr)
        print(f"   ✓ Total evaluated: {total_evaluated}", file=sys.stderr)
        print(f"   ✓ Symbols scanned: {len(symbols_scanned)}", file=sys.stderr)
        print(f"   ✓ Duration: {scan_duration:.1f} seconds", file=sys.stderr)

        # Save to Supabase
        print(f"\n💾 Saving results to Supabase...", file=sys.stderr)
        success = save_scan_to_supabase(
            opportunities=opportunities,
            metadata=metadata,
            total_evaluated=total_evaluated,
            symbols_scanned=symbols_scanned,
            scan_duration=scan_duration,
            filter_mode=filter_mode
        )

        if success:
            print(f"✅ BACKGROUND SCAN SUCCESSFUL - Results cached for instant serving", file=sys.stderr)
        else:
            print(f"⚠️  BACKGROUND SCAN COMPLETED but failed to cache results", file=sys.stderr)

    except Exception as e:
        print(f"\n❌ BACKGROUND SCAN FAILED: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

    print("="*80, file=sys.stderr)
    print(f"🏁 BACKGROUND SCANNER FINISHED - {datetime.now().isoformat()}", file=sys.stderr)
    print("="*80 + "\n", file=sys.stderr)


def main():
    """Main entry point for background scanner."""
    import argparse

    parser = argparse.ArgumentParser(description="Background scanner for caching results")
    parser.add_argument(
        '--filter-mode',
        type=str,
        default='strict',
        choices=['strict', 'relaxed'],
        help='Filter mode for scanning'
    )
    parser.add_argument(
        '--max-symbols',
        type=int,
        default=None,
        help='Maximum number of symbols to scan (default: unlimited)'
    )

    args = parser.parse_args()

    run_background_scan(
        filter_mode=args.filter_mode,
        max_symbols=args.max_symbols
    )


if __name__ == '__main__':
    main()
