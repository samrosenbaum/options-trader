import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { Database } from '@/lib/types/database.types'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Fetch user settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (settingsError && settingsError.code !== 'PGRST116') {
      // PGRST116 is "not found" - that's ok for first-time users
      console.error('Error fetching settings:', settingsError)
      return NextResponse.json(
        { error: 'Failed to fetch settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      settings: settings || null,
      user_email: user.email
    })
  } catch (error) {
    console.error('Error in user-settings GET:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const {
      user_name,
      trading_desk_name,
      broker,
      trading_strategy,
      portfolio_size,
      daily_contract_budget,
      has_completed_first_scan,
    } = body

    const payload: Database['public']['Tables']['user_settings']['Insert'] = {
      user_id: user.id,
      user_name,
      trading_desk_name,
      broker,
      trading_strategy,
      portfolio_size,
      daily_contract_budget,
      updated_at: new Date().toISOString(),
    }

    if (typeof has_completed_first_scan === 'boolean') {
      payload.has_completed_first_scan = has_completed_first_scan
    }

    // Upsert user settings
    const { data, error } = await supabase
      .from('user_settings')
      .upsert(payload, {
        onConflict: 'user_id'
      })
      .select()
      .single()

    if (error) {
      console.error('Error upserting settings:', error)
      return NextResponse.json(
        { error: 'Failed to save settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({ settings: data })
  } catch (error) {
    console.error('Error in user-settings POST:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

