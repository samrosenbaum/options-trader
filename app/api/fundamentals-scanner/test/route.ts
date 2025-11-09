import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Diagnostic endpoint to test fundamentals_signals table
 */
export async function GET(request: NextRequest) {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    tests: [],
  }

  try {
    // Test 1: Check Supabase connection
    diagnostics.tests.push({
      name: 'Supabase Client Creation',
      status: 'pending',
    })

    const supabase = await createClient()
    diagnostics.tests[0].status = 'passed'
    diagnostics.tests[0].message = 'Successfully created Supabase client'

    // Test 2: Check if table exists by attempting a simple count query
    diagnostics.tests.push({
      name: 'Table Existence Check',
      status: 'pending',
    })

    try {
      const { count, error: countError } = await supabase
        .from('fundamentals_signals')
        .select('*', { count: 'exact', head: true })

      if (countError) {
        diagnostics.tests[1].status = 'failed'
        diagnostics.tests[1].error = countError.message
        diagnostics.tests[1].hint = countError.message.includes('relation')
          ? 'Table does not exist. Run: npx supabase db push'
          : 'Database query error'
      } else {
        diagnostics.tests[1].status = 'passed'
        diagnostics.tests[1].message = `Table exists with ${count ?? 0} rows`
        diagnostics.tests[1].rowCount = count ?? 0
      }
    } catch (err) {
      diagnostics.tests[1].status = 'failed'
      diagnostics.tests[1].error = err instanceof Error ? err.message : 'Unknown error'
    }

    // Test 3: Try to fetch one record
    if (diagnostics.tests[1].status === 'passed') {
      diagnostics.tests.push({
        name: 'Data Fetch Test',
        status: 'pending',
      })

      const { data, error: fetchError } = await supabase
        .from('fundamentals_signals')
        .select('id, symbol, overall_score')
        .limit(1)

      if (fetchError) {
        diagnostics.tests[2].status = 'failed'
        diagnostics.tests[2].error = fetchError.message
      } else {
        diagnostics.tests[2].status = 'passed'
        diagnostics.tests[2].message = data && data.length > 0
          ? `Successfully fetched sample record: ${data[0].symbol}`
          : 'Table is empty - run scanner to populate'
        diagnostics.tests[2].sampleData = data?.[0] || null
      }
    }

    // Test 4: Check environment variables (without exposing values)
    diagnostics.tests.push({
      name: 'Environment Variables',
      status: 'pending',
    })

    const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
    const hasKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    diagnostics.tests[diagnostics.tests.length - 1].status = hasUrl && hasKey ? 'passed' : 'failed'
    diagnostics.tests[diagnostics.tests.length - 1].message = `URL: ${hasUrl ? '✓' : '✗'}, Key: ${hasKey ? '✓' : '✗'}`

    // Summary
    const allPassed = diagnostics.tests.every((test: any) => test.status === 'passed')
    diagnostics.summary = {
      overall: allPassed ? 'passed' : 'failed',
      passedTests: diagnostics.tests.filter((t: any) => t.status === 'passed').length,
      failedTests: diagnostics.tests.filter((t: any) => t.status === 'failed').length,
      totalTests: diagnostics.tests.length,
    }

    if (!allPassed) {
      diagnostics.recommendations = []

      const tableTest = diagnostics.tests.find((t: any) => t.name === 'Table Existence Check')
      if (tableTest?.status === 'failed') {
        diagnostics.recommendations.push({
          issue: 'Table does not exist',
          solution: 'Run: npx supabase db push',
          details: 'This will create the fundamentals_signals table in your database',
        })
      }

      const dataTest = diagnostics.tests.find((t: any) => t.name === 'Data Fetch Test')
      if (dataTest?.message?.includes('empty')) {
        diagnostics.recommendations.push({
          issue: 'Table is empty',
          solution: 'Run: ./scripts/run-fundamentals-scanner.sh --quick',
          details: 'This will populate the table with stock analysis data',
        })
      }
    }

    return NextResponse.json(diagnostics, { status: 200 })

  } catch (err) {
    diagnostics.criticalError = {
      message: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
    }
    return NextResponse.json(diagnostics, { status: 500 })
  }
}
