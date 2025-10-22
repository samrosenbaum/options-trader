import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * CSV Import for Bulk Position Upload
 *
 * Supports Robinhood CSV format and common variations:
 * - Symbol, Type (Call/Put), Strike, Expiration, Quantity, Entry Price
 * - Also handles: Option Symbol, Contracts, Average Price, etc.
 */

interface ParsedPosition {
  symbol: string
  optionType: "call" | "put"
  strike: number
  expiration: string
  contracts: number
  entryPrice: number
  entryDate?: string
  notes?: string
}

function parseCSV(csvText: string): ParsedPosition[] {
  const lines = csvText.trim().split('\n')

  if (lines.length < 2) {
    throw new Error("CSV must have at least a header row and one data row")
  }

  // Parse header (case-insensitive, flexible matching)
  const header = lines[0].split(',').map(h => h.trim().toLowerCase())

  // Find column indices (flexible matching for different CSV formats)
  const symbolIdx = header.findIndex(h =>
    h.includes('symbol') || h.includes('ticker') || h.includes('underlying')
  )
  const typeIdx = header.findIndex(h =>
    h.includes('type') || h.includes('call/put') || h.includes('option type')
  )
  const strikeIdx = header.findIndex(h =>
    h.includes('strike') || h.includes('strike price')
  )
  const expirationIdx = header.findIndex(h =>
    h.includes('expiration') || h.includes('exp') || h.includes('expiry')
  )
  const quantityIdx = header.findIndex(h =>
    h.includes('quantity') || h.includes('contracts') || h.includes('qty')
  )
  const priceIdx = header.findIndex(h =>
    h.includes('entry price') || h.includes('average price') ||
    h.includes('avg price') || h.includes('cost')
  )
  const dateIdx = header.findIndex(h =>
    h.includes('entry date') || h.includes('purchase date') || h.includes('date')
  )

  // Validate required columns
  if (symbolIdx === -1) throw new Error("CSV must have 'Symbol' column")
  if (typeIdx === -1) throw new Error("CSV must have 'Type' or 'Call/Put' column")
  if (strikeIdx === -1) throw new Error("CSV must have 'Strike' or 'Strike Price' column")
  if (expirationIdx === -1) throw new Error("CSV must have 'Expiration' column")
  if (quantityIdx === -1) throw new Error("CSV must have 'Quantity' or 'Contracts' column")
  if (priceIdx === -1) throw new Error("CSV must have 'Entry Price' or 'Average Price' column")

  const positions: ParsedPosition[] = []

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue // Skip empty lines

    const cols = line.split(',').map(c => c.trim())

    try {
      // Parse symbol
      const symbol = cols[symbolIdx].toUpperCase().replace(/[^A-Z]/g, '')
      if (!symbol) {
        console.warn(`Row ${i + 1}: Invalid symbol, skipping`)
        continue
      }

      // Parse option type
      const typeStr = cols[typeIdx].toLowerCase()
      let optionType: "call" | "put"
      if (typeStr.includes('call') || typeStr === 'c') {
        optionType = "call"
      } else if (typeStr.includes('put') || typeStr === 'p') {
        optionType = "put"
      } else {
        console.warn(`Row ${i + 1}: Invalid type '${typeStr}', skipping`)
        continue
      }

      // Parse strike
      const strikeStr = cols[strikeIdx].replace(/[$,]/g, '')
      const strike = parseFloat(strikeStr)
      if (!strike || strike <= 0) {
        console.warn(`Row ${i + 1}: Invalid strike '${strikeStr}', skipping`)
        continue
      }

      // Parse expiration (flexible date formats)
      let expiration = cols[expirationIdx]
      // Try to normalize date format to YYYY-MM-DD
      try {
        const date = new Date(expiration)
        if (!isNaN(date.getTime())) {
          expiration = date.toISOString().split('T')[0]
        }
      } catch {
        // Keep original if parsing fails
      }

      // Parse quantity/contracts
      const quantityStr = cols[quantityIdx].replace(/[^0-9.-]/g, '')
      const contracts = parseInt(quantityStr, 10)
      if (!contracts || contracts === 0) {
        console.warn(`Row ${i + 1}: Invalid quantity '${quantityStr}', skipping`)
        continue
      }

      // Parse entry price (per contract in dollars, e.g., $2.10 = $210 total)
      const priceStr = cols[priceIdx].replace(/[$,]/g, '')
      let entryPrice = parseFloat(priceStr)
      if (!entryPrice || entryPrice < 0) {
        console.warn(`Row ${i + 1}: Invalid price '${priceStr}', skipping`)
        continue
      }

      // If price looks like per-share (< $50), it's probably correct
      // If price is very large (> $10,000), it might be total cost, divide by 100*contracts
      if (entryPrice > 10000) {
        entryPrice = entryPrice / (100 * Math.abs(contracts))
      }

      // Parse entry date (optional)
      let entryDate: string | undefined
      if (dateIdx !== -1 && cols[dateIdx]) {
        try {
          const date = new Date(cols[dateIdx])
          if (!isNaN(date.getTime())) {
            entryDate = date.toISOString().split('T')[0]
          }
        } catch {
          // Skip if date parsing fails
        }
      }

      positions.push({
        symbol,
        optionType,
        strike,
        expiration,
        contracts,
        entryPrice,
        entryDate,
        notes: `Imported from CSV on ${new Date().toISOString().split('T')[0]}`
      })

    } catch (err) {
      console.warn(`Row ${i + 1}: Error parsing, skipping`, err)
      continue
    }
  }

  return positions
}

export async function POST(request: Request) {
  try {
    // Get user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get CSV text from request
    const body = await request.json()
    const { csvText } = body

    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json(
        { error: "CSV text required" },
        { status: 400 }
      )
    }

    // Parse CSV
    let positions: ParsedPosition[]
    try {
      positions = parseCSV(csvText)
    } catch (parseError) {
      return NextResponse.json(
        {
          error: "Failed to parse CSV",
          details: parseError instanceof Error ? parseError.message : String(parseError)
        },
        { status: 400 }
      )
    }

    if (positions.length === 0) {
      return NextResponse.json(
        { error: "No valid positions found in CSV" },
        { status: 400 }
      )
    }

    // Insert positions to database
    const positionsToInsert = positions.map(pos => ({
      user_id: user.id,
      symbol: pos.symbol,
      option_type: pos.optionType,
      strike: pos.strike,
      expiration: pos.expiration,
      contracts: pos.contracts,
      entry_price: pos.entryPrice,
      entry_date: pos.entryDate || new Date().toISOString().split('T')[0],
      status: 'open',
      notes: pos.notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase
      .from('positions')
      .insert(positionsToInsert)
      .select()

    if (error) {
      console.error("Error inserting positions:", error)
      return NextResponse.json(
        { error: "Failed to save positions", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      imported: data?.length || 0,
      positions: data,
      message: `Successfully imported ${data?.length || 0} position${(data?.length || 0) !== 1 ? 's' : ''}`
    })

  } catch (err) {
    console.error("Error importing CSV:", err)
    return NextResponse.json(
      {
        error: "Failed to import positions",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
