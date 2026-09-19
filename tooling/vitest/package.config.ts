import path from 'node:path'
import process from 'node:process'
import { defineConfig, type ViteUserConfig } from 'vitest/config'

import { graphqlRuntimeDependencies } from './runtime.js'

const packageRoot = process.cwd()
const postgresSetup = path.resolve(
	import.meta.dirname,
	'../../tests/fixtures/postgres.global-setup.ts',
)

const config: ViteUserConfig = defineConfig({
	root: packageRoot,
	test: {
		fileParallelism: true,
		pool: 'forks',
		server: { deps: { inline: graphqlRuntimeDependencies } },
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
					// Built-export and database tests must never enter the fast unit suite.
					exclude: ['**/*.e2e.test.ts'],
					testTimeout: 30_000,
				},
			},
			{
				extends: true,
				test: {
					name: 'types',
					include: [],
					typecheck: {
						enabled: true,
						only: true,
						include: ['src/**/*.test-d.ts', 'tests/**/*.test-d.ts'],
						// Root files belong only to this package, not every test in the repo.
						tsconfig: './tsconfig.test.json',
					},
				},
			},
			{
				extends: true,
				test: {
					name: 'e2e',
					include: ['tests/e2e/**/*.e2e.test.ts'],
					exclude: ['**/*.postgres.e2e.test.ts'],
				},
			},
			{
				extends: true,
				test: {
					name: 'postgres-e2e',
					include: ['tests/e2e/**/*.postgres.e2e.test.ts'],
					globalSetup: [postgresSetup],
				},
			},
		],
	},
})

export default config
