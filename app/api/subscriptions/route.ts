import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's subscription preferences
    const { data: subscription, error } = await supabase
      .from('email_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error
    }

    // Return default preferences if no subscription exists
    if (!subscription) {
      return NextResponse.json({
        morning_brief: true,
        nightly_brief: true,
        market_open_update: false,
        weekly_analysis: true
      })
    }

    return NextResponse.json(subscription)
  } catch (error) {
    console.error('Error fetching subscription:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { morning_brief, nightly_brief, market_open_update, weekly_analysis } = body

    // Upsert subscription preferences
    const { data, error } = await supabase
      .from('email_subscriptions')
      .upsert({
        user_id: user.id,
        email: user.email,
        morning_brief,
        nightly_brief,
        market_open_update,
        weekly_analysis
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error updating subscription:', error)
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    )
  }
}
