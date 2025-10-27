import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    // Get snapshots for the last N days
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data: snapshots, error: snapshotsError } = await supabase
      .from('portfolio_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .gte('snapshot_date', startDate.toISOString().split('T')[0])
      .order('snapshot_date', { ascending: true })

    if (snapshotsError) {
      console.error('Error fetching snapshots:', snapshotsError)
      return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 })
    }

    return NextResponse.json({ success: true, snapshots })
  } catch (err) {
    console.error('Portfolio snapshot error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Calculate today's portfolio snapshot
    const today = new Date().toISOString().split('T')[0]

    // Get all open positions
    const { data: openPositions, error: openError } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open')

    if (openError) {
      console.error('Error fetching open positions:', openError)
      return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 })
    }

    // Get all closed positions
    const { data: closedPositions, error: closedError } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'closed')

    if (closedError) {
      console.error('Error fetching closed positions:', closedError)
      return NextResponse.json({ error: 'Failed to fetch closed positions' }, { status: 500 })
    }

    // Calculate portfolio metrics
    const positionsValue = (openPositions || []).reduce((sum, pos) => {
      const currentValue = (pos.current_price || pos.entry_price) * pos.contracts * 100
      return sum + currentValue
    }, 0)

    const unrealizedPL = (openPositions || []).reduce((sum, pos) => {
      return sum + (pos.unrealized_pl || 0)
    }, 0)

    const realizedPL = (closedPositions || []).reduce((sum, pos) => {
      return sum + (pos.realized_pl || 0)
    }, 0)

    // Total account value = current position values + all realized P&L
    const totalValue = positionsValue + realizedPL
    const cashValue = realizedPL // Realized P&L represents cash from closed trades

    // Get today's existing snapshot to check if we have an opening value
    const { data: todaySnapshot } = await supabase
      .from('portfolio_snapshots')
      .select('opening_value_today, total_value')
      .eq('user_id', user.id)
      .eq('snapshot_date', today)
      .single()

    // Determine opening value for today
    // If we don't have an opening value yet, use current total as opening
    // This happens on first calculation of the day
    let openingValueToday = todaySnapshot?.opening_value_today || totalValue

    // Calculate intraday change based on opening value
    const dailyChange = totalValue - openingValueToday
    const dailyChangePercent = openingValueToday > 0
      ? (dailyChange / openingValueToday) * 100
      : 0

    // Upsert snapshot for today
    const snapshotData = {
      user_id: user.id,
      snapshot_date: today,
      total_value: totalValue,
      cash_value: cashValue,
      positions_value: positionsValue,
      unrealized_pl: unrealizedPL,
      realized_pl: realizedPL,
      daily_change: dailyChange,
      daily_change_percent: dailyChangePercent,
      opening_value_today: openingValueToday,
      open_positions_count: openPositions?.length || 0,
      closed_positions_count: closedPositions?.length || 0,
    }

    const { data: snapshot, error: upsertError } = await supabase
      .from('portfolio_snapshots')
      .upsert(snapshotData, { onConflict: 'user_id,snapshot_date' })
      .select()
      .single()

    if (upsertError) {
      console.error('Error upserting snapshot:', upsertError)
      return NextResponse.json({ error: 'Failed to save snapshot' }, { status: 500 })
    }

    return NextResponse.json({ success: true, snapshot })
  } catch (err) {
    console.error('Portfolio snapshot error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
