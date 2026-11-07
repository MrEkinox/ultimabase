// The unit tests share their modules within a worker (D-304): after each
// file, what it stubbed is put back, so the next file starts clean.
import { afterAll, vi } from 'vitest'

afterAll(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
	vi.useRealTimers()
})
