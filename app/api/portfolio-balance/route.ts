import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculatePortfolioGaps, getNeededPositionTypes } from '@/lib/portfolio-balance'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch open positions
    const { data: positions, error: positionsError } = await supabase
      .from('positions')
      .select('option_type, contracts, status')
      .eq('user_id', user.id)
      .eq('status', 'open')

    if (positionsError) {
      console.error('Error fetching positions:', positionsError)
      return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 })
    }

    // Calculate gaps
    const gaps = calculatePortfolioGaps(positions || [])
    const neededTypes = getNeededPositionTypes(gaps)

    return NextResponse.json({
      success: true,
      gaps,
      neededTypes,
      hasPositions: (positions?.length || 0) > 0,
    })
  } catch (err) {
    console.error('Portfolio balance error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
