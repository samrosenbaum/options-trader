import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resend } from '@/lib/resend'

export async function GET(request: Request) {
  try {
    // Verify this is a Vercel Cron request
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    // Get all users subscribed to morning brief
    const { data: subscriptions, error } = await supabase
      .from('email_subscriptions')
      .select('email')
      .eq('morning_brief', true)

    if (error) throw error

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No subscribers for morning brief'
      })
    }

    // Fetch the morning brief from Python API
    const briefResponse = await fetch('http://localhost:8000/analyst/morning-brief')
    if (!briefResponse.ok) {
      throw new Error('Failed to fetch morning brief from Python API')
    }

    const briefData = await briefResponse.json()
    const formattedText = briefData.formatted_text

    // Send email to all subscribers
    const emailPromises = subscriptions.map(sub =>
      resend.emails.send({
        from: 'Monty Analyst <onboarding@resend.dev>',
        to: sub.email,
        subject: `Morning Brief - ${new Date().toLocaleDateString()}`,
        text: formattedText
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
