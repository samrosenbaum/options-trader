import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Cleanup orphaned anti-portfolio entries
 *
 * Removes rejected_options records with rejection_source='user_closed_position'
 * that don't have a corresponding position in the positions table.
 */
export async function POST() {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🧹 Cleaning up orphaned anti-portfolio entries...')

    // Get all user_closed_position entries
    const { data: rejections, error: rejError } = await supabase
      .from('rejected_options')
      .select('*')
      .eq('user_id', user.id)
      .eq('rejection_source', 'user_closed_position')

    if (rejError) {
      console.error('Error fetching rejections:', rejError)
      return NextResponse.json({ error: rejError.message }, { status: 500 })
    }

    if (!rejections || rejections.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No anti-portfolio entries found',
        deleted: 0,
      })
    }

    console.log(`Found ${rejections.length} anti-portfolio entries`)

    let deleted = 0
    const deletedEntries: Array<{ symbol: string; strike: number; reason: string }> = []

    for (const rejection of rejections) {
      // Check if there's a corresponding position
      if (rejection.position_id) {
        // Has position_id link, check if position exists AND matches strike/expiration
        const { data: position } = await supabase
          .from('positions')
          .select('id, symbol, strike, expiration, option_type')
          .eq('id', rejection.position_id)
          .eq('user_id', user.id)
          .maybeSingle()

        if (!position) {
          // Position doesn't exist, delete the orphaned rejection
          console.log(`  🗑️  Deleting orphaned ${rejection.symbol} $${rejection.strike} - position_id not found`)

          await supabase
            .from('rejected_options')
            .delete()
            .eq('id', rejection.id)
            .eq('user_id', user.id)

          deleted++
          deletedEntries.push({
            symbol: rejection.symbol,
            strike: rejection.strike,
            reason: 'position_id link broken',
          })
        } else if (
          position.symbol !== rejection.symbol ||
          position.strike !== rejection.strike ||
          position.expiration !== rejection.expiration ||
          position.option_type !== rejection.option_type
        ) {
          // Position exists but doesn't match - wrong link, delete it
          console.log(`  🗑️  Deleting mismatched ${rejection.symbol} $${rejection.strike} - linked to wrong position`)

          await supabase
            .from('rejected_options')
            .delete()
            .eq('id', rejection.id)
            .eq('user_id', user.id)

          deleted++
          deletedEntries.push({
            symbol: rejection.symbol,
            strike: rejection.strike,
            reason: 'position_id points to wrong position',
          })
        }
      } else {
        // No position_id, try to match by symbol/strike/expiration
        const { data: position } = await supabase
          .from('positions')
          .select('id')
          .eq('symbol', rejection.symbol)
          .eq('strike', rejection.strike)
          .eq('expiration', rejection.expiration)
          .eq('option_type', rejection.option_type)
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .maybeSingle()

        if (!position) {
          // No matching position found, delete orphaned rejection
          console.log(`  🗑️  Deleting orphaned ${rejection.symbol} $${rejection.strike} - no matching position`)

          await supabase
            .from('rejected_options')
            .delete()
            .eq('id', rejection.id)
            .eq('user_id', user.id)

          deleted++
          deletedEntries.push({
            symbol: rejection.symbol,
            strike: rejection.strike,
            reason: 'no matching position',
          })
        } else {
          // Found matching position, update the position_id link
          console.log(`  🔗 Linking ${rejection.symbol} $${rejection.strike} to position ${position.id}`)

          await supabase
            .from('rejected_options')
            .update({ position_id: position.id })
            .eq('id', rejection.id)
            .eq('user_id', user.id)
        }
      }
    }

    console.log(`✅ Cleanup complete: deleted ${deleted} orphaned entries`)

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${deleted} orphaned entries`,
      deleted,
      deletedEntries,
    })
  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json(
      {
        error: 'Failed to cleanup anti-portfolio',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
