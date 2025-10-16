/**
 * Market hours utilities
 */

export interface MarketHoursInfo {
  isOpen: boolean
  nextOpen: Date | null
  message: string
}

/**
 * Check if US stock market is currently open
 * Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday (excluding holidays)
 */
export function isMarketOpen(): MarketHoursInfo {
  const now = new Date()

  // Convert to ET (UTC-5 or UTC-4 depending on DST)
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))

  const day = etTime.getDay() // 0 = Sunday, 6 = Saturday
  const hours = etTime.getHours()
  const minutes = etTime.getMinutes()
  const totalMinutes = hours * 60 + minutes

  // Weekend
  if (day === 0 || day === 6) {
    const nextMonday = new Date(etTime)
    nextMonday.setDate(etTime.getDate() + (day === 0 ? 1 : 2))
    nextMonday.setHours(9, 30, 0, 0)

    return {
      isOpen: false,
      nextOpen: nextMonday,
      message: "Markets are closed for the weekend. Trading resumes Monday at 9:30 AM ET."
    }
  }

  // Market hours: 9:30 AM - 4:00 PM ET
  const marketOpen = 9 * 60 + 30  // 9:30 AM = 570 minutes
  const marketClose = 16 * 60      // 4:00 PM = 960 minutes

  // Before market open
  if (totalMinutes < marketOpen) {
    const openTime = new Date(etTime)
    openTime.setHours(9, 30, 0, 0)

    return {
      isOpen: false,
      nextOpen: openTime,
      message: `Markets open today at 9:30 AM ET (in ${formatTimeUntil(openTime, now)})`
    }
  }

  // After market close
  if (totalMinutes >= marketClose) {
    const tomorrow = new Date(etTime)
    tomorrow.setDate(etTime.getDate() + 1)
    tomorrow.setHours(9, 30, 0, 0)

    // If tomorrow is Saturday, jump to Monday
    if (tomorrow.getDay() === 6) {
      tomorrow.setDate(tomorrow.getDate() + 2)
    }

    return {
      isOpen: false,
      nextOpen: tomorrow,
      message: `Markets are closed. Trading resumes ${tomorrow.getDay() === etTime.getDay() + 1 ? 'tomorrow' : 'Monday'} at 9:30 AM ET.`
    }
  }

  // Market is open!
  const closeTime = new Date(etTime)
  closeTime.setHours(16, 0, 0, 0)

  return {
    isOpen: true,
    nextOpen: null,
    message: `Markets are open! Closes at 4:00 PM ET (in ${formatTimeUntil(closeTime, now)})`
  }
}

function formatTimeUntil(target: Date, from: Date): string {
  const diffMs = target.getTime() - from.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 60) {
    return `${diffMins} minutes`
  }

  const hours = Math.floor(diffMins / 60)
  const mins = diffMins % 60

  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`
  }

  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''}`
}
