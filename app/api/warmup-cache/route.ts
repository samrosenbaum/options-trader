import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes max

/**
 * Cache warmup endpoint - pre-fetches options data before market open
 * Should be called at 9:25 AM ET via cron job
 */
export async function GET() {
  const startTime = Date.now()

  try {
    console.log('[Cache Warmup] Starting cache warmup at', new Date().toISOString())

    // Call the scanner to refresh the cache
    const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const scanResponse = await fetch(`${baseUrl}/api/scan-python?mode=standard&max_symbols=50`, {
      method: 'GET',
      headers: {
        'X-Cron-Job': 'cache-warmup',
      },
    })

    if (!scanResponse.ok) {
      const errorText = await scanResponse.text()
      console.error('[Cache Warmup] Scanner failed:', errorText)
      return NextResponse.json({
        success: false,
        error: 'Scanner failed',
        details: errorText,
        duration: Date.now() - startTime,
      }, { status: 500 })
    }

    const scanResult = await scanResponse.json()
    const duration = Date.now() - startTime

    console.log('[Cache Warmup] ✓ Complete:', {
      opportunities: scanResult.opportunities?.length || 0,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      message: 'Cache warmed successfully',
      opportunities: scanResult.opportunities?.length || 0,
      duration,
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    const duration = Date.now() - startTime
    console.error('[Cache Warmup] Error:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
    }, { status: 500 })
  }
}
