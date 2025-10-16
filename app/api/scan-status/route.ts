import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Scan Status API - Shows cache age and next scan time
 *
 * Returns metadata about cached scans so UI can show countdown timer
 * and inform users when fresh data will be available.
 */

export const runtime = "nodejs"
export const maxDuration = 5

interface ScanStatus {
  strict: CacheStatus
  relaxed: CacheStatus
  cronSchedule: {
    strict: string[]
    relaxed: string[]
  }
}

interface CacheStatus {
  available: boolean
  ageMinutes: number
  opportunityCount: number
  scanTimestamp: string | null
  nextScanIn: number | null  // seconds until next scan
  isStale: boolean
}

function getNextScanTime(currentMinute: number, isRelaxed: boolean): number {
  // Strict mode: runs at :00, :10, :20, :30, :40, :50
  // Relaxed mode: runs at :05, :15, :25, :35, :45, :55

  const offset = isRelaxed ? 5 : 0
  const interval = 10

  // Find next scan minute
  let nextScanMinute = currentMinute
  while (true) {
    if ((nextScanMinute - offset) % interval === 0 && nextScanMinute >= currentMinute) {
      break
    }
    nextScanMinute++
    if (nextScanMinute >= 60) {
      nextScanMinute = offset
      break
    }
  }

  // Calculate seconds until next scan
  let minutesUntil = nextScanMinute - currentMinute
  if (minutesUntil < 0) {
    minutesUntil += 60
  }

  return minutesUntil * 60
}

export async function GET() {
  try {
    const supabase = await createClient()

    // Get status for both modes
    const [strictData, relaxedData] = await Promise.all([
      supabase.rpc('get_latest_scan', { p_filter_mode: 'strict' }).single(),
      supabase.rpc('get_latest_scan', { p_filter_mode: 'relaxed' }).single()
    ])

    const now = new Date()
    const currentMinute = now.getMinutes()
    const currentSecond = now.getSeconds()

    // Type-safe data extraction
    const strictRow = strictData.data as Record<string, unknown> | null
    const relaxedRow = relaxedData.data as Record<string, unknown> | null

    const strictAgeMinutes = typeof strictRow?.age_minutes === 'number' ? strictRow.age_minutes : 0
    const relaxedAgeMinutes = typeof relaxedRow?.age_minutes === 'number' ? relaxedRow.age_minutes : 0

    // Extract opportunity counts (JSONB arrays from Supabase)
    const strictOpps = (strictRow?.opportunities as unknown[]) || []
    const relaxedOpps = (relaxedRow?.opportunities as unknown[]) || []

    const strictStatus: CacheStatus = {
      available: !strictData.error && !!strictData.data,
      ageMinutes: strictAgeMinutes,
      opportunityCount: strictOpps.length || 0,
      scanTimestamp: typeof strictRow?.scan_timestamp === 'string' ? strictRow.scan_timestamp : null,
      nextScanIn: getNextScanTime(currentMinute, false) - currentSecond,
      isStale: strictAgeMinutes > 15
    }

    const relaxedStatus: CacheStatus = {
      available: !relaxedData.error && !!relaxedData.data,
      ageMinutes: relaxedAgeMinutes,
      opportunityCount: relaxedOpps.length || 0,
      scanTimestamp: typeof relaxedRow?.scan_timestamp === 'string' ? relaxedRow.scan_timestamp : null,
      nextScanIn: getNextScanTime(currentMinute, true) - currentSecond,
      isStale: relaxedAgeMinutes > 15
    }

    // If next scan is negative or very small, assume it's running now
    if (strictStatus.nextScanIn && strictStatus.nextScanIn < 30) {
      strictStatus.nextScanIn = 0 // Scan is running or about to run
    }
    if (relaxedStatus.nextScanIn && relaxedStatus.nextScanIn < 30) {
      relaxedStatus.nextScanIn = 0
    }

    const status: ScanStatus = {
      strict: strictStatus,
      relaxed: relaxedStatus,
      cronSchedule: {
        strict: ['Every 10 minutes at :00, :10, :20, :30, :40, :50'],
        relaxed: ['Every 10 minutes at :05, :15, :25, :35, :45, :55']
      }
    }

    return NextResponse.json(status)

  } catch (error) {
    console.error('Error fetching scan status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch scan status' },
      { status: 500 }
    )
  }
}
