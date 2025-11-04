import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { handleOptions, jsonWithCors } from '@/lib/server/cors'

export const runtime = 'nodejs'
export const maxDuration = 60

const ALLOWED_METHODS = ['POST'] as const

export async function OPTIONS(request: Request) {
  return handleOptions(request, ALLOWED_METHODS)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return jsonWithCors(request, { error: 'Unauthorized' }, { status: 401 }, ALLOWED_METHODS)
    }

    console.log('🔄 Starting backfill of closed positions to anti-portfolio...')

    // Get all closed positions for this user
    const { data: closedPositions, error: fetchError } = await supabase
      .from('positions')
      .select('*')
      .eq('status', 'closed')
      .eq('user_id', user.id)

    if (fetchError) {
      console.error('❌ Error fetching closed positions:', fetchError)
      return jsonWithCors(request, { error: 'Failed to fetch positions' }, { status: 500 }, ALLOWED_METHODS)
    }

    if (!closedPositions || closedPositions.length === 0) {
      return jsonWithCors(request, {
        success: true,
        message: 'No closed positions found',
        backfilled: 0,
        skipped: 0,
        errors: 0,
      }, undefined, ALLOWED_METHODS)
    }

    console.log(`📊 Found ${closedPositions.length} closed positions`)

    let backfilled = 0
    let skipped = 0
    let errors = 0
    const errorDetails: Array<{ symbol: string; error: string }> = []

    for (const position of closedPositions) {
      try {
        const exitDate = new Date(position.exit_date!)
        const expirationDate = new Date(position.expiration)

        // Calculate days until expiration at time of close
        const daysUntilExpiration = Math.ceil(
          (expirationDate.getTime() - exitDate.getTime()) / (1000 * 60 * 60 * 24)
        )

        // Only backfill if closed before expiration
        if (daysUntilExpiration <= 0) {
          console.log(`⏭️  Skipping ${position.symbol} - closed after expiration`)
          skipped++
          continue
        }

        // Calculate days held
        const entryDate = new Date(position.entry_date)
        const daysHeld = Math.ceil(
          (exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
        )

        // Check if already exists in rejected_options
        const { data: existing } = await supabase
          .from('rejected_options')
          .select('id')
          .eq('position_id', position.id)
          .single()

        if (existing) {
          console.log(`⏭️  Skipping ${position.symbol} - already in anti-portfolio`)
          skipped++
          continue
        }

        // Insert into rejected_options
        const rejectionData = {
          user_id: user.id,
          symbol: position.symbol,
          strike: position.strike,
          expiration: position.expiration,
          option_type: position.option_type,
          stock_price: position.current_stock_price || position.entry_stock_price,
          option_price: position.exit_price || position.entry_price,
          volume: 0,
          open_interest: 0,
          rejection_reason: 'CLOSED_TOO_SOON',
          filter_stage: 'position_closed_early',
          rejection_source: 'user_closed_position',
          position_id: position.id,
          days_until_expiration: daysUntilExpiration,
          days_held: daysHeld,
          realized_pl: position.realized_pl,
          realized_pl_percent: position.realized_pl_percent,
          rejected_at: position.exit_date,
        }

        const { error: insertError } = await supabase
          .from('rejected_options')
          .insert(rejectionData)

        if (insertError) {
          console.error(`❌ Error inserting ${position.symbol}:`, insertError.message)
          errorDetails.push({ symbol: position.symbol, error: insertError.message })
          errors++
        } else {
          console.log(`✅ Backfilled ${position.symbol} $${position.strike} ${position.option_type} (${daysUntilExpiration} days early)`)
          backfilled++
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`❌ Error processing position ${position.symbol}:`, errorMsg)
        errorDetails.push({ symbol: position.symbol, error: errorMsg })
        errors++
      }
    }

    const summary = {
      success: true,
      message: 'Backfill complete',
      backfilled,
      skipped,
      errors,
      total: closedPositions.length,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined
    }

    console.log('📊 Backfill Summary:', summary)
    return jsonWithCors(request, summary, undefined, ALLOWED_METHODS)

  } catch (err) {
    console.error('Error in backfill:', err)
    return jsonWithCors(
      request,
      { error: 'Internal server error' },
      { status: 500 },
      ALLOWED_METHODS,
    )
  }
}
