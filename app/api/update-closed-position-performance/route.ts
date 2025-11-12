import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { handleOptions, jsonWithCors } from '@/lib/server/cors'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const ALLOWED_METHODS = ['POST'] as const

export async function OPTIONS(request: Request) {
  return handleOptions(request, ALLOWED_METHODS)
}

/**
 * Update current/final performance for closed positions in anti-portfolio
 *
 * For positions still within expiration: Shows current option price (what you'd have now)
 * For expired positions: Shows final value (worthless = $0, or intrinsic value if ITM)
 *
 * This helps you learn if you closed too soon.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return jsonWithCors(request, { error: 'Unauthorized' }, { status: 401 }, ALLOWED_METHODS)
    }

    console.log('📊 Updating next-day performance for closed positions...')

    // Get all closed-too-soon entries (always update to show current price)
    const { data: closedPositions, error: fetchError } = await supabase
      .from('rejected_options')
      .select('*')
      .eq('user_id', user.id)
      .eq('rejection_source', 'user_closed_position')
      .order('rejected_at', { ascending: false })
      .limit(50) // Process 50 at a time to avoid timeout

    if (fetchError) {
      console.error('Error fetching closed positions:', fetchError)
      return jsonWithCors(request, { error: fetchError.message }, { status: 500 }, ALLOWED_METHODS)
    }

    if (!closedPositions || closedPositions.length === 0) {
      return jsonWithCors(request, {
        success: true,
        message: 'No positions need next-day data',
        updated: 0,
      }, undefined, ALLOWED_METHODS)
    }

    console.log(`Found ${closedPositions.length} positions to update`)

    let updated = 0
    let skipped = 0
    let errors = 0
    const errorDetails: Array<{ symbol: string; error: string }> = []

    for (const pos of closedPositions) {
      try {
        console.log(`\n=== Processing ${pos.symbol} ===`)

        const closedDate = new Date(pos.rejected_at)
        if (Number.isNaN(closedDate.getTime())) {
          console.error(`  ❌ Invalid close date for ${pos.symbol}`)
          errors++
          errorDetails.push({ symbol: pos.symbol, error: 'Invalid close date' })
          continue
        }

        let expirationDate: Date | null = null

        if (pos.expiration) {
          const parsedExpiration = new Date(pos.expiration)
          if (!Number.isNaN(parsedExpiration.getTime())) {
            expirationDate = parsedExpiration
          }
        }

        if (!expirationDate) {
          const fallbackExpiration = new Date(closedDate)
          const daysUntilExpiration = typeof pos.days_until_expiration === 'number'
            ? pos.days_until_expiration
            : 0
          fallbackExpiration.setDate(fallbackExpiration.getDate() + daysUntilExpiration)
          expirationDate = fallbackExpiration
        }

        if (!expirationDate || Number.isNaN(expirationDate.getTime())) {
          console.warn(`  ⚠️  Unable to determine expiration for ${pos.symbol}, skipping`)
          skipped++
          continue
        }

        expirationDate.setHours(23, 59, 59, 999) // End of expiration day

        const now = new Date()

        console.log(`  Closed on: ${closedDate.toISOString()}`)
        console.log(`  Days until expiration (at close): ${pos.days_until_expiration}`)
        console.log(`  Calculated expiration: ${expirationDate.toISOString()}`)
        console.log(`  Current time: ${now.toISOString()}`)
        console.log(`  Has expired? ${now > expirationDate}`)

        // Check if position has expired
        if (now > expirationDate) {
          // Position expired - calculate final intrinsic value
          // For now, set to 0 (worthless). TODO: Calculate ITM value if stock price data available
          const { error: updateError } = await supabase
            .from('rejected_options')
            .update({
              next_day_price: 0,
              price_change_percent: -100,
              was_profitable: false,
            })
            .eq('id', pos.id)
            .eq('user_id', user.id)

          if (updateError) {
            console.error(`  ❌ Error updating expired ${pos.symbol}:`, updateError)
            errors++
            errorDetails.push({ symbol: pos.symbol, error: updateError.message })
            continue
          }

          console.log(`  ✅ Updated ${pos.symbol} - expired (worthless)`)
          updated++
          continue
        }

        // Fetch current option price from yfinance
        // Format: SYMBOL + YY + MM + DD + C/P + strike*1000
        const year = expirationDate.getFullYear().toString().slice(2)
        const month = (expirationDate.getMonth() + 1).toString().padStart(2, '0')
        const day = expirationDate.getDate().toString().padStart(2, '0')
        const optionType = pos.option_type === 'call' ? 'C' : 'P'
        const strikeInt = Math.round(pos.strike * 1000)
        const ticker = `${pos.symbol}${year}${month}${day}${optionType}${strikeInt.toString().padStart(8, '0')}`

        console.log(`  🔍 Fetching current price for ${pos.symbol} (${ticker})`)

        // Use Python to fetch the most recent option price
        const { spawn } = await import('child_process')

        const pythonCode = `
import yfinance as yf
import sys

ticker = "${ticker}"

try:
    # Fetch recent data (last 5 trading days)
    data = yf.Ticker(ticker).history(period='5d')

    if data.empty:
        print("NO_DATA")
        sys.exit(0)

    # Get the most recent close price
    price = data['Close'].iloc[-1]

    print(f"PRICE:{price}")
except Exception as e:
    print(f"ERROR:{str(e)}")
`

        const python = spawn('python3', ['-c', pythonCode])

        let output = ''
        let errorOutput = ''

        await new Promise<void>((resolve) => {
          python.stdout.on('data', (data) => {
            output += data.toString()
          })

          python.stderr.on('data', (data) => {
            errorOutput += data.toString()
          })

          python.on('close', () => {
            resolve()
          })
        })

        if (output.includes('PRICE:')) {
          const currentPrice = parseFloat(output.split('PRICE:')[1].trim())
          const rawExitPrice = Number(pos.option_price ?? 0)
          const hasValidExitPrice = Number.isFinite(rawExitPrice) && rawExitPrice > 0
          const priceChange = hasValidExitPrice
            ? ((currentPrice - rawExitPrice) / rawExitPrice) * 100
            : null
          const wasProfitable = hasValidExitPrice ? currentPrice > rawExitPrice : null

          if (!hasValidExitPrice) {
            console.warn(`  ⚠️  ${pos.symbol} missing valid exit price, storing current price without percent change`)
          }

          const { error: updateError } = await supabase
            .from('rejected_options')
            .update({
              next_day_price: currentPrice,
              price_change_percent: priceChange,
              was_profitable: wasProfitable,
            })
            .eq('id', pos.id)
            .eq('user_id', user.id)

          if (updateError) {
            console.error(`  ❌ Error updating ${pos.symbol}:`, updateError)
            errors++
            errorDetails.push({ symbol: pos.symbol, error: updateError.message })
            continue
          }

          if (hasValidExitPrice && priceChange !== null && wasProfitable !== null) {
            console.log(
              `  ✅ Updated ${pos.symbol}: Sold at $${rawExitPrice.toFixed(2)}, now worth $${currentPrice.toFixed(2)} (${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}%)`
            )
          } else {
            console.log(
              `  ✅ Updated ${pos.symbol}: Current price $${currentPrice.toFixed(2)} (percent change unavailable)`
            )
          }
          updated++
        } else if (output.includes('NO_DATA')) {
          console.log(`  ⚠️  No data available for ${pos.symbol}, skipping`)
          skipped++
        } else {
          console.error(`  ❌ Failed to fetch ${pos.symbol}:`, errorOutput || output)
          errors++
          errorDetails.push({ symbol: pos.symbol, error: 'Failed to fetch price data' })
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`  ❌ Error processing ${pos.symbol}:`, errorMsg)
        errors++
        errorDetails.push({ symbol: pos.symbol, error: errorMsg })
      }
    }

    console.log(`✅ Update complete: ${updated} updated, ${skipped} skipped, ${errors} errors`)

    return jsonWithCors(request, {
      success: true,
      message: `Updated ${updated} positions`,
      updated,
      skipped,
      errors,
      errorDetails: errors > 0 ? errorDetails : undefined,
    }, undefined, ALLOWED_METHODS)
  } catch (error) {
    console.error('Update error:', error)
    return jsonWithCors(
      request,
      {
        error: 'Failed to update performance data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
      ALLOWED_METHODS,
    )
  }
}
