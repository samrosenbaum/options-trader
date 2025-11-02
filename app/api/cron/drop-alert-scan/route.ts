import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

export async function POST(request: Request) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Starting drop alert scan...')

    // Run the Python scanner
    const { stdout, stderr } = await execAsync(
      'python3 scripts/run_drop_alert_scan.py --limit 40',
      {
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
        timeout: 240000, // 4 minutes
      }
    )

    console.log('Drop alert scan completed')
    console.log('stdout:', stdout)
    if (stderr) {
      console.warn('stderr:', stderr)
    }

    // Parse the JSON output from the scanner
    const lines = stdout.split('\n')
    const jsonLine = lines.find(line => line.trim().startsWith('{'))

    if (jsonLine) {
      const result = JSON.parse(jsonLine)
      return NextResponse.json({
        success: true,
        message: 'Drop alert scan completed',
        signalsGenerated: result.count,
        generatedAt: result.generatedAt,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Drop alert scan completed',
      output: stdout.substring(0, 500), // First 500 chars
    })
  } catch (error) {
    console.error('Drop alert scan failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Drop alert scan failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// Allow GET for manual testing
export async function GET(request: Request) {
  return POST(request)
}
