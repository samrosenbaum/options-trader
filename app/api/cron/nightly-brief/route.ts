import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

    const supabase = await createClient()

    // Get all users subscribed to nightly brief
    const { data: subscriptions, error } = await supabase
      .from('email_subscriptions')
      .select('email')
      .eq('nightly_brief', true)

    if (error) throw error

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No subscribers for nightly brief'
      })
    }

    // Fetch the nightly brief from our own API (which calls Python backend)
    const apiUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'
    const briefResponse = await fetch(`${apiUrl}/api/analyst/nightly-brief`)
    if (!briefResponse.ok) {
      throw new Error('Failed to fetch nightly brief from API')
    }

    const briefData = await briefResponse.json()
    const formattedText = briefData.formatted_text

    // Send email to all subscribers
    const emailPromises = subscriptions.map(sub =>
      resend.emails.send({
        from: 'Monty Analyst <onboarding@resend.dev>',
        to: sub.email,
        subject: `Nightly Brief - Tomorrow's Battle Plan`,
        text: formattedText
      })
    )

    const results = await Promise.allSettled(emailPromises)
    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    return NextResponse.json({
      success: true,
      message: `Sent nightly brief to ${successful} subscribers (${failed} failed)`
    })
  } catch (error) {
    console.error('Error in nightly brief cron:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
