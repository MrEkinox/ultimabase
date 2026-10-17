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
 * enforce them; values are the measured coverage floored minus one point, so a real drop
 * fails while run-to-run and platform noise does not.
 */
export const packageCoverageThresholds: Readonly<
	Record<string, CoverageThresholds>
> = {
	'access-plugin': { branches: 75, functions: 90, lines: 86, statements: 85 },
	'acl-permissions-plugin': {
		branches: 87,
		functions: 97,
		lines: 94,
		statements: 93,
	},
	'api-server': { branches: 99, functions: 99, lines: 99, statements: 99 },
	'auth-password': { branches: 83, functions: 96, lines: 93, statements: 92 },
	'auth-plugin': { branches: 92, functions: 98, lines: 96, statements: 96 },
	core: { branches: 84, functions: 95, lines: 91, statements: 90 },
	'create-app': { branches: 82, functions: 76, lines: 82, statements: 82 },
	'graphql-explorer-plugin': {
		branches: 99,
		functions: 99,
		lines: 99,
		statements: 99,
	},
	'graphql-http': { branches: 94, functions: 74, lines: 89, statements: 89 },
	'graphql-plugin': { branches: 80, functions: 95, lines: 92, statements: 90 },
	'graphql-yoga-plugin': {
		branches: 86,
		functions: 92,
		lines: 90,
		statements: 88,
	},
	'hono-server-plugin': {
		branches: 91,
		functions: 96,
		lines: 95,
		statements: 94,
	},
	'hooks-plugin': { branches: 83, functions: 95, lines: 92, statements: 91 },
	'http-plugin': { branches: 88, functions: 96, lines: 94, statements: 93 },
	'pg-vector-plugin': {
		branches: 99,
		functions: 99,
		lines: 99,
		statements: 99,
	},
	'plugin-kit': { branches: 66, functions: 64, lines: 69, statements: 68 },
	'postgres-plugin': { branches: 78, functions: 94, lines: 89, statements: 88 },
	'rest-plugin': { branches: 80, functions: 92, lines: 91, statements: 89 },
	'roles-plugin': { branches: 76, functions: 96, lines: 90, statements: 89 },
	shared: { branches: 99, functions: 99, lines: 99, statements: 99 },
	'soft-delete-plugin': {
		branches: 96,
		functions: 99,
		lines: 99,
		statements: 97,
	},
	testing: { branches: 95, functions: 97, lines: 97, statements: 97 },
	'validation-plugin': {
		branches: 77,
		functions: 90,
		lines: 89,
		statements: 87,
	},
}

/** Stricter thresholds for single source files, checked with their package. */
export const fileCoverageThresholds: Readonly<
	Record<string, CoverageThresholds>
> = {
	'packages/core/src/query/filters/relation.ts': {
		branches: 97,
		functions: 99,
		lines: 99,
		statements: 99,
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
