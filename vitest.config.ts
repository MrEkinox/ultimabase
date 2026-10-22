import { readdirSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// PostgreSQL tests run in their own command so `yarn validate` stays fast (D-06).
const postgresTests = '**/*.postgres.test.ts'

// Each package covers at least 90 % of its production code on every
// measure, on its own (D-85).
const floor = { lines: 90, statements: 90, functions: 90, branches: 90 }
const packages = readdirSync('packages', { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['packages/*/src/**/*.ts'],
			exclude: ['**/*.test.ts', '**/test/**'],
			reporter: ['text-summary', 'text'],
			thresholds: Object.fromEntries(
				packages.map((name) => [`packages/${name}/src/**`, floor]),
			),
		},
		projects: [
			{
				test: {
					name: 'unit',
					include: ['**/*.test.ts'],
					exclude: ['**/node_modules/**', postgresTests],
				},
			},
			{
				test: {
					name: 'postgres',
					include: [postgresTests],
					exclude: ['**/node_modules/**'],
				},
			},
		],
	},
})
