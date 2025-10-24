/**
 * Sync Anti-Portfolio with correct P&L from closed positions
 *
 * This fixes cases where rejected_options has stale/incorrect realized_pl data
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/types/database.types'

type Position = Database['public']['Tables']['positions']['Row']
type RejectedOption = any // Table not in current schema

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient<Database>(supabaseUrl, supabaseKey)

async function syncAntiPortfolio() {
  console.log('🔄 Syncing Anti-Portfolio with closed positions...\n')

  // Get all closed positions
  const { data: positions, error: posError } = await supabase
    .from('positions')
    .select('*')
    .eq('status', 'closed')
    .order('exit_date', { ascending: false })
    .returns<Position[]>()

  if (posError) {
    console.error('❌ Error fetching positions:', posError)
    return
  }

  if (!positions || positions.length === 0) {
    console.log('No closed positions found')
    return
  }

  console.log(`Found ${positions.length} closed positions\n`)

  let updated = 0
  let skipped = 0
  let errors = 0

  for (const pos of positions) {
    // Check if this position exists in rejected_options
    const { data: rejection, error: rejError } = await supabase
      .from('rejected_options')
      .select('*')
      .eq('position_id', pos.id)
      .eq('rejection_source', 'user_closed_position')
      .single()
      .returns<RejectedOption | null>()

    if (rejError && rejError.code !== 'PGRST116') {
      console.error(`❌ Error checking rejection for ${pos.symbol}:`, rejError)
      errors++
      continue
    }

    if (!rejection) {
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

    // Update with correct P&L
    const { error: updateError } = await supabase
      .from('rejected_options')
      .update({
        realized_pl: pos.realized_pl,
        realized_pl_percent: pos.realized_pl_percent,
      })
      .eq('position_id', pos.id)

    if (updateError) {
      console.error(`❌ Error updating ${pos.symbol}:`, updateError)
      errors++
      continue
    }

    console.log(
      `✅ Updated ${pos.symbol}: ${rejection.realized_pl} → ${pos.realized_pl} (${pos.realized_pl_percent?.toFixed(1)}%)`
    )
    updated++
  }

  console.log('\n📊 Summary:')
  console.log(`  Updated: ${updated}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Errors: ${errors}`)
  console.log('\n✨ Done!')
}

syncAntiPortfolio().catch(console.error)
