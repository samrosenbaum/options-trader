import { NextResponse } from 'next/server'
import { sendMorningBrief } from '@/lib/resend'

export async function POST() {
  try {
    // Fetch the morning brief from Python backend
    const response = await fetch('http://localhost:8000/analyst/morning-brief')

    if (!response.ok) {
      throw new Error('Failed to fetch morning brief from Python API')
    }

    const data = await response.json()

    if (!data.success || !data.formatted_text) {
      throw new Error('Invalid response from Python API')
    }

    // Send email via Resend
    const emailResult = await sendMorningBrief(data.formatted_text)

    return NextResponse.json({
      success: true,
      message: 'Morning brief sent successfully',
      emailId: emailResult?.id,
      briefData: data
    })
  } catch (error) {
    console.error('Error sending morning brief:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
