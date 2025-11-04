import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { handleOptions, jsonWithCors } from '@/lib/server/cors'

export const runtime = 'nodejs'
export const maxDuration = 60

const ALLOWED_METHODS = ['POST'] as const

export async function OPTIONS(request: Request) {
  return handleOptions(request, ALLOWED_METHODS)
}

/**
 * Sync Anti-Portfolio with correct P&L from closed positions
 *
 * This fixes cases where rejected_options has stale/incorrect realized_pl data
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return jsonWithCors(request, { error: 'Unauthorized' }, { status: 401 }, ALLOWED_METHODS)
    }

    console.log('🔄 Syncing Anti-Portfolio with closed positions...')

    // Get all closed positions for this user
    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'closed')
      .order('exit_date', { ascending: false })

    console.log(`Found ${positions?.length || 0} closed positions for user ${user.id}`)

    if (posError) {
      console.error('Error fetching positions:', posError)
      return jsonWithCors(request, { error: posError.message }, { status: 500 }, ALLOWED_METHODS)
    }

    if (!positions || positions.length === 0) {
      return jsonWithCors(request, {
        success: true,
        message: 'No closed positions found',
        updated: 0,
        skipped: 0,
        errors: 0,
      }, undefined, ALLOWED_METHODS)
    }

    console.log(`Found ${positions.length} closed positions`)

    let updated = 0
    let skipped = 0
    let errors = 0
    const errorDetails: Array<{ symbol: string; error: string }> = []

    for (const pos of positions) {
      console.log(`\n🔍 Checking ${pos.symbol} $${pos.strike} ${pos.option_type} (realized_pl: $${pos.realized_pl})`)

      // Check if this position exists in rejected_options (by position_id)
      let rejection
      const { data: rejectionData, error: rejError } = await supabase
        .from('rejected_options')
        .select('*')
        .eq('position_id', pos.id)
        .eq('user_id', user.id)
        .eq('rejection_source', 'user_closed_position')
        .maybeSingle()

      if (rejError) {
        console.error(`❌ Error checking rejection for ${pos.symbol}:`, rejError)
        errors++
        errorDetails.push({ symbol: pos.symbol, error: rejError.message })
        continue
      }

      rejection = rejectionData
      if (rejection) {
        console.log(`  ✅ Found by position_id: ${pos.id}`)
      }

      // Fallback: Try matching by symbol/strike/expiration if no position_id match
      if (!rejection) {
        console.log(`  ⚠️  No position_id match, trying fallback...`)
        const fallbackQuery = await supabase
          .from('rejected_options')
          .select('*')
          .eq('symbol', pos.symbol)
          .eq('strike', pos.strike)
          .eq('expiration', pos.expiration)
          .eq('option_type', pos.option_type)
          .eq('user_id', user.id)
          .eq('rejection_source', 'user_closed_position')
          .maybeSingle()

        if (!fallbackQuery.error && fallbackQuery.data) {
          rejection = fallbackQuery.data
          console.log(`  📌 Matched by symbol/strike/expiration/type`)
        } else {
          console.log(`  ❌ No fallback match found`)
        }
      }

      if (!rejection) {
        // Position not in anti-portfolio - check if it should be added
        const exitDate = new Date(pos.exit_date!)
        const expirationDate = new Date(pos.expiration)
        const daysUntilExpiration = Math.ceil(
          (expirationDate.getTime() - exitDate.getTime()) / (1000 * 60 * 60 * 24)
        )

        if (daysUntilExpiration <= 0) {
          console.log(`  ⏭️  Not in anti-portfolio, and closed after expiration, skipping`)
          skipped++
          continue
        }

        // Position was closed early but not in anti-portfolio - insert it
        console.log(`  ➕ Not in anti-portfolio but closed ${daysUntilExpiration}d early - adding now`)

        const entryDate = new Date(pos.entry_date)
        const daysHeld = Math.ceil(
          (exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
        )

        const { error: insertError } = await supabase
          .from('rejected_options')
          .insert({
            user_id: user.id,
            symbol: pos.symbol,
            strike: pos.strike,
            expiration: pos.expiration,
            option_type: pos.option_type,
            stock_price: pos.current_stock_price || pos.entry_stock_price,
            option_price: pos.exit_price || pos.entry_price,
            volume: 0,
            open_interest: 0,
            rejection_reason: 'CLOSED_TOO_SOON',
            filter_stage: 'position_closed_early',
            rejection_source: 'user_closed_position',
            position_id: pos.id,
            days_until_expiration: daysUntilExpiration,
            days_held: daysHeld,
            realized_pl: pos.realized_pl,
            realized_pl_percent: pos.realized_pl_percent,
            rejected_at: pos.exit_date,
          })

        if (insertError) {
          console.error(`  ❌ Error inserting ${pos.symbol}:`, insertError.message)
          errors++
          errorDetails.push({ symbol: pos.symbol, error: insertError.message })
          continue
        }

        console.log(`  ✅ Added ${pos.symbol} to anti-portfolio (${daysUntilExpiration}d early)`)
        updated++
        continue
      }

      console.log(`  Current anti-portfolio P&L: $${rejection.realized_pl} (should be $${pos.realized_pl})`)

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
      // Use rejection.id for precise matching (works for both position_id and fallback matches)
      const { error: updateError } = await supabase
        .from('rejected_options')
        .update({
          realized_pl: pos.realized_pl,
          realized_pl_percent: pos.realized_pl_percent,
          position_id: pos.id, // Also set position_id if it was missing
        })
        .eq('id', rejection.id)
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

    return jsonWithCors(request, {
      success: true,
      message: `Synced ${updated} positions`,
      updated,
      skipped,
      errors,
      errorDetails: errors > 0 ? errorDetails : undefined,
    }, undefined, ALLOWED_METHODS)
  } catch (error) {
    console.error('Sync error:', error)
    return jsonWithCors(
      request,
      {
        error: 'Failed to sync anti-portfolio',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
      ALLOWED_METHODS
    )
  }
}
