// Portfolio balancing utilities

export type PositionBiasKey = 'long_call' | 'long_put' | 'short_call' | 'short_put'

export interface TargetMix {
  key: PositionBiasKey
  percentage: number
  description: string
}

export const TARGET_MIX_TEMPLATE: TargetMix[] = [
  {
    key: 'long_call',
    percentage: 20,
    description: 'Keeps directional upside participation without over-levering.',
  },
  {
    key: 'long_put',
    percentage: 30,
    description: 'Protects drawdowns and balances short premium risk.',
  },
  {
    key: 'short_call',
    percentage: 25,
    description: 'Harvests theta while keeping upside obligations manageable.',
  },
  {
    key: 'short_put',
    percentage: 25,
    description: 'Generates income with bullish bias and cash-secured footing.',
  },
]

export interface PortfolioGap {
  key: PositionBiasKey
  percentage: number
  actual: number
  delta: number
  description: string
}

/**
 * Determines the position bias key based on option type and whether it's long or short
 */
export function getPositionBiasKey(optionType: 'call' | 'put', isLong: boolean): PositionBiasKey {
  if (optionType === 'call') {
    return isLong ? 'long_call' : 'short_call'
  } else {
    return isLong ? 'long_put' : 'short_put'
  }
}

/**
 * Calculate portfolio gaps based on current positions
 */
export function calculatePortfolioGaps(positions: Array<{
  option_type: string
  contracts: number
  status: string
}>): PortfolioGap[] {
  // Count contracts by type
  const contractCounts: Record<PositionBiasKey, number> = {
    long_call: 0,
    long_put: 0,
    short_call: 0,
    short_put: 0,
  }

  let totalContracts = 0

  positions.forEach(pos => {
    if (pos.status === 'open') {
      const optionType = pos.option_type.toLowerCase() as 'call' | 'put'
      // For now, assume all positions are long (you can enhance this later)
      const key = getPositionBiasKey(optionType, true)
      contractCounts[key] += pos.contracts
      totalContracts += pos.contracts
    }
  })

  // Calculate percentages
  const actualPercentages: Record<PositionBiasKey, number> = {
    long_call: 0,
    long_put: 0,
    short_call: 0,
    short_put: 0,
  }

  if (totalContracts > 0) {
    Object.keys(contractCounts).forEach(key => {
      actualPercentages[key as PositionBiasKey] =
        (contractCounts[key as PositionBiasKey] / totalContracts) * 100
    })
  }

  // Calculate gaps
  return TARGET_MIX_TEMPLATE.map(target => ({
    key: target.key,
    percentage: target.percentage,
    actual: actualPercentages[target.key],
    delta: actualPercentages[target.key] - target.percentage,
    description: target.description,
  }))
}

/**
 * Get position types that are significantly below target (need more)
 * Returns types that are 5+ percentage points below target
 */
export function getNeededPositionTypes(gaps: PortfolioGap[]): PositionBiasKey[] {
  return gaps
    .filter(gap => gap.delta < -5) // More than 5% below target
    .sort((a, b) => a.delta - b.delta) // Sort by most needed first
    .map(gap => gap.key)
}

/**
 * Check if a watchlist item would help balance the portfolio
 */
export function wouldBalancePortfolio(
  optionType: 'call' | 'put',
  neededTypes: PositionBiasKey[]
): boolean {
  // For watchlist items, assume they would be bought (long positions)
  const itemType = getPositionBiasKey(optionType, true)
  return neededTypes.includes(itemType)
}

/**
 * Get the gap for a specific position type
 */
export function getGapForType(
  optionType: 'call' | 'put',
  gaps: PortfolioGap[]
): PortfolioGap | undefined {
  // Assume long position
  const itemType = getPositionBiasKey(optionType, true)
  return gaps.find(gap => gap.key === itemType)
}
