import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	defineConfig,
	type TestProjectConfiguration,
	type ViteUserConfig,
} from 'vitest/config'

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url))
const sourcePackageAliases = Object.fromEntries(
	[
		'access-plugin',
		'acl-permissions-plugin',
		'acl-postgres-plugin',
		'core',
		'hooks-plugin',
		'pg-vector-plugin',
		'plugin-kit',
		'postgres-plugin',
		'roles-plugin',
		'shared',
		'testing',
		'typegen',
	].map((packageName) => [
		`@ultimabase/${packageName}`,
		path.join(workspaceRoot, 'packages', packageName, 'src', 'index.ts'),
	]),
)

const testProjects: TestProjectConfiguration[] = [
	{
		extends: true,
		test: {
			include: [
				'packages/*/src/**/*.test.ts',
				'packages/*/tests/**/*.test.ts',
				'tooling/documentation/**/*.test.ts',
				'tooling/eslint/**/*.test.ts',
				'tooling/issues/**/*.test.ts',
			],
			name: 'unit',
			// Language-service fixtures need headroom when coverage instruments Core.
			testTimeout: 20_000,
		},
	},
	{
		extends: true,
		resolve: { alias: sourcePackageAliases },
		test: {
			exclude: [
				'tests/e2e/**/*.postgres.e2e.test.ts',
				'tests/e2e/package-archives.e2e.test.ts',
			],
			include: ['tests/e2e/**/*.e2e.test.ts'],
			name: 'coverage-e2e',
		},
	},
	{
		extends: true,
		resolve: { alias: sourcePackageAliases },
		test: {
			globalSetup: ['./tests/e2e/postgres.global-setup.ts'],
			include: ['tests/e2e/**/*.postgres.e2e.test.ts'],
			name: 'coverage-postgres-e2e',
		},
	},
	{
		extends: true,
		test: {
			exclude: ['tests/e2e/**/*.postgres.e2e.test.ts'],
			include: ['tests/e2e/**/*.e2e.test.ts'],
			name: 'e2e',
		},
	},
	{
		extends: true,
		test: {
			globalSetup: ['./tests/e2e/postgres.global-setup.ts'],
			include: ['tests/e2e/**/*.postgres.e2e.test.ts'],
			name: 'postgres-e2e',
		},
	},
	{
		extends: true,
		test: {
			fileParallelism: false,
			include: ['tests/performance/**/*.performance.test.ts'],
			name: 'performance',
		},
		resolve: { alias: sourcePackageAliases },
	},
	{
		extends: true,
		test: {
			include: [],
			name: 'types',
			typecheck: {
				enabled: true,
				include: [
					'packages/*/src/**/*.test-d.ts',
					'packages/*/tests/**/*.test-d.ts',
				],
				only: true,
				tsconfig: './tooling/tsconfig/test.json',
			},
		},
	},
]

const config: ViteUserConfig = defineConfig({
	test: {
		coverage: {
			// Test modules live beside sources but must not inflate production coverage.
			exclude: [
				'**/dist/**',
				'**/*.d.ts',
				'**/*.generated.ts',
				'**/*.test-d.ts',
				'**/*.test.ts',
			],
			include: ['packages/*/src/**/*.ts'],
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			thresholds: {
				'packages/access-plugin/src/**': {
					branches: 71,
					functions: 88,
					lines: 83,
					statements: 83,
				},
				'packages/core/src/query/filters/relation.ts': {
					branches: 98,
					functions: 100,
					lines: 98,
					statements: 98,
				},
				'packages/hooks-plugin/src/**': {
					branches: 81,
					functions: 94,
					lines: 90,
					statements: 90,
				},
				branches: 80,
				functions: 90,
				lines: 88,
				statements: 88,
			},
		},
		fileParallelism: true,
		pool: 'forks',
		// Root projects separate package ownership from cross-package behavior.
		projects: testProjects,
	},
})

export default config
