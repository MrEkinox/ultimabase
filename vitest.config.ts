import { defineConfig } from 'vitest/config'

// PostgreSQL tests run in their own command so `yarn validate` stays fast (D-06).
const postgresTests = '**/*.postgres.test.ts'

export default defineConfig({
	test: {
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
