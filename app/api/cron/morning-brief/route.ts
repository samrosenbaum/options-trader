import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { resend } from '@/lib/resend'

export async function POST(request: Request) {
  try {
    // Optional CRON_SECRET check if configured
    if (process.env.CRON_SECRET) {
      const authHeader = request.headers.get('authorization')
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY is not configured' },
        { status: 500 }
      )
    }

    const supabase = getSupabaseAdminClient()

    // Get all users subscribed to morning brief
    const { data: subscriptions, error } = await supabase
      .from('email_subscriptions')
      .select('email')
      .eq('morning_brief', true)

    if (error) {
      console.error('Failed to load morning brief subscribers:', error)
      throw error
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No subscribers for morning brief'
      })
    }

    // Fetch the morning brief from our own API (which calls Python backend)
    const apiUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'
    const briefResponse = await fetch(`${apiUrl}/api/analyst/morning-brief`)
    if (!briefResponse.ok) {
      const errorText = await briefResponse.text()
      console.error(
        'Failed to fetch morning brief from API:',
        briefResponse.status,
        errorText
      )
      throw new Error('Failed to fetch morning brief from API')
    }

    const briefData = await briefResponse.json()
    const formattedText = briefData.formatted_text

    // Format date for Eastern Time
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York'
    })

    // Send email to all subscribers
    const emailPromises = subscriptions.map(sub =>
      resend.emails.send({
        from: 'Monty Analyst <onboarding@resend.dev>',
        to: sub.email,
        subject: `☀️ Morning Brief - ${today}`,
        text: `📊 YOUR MORNING BRIEF FOR ${today.toUpperCase()}\n${'='.repeat(60)}\n\n${formattedText}`
      })
    )

    const results = await Promise.allSettled(emailPromises)
    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    return NextResponse.json({
      success: true,
      message: `Sent morning brief to ${successful} subscribers (${failed} failed)`
    })
  } catch (error) {
    console.error('Error in morning brief cron:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
