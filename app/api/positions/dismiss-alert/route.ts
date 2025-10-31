import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

interface DismissAlertRequest {
  positionId: string
  alertId: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: DismissAlertRequest = await request.json()
    const { positionId, alertId } = body

    if (!positionId || !alertId) {
      return NextResponse.json(
        { error: 'Missing positionId or alertId' },
        { status: 400 }
      )
    }

    // Fetch the position
    const { data: position, error: fetchError } = await supabase
      .from('positions')
      .select('pending_alerts, user_id')
      .eq('id', positionId)
      .single()

    if (fetchError || !position) {
      return NextResponse.json(
        { error: 'Position not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (position.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Remove the alert from pending_alerts
    const pendingAlerts = Array.isArray(position.pending_alerts)
      ? position.pending_alerts
      : []

    const updatedAlerts = pendingAlerts.filter(
      (alert: any) => alert.id !== alertId
    )

    // Update the position
    const { error: updateError } = await supabase
      .from('positions')
      .update({
        pending_alerts: updatedAlerts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', positionId)

    if (updateError) {
      console.error('Error dismissing alert:', updateError)
      return NextResponse.json(
        { error: 'Failed to dismiss alert' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      remainingAlerts: updatedAlerts.length,
    })
  } catch (error) {
    console.error('Error in dismiss-alert endpoint:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
