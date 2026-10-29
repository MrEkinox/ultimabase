import { readdirSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// PostgreSQL tests run in their own command so `yarn validate` stays fast (D-06).
const postgresTests = '**/*.postgres.test.ts'
// S3 tests need SeaweedFS from `compose.yaml` (D-152).
const s3Tests = '**/*.s3.test.ts'

// Each package covers at least 90 % of its production code on every
// measure, on its own (D-85).
const floor = { lines: 90, statements: 90, functions: 90, branches: 90 }
// Packages only `yarn test:postgres` exercises; it sets COVERAGE to measure
// them, and `yarn test` leaves them out (D-98).
const postgresOnly = new Set(['postgres'])
const measured = process.env['COVERAGE'] === 'postgres'
const packages = readdirSync('packages', { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.filter((name) => postgresOnly.has(name) === measured)

export default defineConfig({
	test: {
		// Vitest resolves `graphql` with the `development` condition; loading
		// graphql-http and graphql-ws through it too keeps one copy of `graphql`.
		server: { deps: { inline: ['graphql-http', 'graphql-ws'] } },
		coverage: {
			provider: 'v8',
			include: packages.map((name) => `packages/${name}/src/**/*.ts`),
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
					exclude: ['**/node_modules/**', postgresTests, s3Tests],
				},
			},
			{
				test: {
					name: 'postgres',
					include: [postgresTests],
					// A zone whose old dates have an offset in seconds, which a
					// date written in local time loses.
					env: { TZ: 'Europe/Paris' },
					exclude: ['**/node_modules/**'],
				},
			},
			{
				test: {
					name: 's3',
					include: [s3Tests],
					exclude: ['**/node_modules/**'],
				},
			},
		],
	},
})
