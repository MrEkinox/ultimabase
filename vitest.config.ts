import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
		},
		include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
		passWithNoTests: true,
		pool: 'forks',
	},
})
