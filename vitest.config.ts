import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	defineConfig,
	type TestProjectConfiguration,
	type ViteUserConfig,
} from 'vitest/config'

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
		'typegen',
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
			exclude: [
				'tests/e2e/**/*.postgres.e2e.test.ts',
				'packages/*/tests/e2e/**/*.postgres.e2e.test.ts',
				'tests/e2e/package-archives.e2e.test.ts',
				'packages/core/tests/e2e/core-archive-declarations.e2e.test.ts',
				// The managed listener validates compiled Fetch realms, not source coverage.
				'packages/graphql-yoga-plugin/tests/e2e/graphql-yoga-application.e2e.test.ts',
				// This artifact audit reads build-only source maps and remains covered by
				// the post-build e2e project.
				'packages/auth-password/tests/e2e/auth-password-archive.e2e.test.ts',
				// These suites read compiled declarations or invoke built exports in child
				// processes. Source aliases cannot change them; retain their built E2E run.
				'packages/acl-permissions-plugin/tests/e2e/acl-direct-option.e2e.test.ts',
				'packages/core/tests/e2e/core-field-builder.e2e.test.ts',
				'packages/core/tests/e2e/core-field-option-diagnostics.e2e.test.ts',
				'packages/core/tests/e2e/core-output-builder.e2e.test.ts',
				'packages/core/tests/e2e/core-plugin-manifest.e2e.test.ts',
				'packages/core/tests/e2e/core-public-query-types.e2e.test.ts',
				'packages/core/tests/e2e/core-runtime-capabilities.e2e.test.ts',
				'packages/core/tests/e2e/core-schema-compiler-ir.e2e.test.ts',
				'packages/core/tests/e2e/core-schema-targets.e2e.test.ts',
				'packages/core/tests/e2e/plugin-operations.e2e.test.ts',
				'packages/create-app/tests/e2e/create-app-packed.e2e.test.ts',
				'packages/graphql-plugin/tests/e2e/graphql-schema-execution.e2e.test.ts',
				'packages/http-plugin/tests/e2e/http-application.e2e.test.ts',
				'packages/pg-vector-plugin/tests/e2e/pg-vector-field-builder.e2e.test.ts',
				'packages/plugin-kit/tests/e2e/plugin-kit-authoring-language-service.e2e.test.ts',
				'packages/rest-plugin/tests/e2e/rest-application.e2e.test.ts',
				'packages/soft-delete-plugin/tests/e2e/soft-delete-plugin.e2e.test.ts',
				'packages/validation-plugin/tests/e2e/standard-schema-validation.e2e.test.ts',
				'tests/e2e/optional-product-public-api.e2e.test.ts',
				'tests/e2e/register-required.e2e.test.ts',
			],
			include: [
				'tests/e2e/**/*.e2e.test.ts',
				'packages/*/tests/e2e/**/*.e2e.test.ts',
			],
			name: 'coverage-e2e',
			// Source instrumentation needs headroom on resource-constrained hosted runners.
			testTimeout: 20_000,
		},
	},
	{
		extends: true,
		resolve: { alias: sourcePackageAliases },
		test: {
			globalSetup: ['./tests/fixtures/postgres.global-setup.ts'],
			include: [
				'tests/e2e/**/*.postgres.e2e.test.ts',
				'packages/*/tests/e2e/**/*.postgres.e2e.test.ts',
			],
			name: 'coverage-postgres-e2e',
			testTimeout: 20_000,
		},
	},
	{
		extends: true,
		test: {
			exclude: ['**/*.postgres.e2e.test.ts'],
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
		// Yoga and application schemas must share one transformed GraphQL realm.
		server: { deps: { inline: graphqlRuntimeDependencies } },
		// Root projects separate package ownership from cross-package behavior.
		projects: testProjects,
	},
})

export default config
