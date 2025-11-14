import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { Database } from '@/lib/types/database.types'
import { sendAdminSignupNotification } from '@/lib/resend'

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

    // Check if this is a new user (first time creating settings)
    const { data: existingSettings } = await supabase
      .from('user_settings')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    const isNewUser = !existingSettings

    const body = await request.json()
    const {
      user_name,
      trading_desk_name,
      broker,
      trading_strategy,
      portfolio_size,
      daily_contract_budget,
      has_completed_first_scan,
      show_next_steps_guide,
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

    if (typeof show_next_steps_guide === 'boolean') {
      payload.show_next_steps_guide = show_next_steps_guide
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

    // If this is a new user, log the signup and send admin notification
    if (isNewUser && user.email) {
      try {
        // Create service role client for admin operations
        const serviceClient = createServiceClient<Database>(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // Log signup event to database
        await serviceClient
          .from('user_signup_events')
          .insert({
            user_id: user.id,
            email: user.email,
            signup_timestamp: new Date().toISOString(),
            notification_sent: false,
          })

        // Send admin notification email (don't await - fire and forget)
        sendAdminSignupNotification(user.email, user_name).then(result => {
          if (result) {
            // Update notification_sent flag
            serviceClient
              .from('user_signup_events')
              .update({ notification_sent: true, notification_sent_at: new Date().toISOString() })
              .eq('user_id', user.id)
              .then(() => console.log('Signup notification sent successfully'))
          }
        }).catch(err => {
          console.error('Failed to send signup notification:', err)
        })
      } catch (notificationError) {
        // Log but don't fail the request
        console.error('Error sending signup notification:', notificationError)
      }
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

