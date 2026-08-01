export const postgresConnectionUriContextKey = 'postgresConnectionUri'

declare module 'vitest' {
	/** Carries only serializable PostgreSQL connection data into E2E workers. */
	export interface ProvidedContext {
		readonly postgresConnectionUri: string
	}
}
