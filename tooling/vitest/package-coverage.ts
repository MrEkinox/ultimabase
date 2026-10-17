/** Minimum coverage percentages, as Vitest compares them. */
export interface CoverageThresholds {
	readonly branches: number
	readonly functions: number
	readonly lines: number
	readonly statements: number
}

/**
 * Minimum coverage of each package's sources (`packages/<name>/src/**`) by
 * that package's own suites: its unit tests and its package-owned E2E and
 * PostgreSQL E2E run from sources. Transversal suites and other packages'
 * tests never count. The package CI job and `yarn validate:package <name>`
 * enforce them; values are the measured coverage floored, so any drop fails.
 */
export const packageCoverageThresholds: Readonly<
	Record<string, CoverageThresholds>
> = {
	'access-plugin': { branches: 76, functions: 91, lines: 87, statements: 86 },
	'acl-permissions-plugin': {
		branches: 88,
		functions: 98,
		lines: 95,
		statements: 94,
	},
	'api-server': { branches: 100, functions: 100, lines: 100, statements: 100 },
	'auth-password': { branches: 84, functions: 97, lines: 94, statements: 93 },
	'auth-plugin': { branches: 41, functions: 53, lines: 60, statements: 58 },
	core: { branches: 85, functions: 96, lines: 92, statements: 91 },
	'create-app': { branches: 83, functions: 77, lines: 83, statements: 83 },
	'graphql-explorer-plugin': {
		branches: 100,
		functions: 100,
		lines: 100,
		statements: 100,
	},
	'graphql-http': { branches: 95, functions: 75, lines: 90, statements: 90 },
	'graphql-plugin': { branches: 81, functions: 96, lines: 93, statements: 91 },
	'graphql-yoga-plugin': {
		branches: 87,
		functions: 93,
		lines: 91,
		statements: 89,
	},
	'hono-server-plugin': {
		branches: 92,
		functions: 97,
		lines: 96,
		statements: 95,
	},
	'hooks-plugin': { branches: 84, functions: 96, lines: 93, statements: 92 },
	'http-plugin': { branches: 89, functions: 97, lines: 95, statements: 94 },
	'pg-vector-plugin': {
		branches: 100,
		functions: 100,
		lines: 100,
		statements: 100,
	},
	'plugin-kit': { branches: 67, functions: 65, lines: 70, statements: 69 },
	'postgres-plugin': { branches: 79, functions: 95, lines: 90, statements: 89 },
	'rest-plugin': { branches: 81, functions: 93, lines: 92, statements: 90 },
	'roles-plugin': { branches: 77, functions: 97, lines: 91, statements: 90 },
	shared: { branches: 100, functions: 100, lines: 100, statements: 100 },
	'soft-delete-plugin': {
		branches: 97,
		functions: 100,
		lines: 100,
		statements: 98,
	},
	testing: { branches: 56, functions: 70, lines: 67, statements: 67 },
	'validation-plugin': {
		branches: 78,
		functions: 91,
		lines: 90,
		statements: 88,
	},
}

/** Stricter thresholds for single source files, checked with their package. */
export const fileCoverageThresholds: Readonly<
	Record<string, CoverageThresholds>
> = {
	'packages/core/src/query/filters/relation.ts': {
		branches: 98,
		functions: 100,
		lines: 100,
		statements: 100,
	},
}

/**
 * Vitest thresholds keyed by source glob. A glob that matches no measured file
 * passes, so one package's run checks only its own entries.
 */
export const coverageThresholds: Readonly<Record<string, CoverageThresholds>> =
	Object.fromEntries([
		...Object.entries(packageCoverageThresholds).map(
			([name, thresholds]) => [`packages/${name}/src/**`, thresholds] as const,
		),
		...Object.entries(fileCoverageThresholds),
	])
