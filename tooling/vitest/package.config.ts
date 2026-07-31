import process from 'node:process'
import { defineConfig, type ViteUserConfig } from 'vitest/config'

const config: ViteUserConfig = defineConfig({
	// Keep package commands scoped to the workspace that invoked Vitest.
	root: process.cwd(),
	test: {
		fileParallelism: true,
		// Each workspace discovers colocated units and package-level behavior only.
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		pool: 'forks',
		typecheck: {
			enabled: true,
			include: ['src/**/*.test-d.ts', 'tests/**/*.test-d.ts'],
			only: false,
			tsconfig: '../../tooling/tsconfig/test.json',
		},
	},
})

export default config
