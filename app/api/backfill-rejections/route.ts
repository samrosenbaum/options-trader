import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 })
    }

    if (!closedPositions || closedPositions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No closed positions found',
        backfilled: 0,
        skipped: 0,
        errors: 0
      })
    }

    console.log(`📊 Found ${closedPositions.length} closed positions`)

    let backfilled = 0
    let skipped = 0
    let errors = 0

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
          errors++
        } else {
          console.log(`✅ Backfilled ${position.symbol} $${position.strike} ${position.option_type} (${daysUntilExpiration} days early)`)
          backfilled++
        }
      } catch (err) {
        console.error(`❌ Error processing position:`, err)
        errors++
      }
    }

    const summary = {
      success: true,
      message: 'Backfill complete',
      backfilled,
      skipped,
      errors,
      total: closedPositions.length
    }

    console.log('📊 Backfill Summary:', summary)
    return NextResponse.json(summary)

  } catch (err) {
    console.error('Error in backfill:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
