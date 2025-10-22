#!/usr/bin/env python3
"""
Backfill closed positions to the anti-portfolio (rejected_options table).

This script finds all positions that were closed before expiration and adds them
to the anti-portfolio so users can track what they missed out on.
"""

import os
import sys
from datetime import datetime, timedelta
from supabase import create_client, Client

def main():
    # Initialize Supabase client
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        print("❌ Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
        sys.exit(1)

    supabase: Client = create_client(url, key)

    print("🔍 Finding closed positions to backfill...")

    # Get all closed positions
    response = supabase.table('positions').select('*').eq('status', 'closed').execute()
    closed_positions = response.data

    if not closed_positions:
        print("✅ No closed positions found")
        return

    print(f"📊 Found {len(closed_positions)} closed positions")

    backfilled_count = 0
    skipped_count = 0

    for position in closed_positions:
        try:
            # Parse dates
            exit_date = datetime.fromisoformat(position['exit_date'].replace('Z', '+00:00')) if position.get('exit_date') else None
            entry_date = datetime.fromisoformat(position['entry_date'].replace('Z', '+00:00'))
            expiration_date = datetime.fromisoformat(position['expiration'] + 'T00:00:00+00:00')

            if not exit_date:
                print(f"⚠️  Skipping position {position['id']}: No exit date")
                skipped_count += 1
                continue

            # Calculate metrics
            days_until_expiration = (expiration_date - exit_date).days
            days_held = (exit_date - entry_date).days

            # Only backfill if closed before expiration
            if days_until_expiration <= 0:
                print(f"⏭️  Skipping position {position['symbol']} ${position['strike']} {position['option_type']}: Closed at/after expiration")
                skipped_count += 1
                continue

            # Check if already tracked in anti-portfolio
            existing = supabase.table('rejected_options')\
                .select('id')\
                .eq('position_id', position['id'])\
                .execute()

            if existing.data:
                print(f"⏭️  Skipping position {position['symbol']} ${position['strike']} {position['option_type']}: Already in anti-portfolio")
                skipped_count += 1
                continue

            # Prepare rejection data
            rejection_data = {
                'symbol': position['symbol'],
                'strike': position['strike'],
                'expiration': position['expiration'],
                'option_type': position['option_type'],
                'stock_price': position.get('current_stock_price') or position.get('entry_stock_price'),
                'option_price': position.get('exit_price') or position.get('entry_price'),
                'volume': None,
                'open_interest': None,
                'rejection_reason': 'CLOSED_TOO_SOON',
                'filter_stage': 'position_closed_early',
                'rejection_source': 'user_closed_position',
                'rejected_at': exit_date.isoformat(),
                'position_id': position['id'],
                'days_until_expiration': days_until_expiration,
                'days_held': days_held,
                'realized_pl': position.get('realized_pl'),
                'realized_pl_percent': position.get('realized_pl_percent'),
            }

            # Insert into rejected_options
            supabase.table('rejected_options').insert(rejection_data).execute()

            print(f"✅ Backfilled: {position['symbol']} ${position['strike']} {position['option_type']} "
                  f"(closed with {days_until_expiration}d left, P&L: ${position.get('realized_pl', 0):.2f})")
            backfilled_count += 1

        except Exception as e:
            print(f"❌ Error processing position {position.get('id', 'unknown')}: {e}")
            continue

    print(f"\n📈 Backfill Summary:")
    print(f"   ✅ Backfilled: {backfilled_count}")
    print(f"   ⏭️  Skipped: {skipped_count}")
    print(f"   📊 Total processed: {len(closed_positions)}")

    if backfilled_count > 0:
        print(f"\n🎉 Successfully backfilled {backfilled_count} closed positions to anti-portfolio!")
        print(f"   View them at your Anti-Portfolio page in the 'Closed Too Soon' section")
    else:
        print(f"\n✅ All closed positions already tracked or closed at expiration")

if __name__ == '__main__':
    main()
