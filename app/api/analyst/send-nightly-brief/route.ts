import { NextResponse } from 'next/server'
import { sendNightlyBrief } from '@/lib/resend'

export async function POST() {
  try {
    // Fetch the nightly brief from Python backend
    const response = await fetch('http://localhost:8000/analyst/nightly-brief')

    if (!response.ok) {
      throw new Error('Failed to fetch nightly brief from Python API')
    }

    const data = await response.json()

    if (!data.success || !data.formatted_text) {
      throw new Error('Invalid response from Python API')
    }

    // Send email via Resend
    const emailResult = await sendNightlyBrief(data.formatted_text)

    return NextResponse.json({
      success: true,
      message: 'Nightly brief sent successfully',
      emailId: emailResult?.id,
      briefData: data
    })
  } catch (error) {
    console.error('Error sending nightly brief:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
