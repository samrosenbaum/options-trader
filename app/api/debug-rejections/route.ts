import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all closed positions from rejected_options
    const { data: rejections } = await supabase
      .from('rejected_options')
      .select('*')
      .eq('user_id', user.id)
      .eq('rejection_source', 'user_closed_position')
      .order('rejected_at', { ascending: false })

    // Get all closed positions from positions table for comparison
    const { data: positions } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'closed')
      .order('exit_date', { ascending: false })

    return NextResponse.json({
      rejections: rejections?.map(r => ({
        symbol: r.symbol,
        strike: r.strike,
        option_type: r.option_type,
        expiration: r.expiration,
        rejected_at: r.rejected_at,
        days_until_expiration: r.days_until_expiration,
        position_id: r.position_id,
      })),
      positions: positions?.map(p => ({
        id: p.id,
        symbol: p.symbol,
        strike: p.strike,
        option_type: p.option_type,
        expiration: p.expiration,
        exit_date: p.exit_date,
        entry_date: p.entry_date,
      })),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
