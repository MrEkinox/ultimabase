/**
 * Package-owned E2E suites that only run against the built packages: they read compiled
 * declarations, archives or build-only source maps, or invoke built exports
 * in child processes, so source aliases cannot change what they check. The
 * `coverage-e2e` Vitest project excludes them; `tooling/ci/run.ts` keeps them
 * in their built-export project when it measures a package's coverage.
 */
export const builtOnlyE2eSuites: readonly string[] = [
	'packages/core/tests/e2e/core-archive-declarations.e2e.test.ts',
	// The managed listener validates compiled Fetch realms, not source coverage.
	'packages/graphql-yoga-plugin/tests/e2e/graphql-yoga-application.e2e.test.ts',
	'packages/auth-password/tests/e2e/auth-password-archive.e2e.test.ts',
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
]
