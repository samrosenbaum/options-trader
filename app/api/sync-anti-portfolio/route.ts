import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Sync Anti-Portfolio with correct P&L from closed positions
 *
 * This fixes cases where rejected_options has stale/incorrect realized_pl data
 */
export async function POST() {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🔄 Syncing Anti-Portfolio with closed positions...')

    // Get all closed positions for this user
    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'closed')
      .order('exit_date', { ascending: false })

    if (posError) {
      console.error('Error fetching positions:', posError)
      return NextResponse.json({ error: posError.message }, { status: 500 })
    }

    if (!positions || positions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No closed positions found',
        updated: 0,
        skipped: 0,
        errors: 0,
      })
    }

    console.log(`Found ${positions.length} closed positions`)

    let updated = 0
    let skipped = 0
    let errors = 0
    const errorDetails: Array<{ symbol: string; error: string }> = []

    for (const pos of positions) {
      // Check if this position exists in rejected_options
      const { data: rejection, error: rejError } = await supabase
        .from('rejected_options')
        .select('*')
        .eq('position_id', pos.id)
        .eq('user_id', user.id)
        .eq('rejection_source', 'user_closed_position')
        .maybeSingle()

      if (rejError) {
        console.error(`Error checking rejection for ${pos.symbol}:`, rejError)
        errors++
        errorDetails.push({ symbol: pos.symbol, error: rejError.message })
        continue
      }

      if (!rejection) {
        // Position not in anti-portfolio, skip
        skipped++
        continue
      }

      // Check if P&L matches
      if (
        rejection.realized_pl === pos.realized_pl &&
        rejection.realized_pl_percent === pos.realized_pl_percent
      ) {
        console.log(`✓ ${pos.symbol} already in sync`)
        skipped++
        continue
      }

      // Update with correct P&L from positions table
      const { error: updateError } = await supabase
        .from('rejected_options')
        .update({
          realized_pl: pos.realized_pl,
          realized_pl_percent: pos.realized_pl_percent,
        })
        .eq('position_id', pos.id)
        .eq('user_id', user.id)

      if (updateError) {
        console.error(`Error updating ${pos.symbol}:`, updateError)
        errors++
        errorDetails.push({ symbol: pos.symbol, error: updateError.message })
        continue
      }

      console.log(
        `✅ Updated ${pos.symbol}: $${rejection.realized_pl?.toFixed(0)} → $${pos.realized_pl?.toFixed(0)} (${pos.realized_pl_percent?.toFixed(1)}%)`
      )
      updated++
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${updated} positions`,
      updated,
      skipped,
      errors,
      errorDetails: errors > 0 ? errorDetails : undefined,
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      {
        error: 'Failed to sync anti-portfolio',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
