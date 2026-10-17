import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	defineConfig,
	type TestProjectConfiguration,
	type ViteUserConfig,
} from 'vitest/config'

import { builtOnlyE2eSuites } from './tooling/vitest/built-only-e2e.js'
import { isolatedE2eSuites } from './tooling/vitest/isolated-e2e.js'
import { coverageThresholds } from './tooling/vitest/package-coverage.js'
import { graphqlRuntimeDependencies } from './tooling/vitest/runtime.js'

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url))
const sourcePackageAliasEntries: readonly (readonly [string, string])[] = [
	// Subpaths come first: an alias also matches its `<name>/...` prefix.
	[
		'@ultimabase/core/plugin',
		path.join(workspaceRoot, 'packages', 'core', 'src', 'plugin.ts'),
	],
	[
		'@ultimabase/testing/plugins',
		path.join(workspaceRoot, 'packages', 'testing', 'src', 'plugins.ts'),
	],
	[
		'@ultimabase/testing/vitest',
		path.join(workspaceRoot, 'packages', 'testing', 'src', 'vitest.ts'),
	],
	...[
		'access-plugin',
		'acl-permissions-plugin',
		'api-server',
		'auth-password',
		'auth-plugin',
		'core',
		'graphql-explorer-plugin',
		'graphql-http',
		'graphql-plugin',
		'graphql-yoga-plugin',
		'hono-server-plugin',
		'hooks-plugin',
		'http-plugin',
		'pg-vector-plugin',
		'plugin-kit',
		'postgres-plugin',
		'roles-plugin',
		'rest-plugin',
		'shared',
		'soft-delete-plugin',
		'testing',
		'validation-plugin',
	].map(
		(packageName) =>
			[
				`@ultimabase/${packageName}`,
				path.join(workspaceRoot, 'packages', packageName, 'src', 'index.ts'),
			] as const,
	),
]
const sourcePackageAliases: Readonly<Record<string, string>> =
	Object.fromEntries(sourcePackageAliasEntries)

const testProjects: TestProjectConfiguration[] = [
	{
		extends: true,
		root: workspaceRoot,
		test: {
			include: ['apps/website/tests/**/*.content.test.ts'],
			name: 'website-content',
		},
	},
	{
		extends: true,
		root: workspaceRoot,
		test: {
			fileParallelism: false,
			include: ['apps/website/tests/**/*.browser.test.ts'],
			name: 'website-browser',
			testTimeout: 60_000,
		},
	},
	{
		extends: true,
		test: {
			include: [
				'packages/*/src/**/*.test.ts',
				'packages/*/tests/**/*.test.ts',
				'tooling/ci/**/*.test.ts',
				'tooling/documentation/**/*.test.ts',
				'tooling/eslint/**/*.test.ts',
				'tooling/vitest/**/*.test.ts',
			],
			exclude: ['**/*.e2e.test.ts', '**/*.performance.test.ts'],
			name: 'unit',
			// Language-service fixtures need headroom when coverage instruments Core,
			// especially on resource-constrained hosted runners.
			testTimeout: 30_000,
		},
	},
	{
		extends: true,
		resolve: { alias: sourcePackageAliases },
		test: {
			// Package-owned E2E from sources: they count toward their package's
			// coverage. Transversal suites never do.
			exclude: [
				'packages/*/tests/e2e/**/*.postgres.e2e.test.ts',
				...builtOnlyE2eSuites,
			],
			include: ['packages/*/tests/e2e/**/*.e2e.test.ts'],
			name: 'coverage-e2e',
			// Source instrumentation needs headroom on resource-constrained hosted runners:
			// the instrumented language-service checks took 10 to 21 s on CI runners, so
			// they get the same 30 s budget as the unit project's fixtures.
			testTimeout: 30_000,
		},
	},
	{
		extends: true,
		resolve: { alias: sourcePackageAliases },
		test: {
			globalSetup: ['./tests/fixtures/postgres.global-setup.ts'],
			include: ['packages/*/tests/e2e/**/*.postgres.e2e.test.ts'],
			name: 'coverage-postgres-e2e',
			testTimeout: 20_000,
		},
	},
	{
		extends: true,
		test: {
			exclude: ['**/*.postgres.e2e.test.ts', ...isolatedE2eSuites],
			include: [
				'tests/e2e/**/*.e2e.test.ts',
				'packages/*/tests/e2e/**/*.e2e.test.ts',
			],
			name: 'e2e',
			// Packed language-service checks compete for CPU during the full E2E run.
			testTimeout: 20_000,
		},
	},
	{
		extends: true,
		test: {
			fileParallelism: false,
			include: [...isolatedE2eSuites],
			name: 'e2e-isolated',
			// Runs after the parallel E2E projects (group 0): these suites keep
			// their wall-clock budgets only on an otherwise idle CPU.
			sequence: { groupOrder: 1 },
			testTimeout: 20_000,
		},
	},
	{
		extends: true,
		test: {
			globalSetup: ['./tests/fixtures/postgres.global-setup.ts'],
			include: [
				'tests/e2e/**/*.postgres.e2e.test.ts',
				'packages/*/tests/e2e/**/*.postgres.e2e.test.ts',
			],
			name: 'postgres-e2e',
			// Matches coverage-postgres-e2e: one slow test must not time out and
			// leave its application active for the next one.
			testTimeout: 20_000,
		},
	},
	{
		extends: true,
		test: {
			fileParallelism: false,
			include: [
				'tests/performance/**/*.performance.test.ts',
				'packages/*/tests/performance/**/*.performance.test.ts',
			],
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
			// Each package job measures its own sources against its own thresholds.
			thresholds: coverageThresholds,
		},
		fileParallelism: true,
		pool: 'forks',
		// Yoga and application schemas must share one transformed GraphQL realm.
		server: { deps: { inline: graphqlRuntimeDependencies } },
		// Root projects separate package ownership from cross-package behavior.
		projects: testProjects,
	},
})

export default config
