type OptionType = "call" | "put"

interface OptionInputs {
  type: OptionType
  stockPrice: number
  strike: number
  impliedVolatility: number
  expiration: string | Date
  riskFreeRate?: number
}

export interface OptionGreeks {
  delta: number
  gamma: number
  theta: number
  vega: number
}

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI)

function normPdf(x: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * x * x)
}

function erf(x: number): number {
  // Abramowitz and Stegun formula 7.1.26 approximation
  const sign = Math.sign(x) || 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const coefficients = [
    0.254829592,
    -0.284496736,
    1.421413741,
    -1.453152027,
    1.061405429
  ]

  const poly = coefficients.reduce((acc, coeff) => acc * t + coeff, 0)
  const expTerm = Math.exp(-ax * ax)
  const approximation = 1 - poly * t * expTerm

  return sign * approximation
}

function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2))
}

function toFiniteNumber(value: unknown): number | undefined {
  const num =
    typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : Number.NaN
  return Number.isFinite(num) ? num : undefined
}

function normalizeImpliedVol(volatility: unknown): number | undefined {
  const value = toFiniteNumber(volatility)
  if (value === undefined) {
    return undefined
  }
  if (value <= 0) {
    return undefined
  }
  return value > 1 ? value / 100 : value
}

function parseExpiration(expiration: string | Date): Date | undefined {
  if (expiration instanceof Date && !Number.isNaN(expiration.getTime())) {
    return expiration
  }
  if (typeof expiration === "string" && expiration.trim().length > 0) {
    const parsed = new Date(expiration)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }
  return undefined
}

function yearsUntil(expiration: Date): number {
  const milliseconds = expiration.getTime() - Date.now()
  const seconds = milliseconds / 1000
  const years = seconds / (365 * 24 * 60 * 60)
  return Math.max(years, 0)
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function computeOptionGreeks(inputs: OptionInputs): OptionGreeks | null {
  const stockPrice = toFiniteNumber(inputs.stockPrice)
  const strike = toFiniteNumber(inputs.strike)
  const sigma = normalizeImpliedVol(inputs.impliedVolatility) ?? 0.3
  const expiration = parseExpiration(inputs.expiration)
  const riskFreeRate = inputs.riskFreeRate ?? 0.05

  if (!stockPrice || !strike || !sigma || !expiration) {
    return null
  }

  const timeToExpiration = yearsUntil(expiration)
  if (timeToExpiration <= 0) {
    return null
  }

  const sqrtT = Math.sqrt(timeToExpiration)
  const adjustedSigma = Math.max(sigma, 1e-6)
  const d1 =
    (Math.log(stockPrice / strike) + (riskFreeRate + 0.5 * adjustedSigma ** 2) * timeToExpiration) /
    (adjustedSigma * sqrtT)
  const d2 = d1 - adjustedSigma * sqrtT

  const delta = inputs.type === "call" ? normCdf(d1) : normCdf(d1) - 1
  const theta =
    inputs.type === "call"
      ? (-(stockPrice * normPdf(d1) * adjustedSigma) / (2 * sqrtT) -
          riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiration) * normCdf(d2)) /
        365
      : (-(stockPrice * normPdf(d1) * adjustedSigma) / (2 * sqrtT) +
          riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiration) * normCdf(-d2)) /
        365

  const gamma = normPdf(d1) / (stockPrice * adjustedSigma * sqrtT)
  const vega = (stockPrice * normPdf(d1) * sqrtT) / 100

  return {
    delta: round(delta, 4),
    gamma: round(gamma, 6),
    theta: round(theta, 4),
    vega: round(vega, 4)
  }
}

interface PartialGreeks {
  delta?: number
  gamma?: number
  theta?: number
  vega?: number
}

interface ContractLike {
  option_type?: OptionType
  strike?: number
  expiration?: string
  implied_volatility?: number
  stock_price?: number
}

function mergeGreeks(preferred: PartialGreeks | undefined, fallback: OptionGreeks | null): OptionGreeks {
  const base: OptionGreeks = {
    delta: 0,
    gamma: 0,
    theta: 0,
    vega: 0
  }

  const sanitized = { ...base }
  if (preferred) {
    const delta = toFiniteNumber(preferred.delta)
    const gamma = toFiniteNumber(preferred.gamma)
    const theta = toFiniteNumber(preferred.theta)
    const vega = toFiniteNumber(preferred.vega)
    if (delta !== undefined) sanitized.delta = delta
    if (gamma !== undefined) sanitized.gamma = gamma
    if (theta !== undefined) sanitized.theta = theta
    if (vega !== undefined) sanitized.vega = vega
  }

  if (!fallback) {
    return sanitized
  }

  return {
    delta: sanitized.delta || fallback.delta,
    gamma: sanitized.gamma || fallback.gamma,
    theta: sanitized.theta || fallback.theta,
    vega: sanitized.vega || fallback.vega
  }
}

export function ensureOptionGreeks(
  existing: PartialGreeks | undefined,
  contract: ContractLike | undefined
): OptionGreeks {
  const needsFallback =
    !existing ||
    [existing.gamma, existing.vega, existing.delta, existing.theta].some((value) => {
      const numeric = toFiniteNumber(value)
      return numeric === undefined || numeric === 0
    })

  if (!needsFallback || !contract) {
    return mergeGreeks(existing, null)
  }

  const computed = computeOptionGreeks({
    type: contract.option_type ?? "call",
    stockPrice: contract.stock_price ?? 0,
    strike: contract.strike ?? 0,
    impliedVolatility: contract.implied_volatility ?? 0,
    expiration: contract.expiration ?? "",
    riskFreeRate: 0.05
  })

  return mergeGreeks(existing, computed)
}
