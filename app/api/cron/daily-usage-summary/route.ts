import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { sendDailyUsageSummary } from '@/lib/resend'

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

    // Get yesterday's date (since this runs in the morning for previous day's summary)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const summaryDate = yesterday.toISOString().split('T')[0] // YYYY-MM-DD

    // Query the database function for usage summary
    const { data: summaryRows, error } = await supabase
      .rpc('get_daily_usage_summary', { p_date: summaryDate })

    if (error) {
      console.error('Failed to get daily usage summary:', error)
      throw error
    }

    // Convert rows to a usable object
    const summaryMap = new Map(
      summaryRows?.map((row: { metric_name: string; metric_value: number; details: any }) => [
        row.metric_name,
        { value: row.metric_value, details: row.details }
      ]) || []
    )

    const newSignups = summaryMap.get('new_signups')?.value || 0
    const newSignupEmails = summaryMap.get('new_signups')?.details?.emails || []
    const activeUsers = summaryMap.get('active_users')?.value || 0
    const scansRun = summaryMap.get('scans_run')?.value || 0
    const scansRunUniqueUsers = summaryMap.get('scans_run')?.details?.unique_users || 0
    const positionsCreated = summaryMap.get('positions_created')?.value || 0
    const positionsCreatedUniqueUsers = summaryMap.get('positions_created')?.details?.unique_users || 0
    const positionsClosed = summaryMap.get('positions_closed')?.value || 0
    const totalUsers = summaryMap.get('total_users')?.value || 0
    const totalOpenPositions = summaryMap.get('total_positions_open')?.value || 0

    // Format date nicely
    const formattedDate = yesterday.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York'
    })

    // Send the summary email
    const result = await sendDailyUsageSummary({
      date: formattedDate,
      newSignups,
      newSignupEmails,
      activeUsers,
      scansRun,
      scansRunUniqueUsers,
      positionsCreated,
      positionsCreatedUniqueUsers,
      positionsClosed,
      totalUsers,
      totalOpenPositions,
    })

    return NextResponse.json({
      success: true,
      message: 'Daily usage summary sent successfully',
      emailId: result?.id,
      summary: {
        date: formattedDate,
        newSignups,
        activeUsers,
        scansRun,
        positionsCreated,
      }
    })
  } catch (error) {
    console.error('Error in daily usage summary cron:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
