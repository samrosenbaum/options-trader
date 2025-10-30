import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient()

    // Get all email subscriptions
    const { data: subscriptions, error } = await supabase
      .from('email_subscriptions')
      .select('*')

    if (error) throw error

    return NextResponse.json({
      success: true,
      total: subscriptions?.length || 0,
      subscriptions: subscriptions || [],
      morning_brief_count: subscriptions?.filter(s => s.morning_brief).length || 0
    })
  } catch (error) {
    console.error('Error fetching subscriptions:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
