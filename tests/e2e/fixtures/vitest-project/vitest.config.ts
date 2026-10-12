import { ultimabaseTesting } from '@ultimabase/testing/vitest'
import { defineConfig } from 'vitest/config'

// The configuration an application writes (ADR-0327).
export default defineConfig({
	test: { ...ultimabaseTesting(), include: ['*.check.ts'] },
})
