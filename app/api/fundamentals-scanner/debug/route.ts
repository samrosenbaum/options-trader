import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Debug endpoint - same logic as main endpoint but with verbose logging
 */
export async function GET(request: NextRequest) {
  const logs: string[] = []
  const log = (message: string) => {
    console.log(`[DEBUG] ${message}`)
    logs.push(`[${new Date().toISOString()}] ${message}`)
  }

  try {
    log('=== START DEBUG REQUEST ===')
    log(`URL: ${request.url}`)

    const { searchParams } = new URL(request.url)
    const minScore = parseInt(searchParams.get('minScore') ?? '50', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

    log(`Query params - minScore: ${minScore}, limit: ${limit}`)

    // Test Supabase client creation
    log('Creating Supabase client...')
    let supabase
    try {
      supabase = await createClient()
      log('✓ Supabase client created successfully')
    } catch (err) {
      log(`✗ Failed to create Supabase client: ${err instanceof Error ? err.message : err}`)
      throw err
    }

    // Test table query
    log('Building query...')
    const query = supabase
      .from('fundamentals_signals')
      .select('*')
      .gte('overall_score', minScore)
      .gt('expires_at', new Date().toISOString())
      .order('overall_score', { ascending: false })
      .limit(limit)

    log('Executing query...')
    const { data, error } = await query

    if (error) {
      log(`✗ Query failed with error: ${JSON.stringify(error, null, 2)}`)
      log(`Error message: ${error.message}`)
      log(`Error code: ${error.code}`)
      log(`Error hint: ${error.hint}`)
      log(`Error details: ${error.details}`)

      return NextResponse.json({
        success: false,
        error: 'Query failed',
        errorDetails: {
          message: error.message,
          code: error.code,
          hint: error.hint,
          details: error.details,
        },
        logs,
      }, { status: 500 })
    }

    log(`✓ Query succeeded, returned ${data?.length ?? 0} rows`)

    if (data && data.length > 0) {
      log(`First row sample: ${JSON.stringify(data[0], null, 2).substring(0, 200)}...`)
    }

    // Test additional queries
    log('Testing count query...')
    const { count, error: countError } = await supabase
      .from('fundamentals_signals')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      log(`✗ Count query failed: ${countError.message}`)
    } else {
      log(`✓ Total rows in table: ${count}`)
    }

    log('=== END DEBUG REQUEST ===')

    return NextResponse.json({
      success: true,
      rowsReturned: data?.length ?? 0,
      totalRows: count ?? 'unknown',
      sampleData: data?.[0] || null,
      logs,
    })

  } catch (err) {
    log(`✗ CRITICAL ERROR: ${err instanceof Error ? err.message : err}`)
    if (err instanceof Error && err.stack) {
      log(`Stack trace: ${err.stack}`)
    }

    return NextResponse.json({
      success: false,
      error: 'Critical error',
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
      errorStack: err instanceof Error ? err.stack : undefined,
      logs,
    }, { status: 500 })
  }
}
