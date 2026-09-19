import {
	PostgreSqlContainer,
	type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql'

import { postgresConnectionUriContextKey } from './postgres-context.js'

interface GlobalSetupProject {
	provide(key: typeof postgresConnectionUriContextKey, value: string): void
}

/** Starts one container for the complete PostgreSQL E2E Vitest project. */
const setupPostgres = async (
	project: GlobalSetupProject,
): Promise<() => Promise<void>> => {
	const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
		'postgres:17-alpine',
	).start()

	// Workers receive serializable connection data, never the mutable container object.
	project.provide(postgresConnectionUriContextKey, container.getConnectionUri())

	return async (): Promise<void> => {
		await container.stop()
	}
}

export default setupPostgres
