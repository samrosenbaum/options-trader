import { afterEach, beforeEach, vi } from "vitest"

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})
