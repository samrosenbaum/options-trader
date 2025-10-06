import { ScanRequest, ScanResponse } from "./types"

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_RETRIES = 3
const RETRY_DELAY_MS = 400

function getApiBaseUrl(): string {
  return process.env.SCORING_API_URL || "http://127.0.0.1:8000"
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function performRequest(url: string, payload: ScanRequest, timeoutMs: number): Promise<ScanResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`Scoring service responded with ${response.status}: ${detail || response.statusText}`)
    }

    return (await response.json()) as ScanResponse
  } finally {
    clearTimeout(timeout)
  }
}

export async function requestSignals(
  payload: ScanRequest,
  options?: { timeoutMs?: number; retries?: number },
): Promise<ScanResponse> {
  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = options?.retries ?? DEFAULT_RETRIES
  const endpoint = `${getApiBaseUrl().replace(/\/$/, "")}/scan`

  let lastError: unknown

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await performRequest(endpoint, payload, timeout)
    } catch (error) {
      lastError = error
      if (attempt === retries - 1) {
        break
      }
      await delay(RETRY_DELAY_MS * (attempt + 1))
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to call scoring service")
}
