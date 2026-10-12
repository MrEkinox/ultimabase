import process from 'node:process'

import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'

import { PostgresTestWorker, readVitestPoolId } from '../postgres/worker.js'

/** The image every container started by `@ultimabase/testing` runs. */
export const testPostgresImage = 'postgres:17-alpine'

let containerUrl: Promise<string> | undefined

/**
 * `TEST_DATABASE_URL`, otherwise one PostgreSQL container per process,
 * started on first use (`ultimabaseTesting()` starts it once per test run
 * instead and sets the variable). Testcontainers removes it when the process
 * ends.
 */
export const readTestDatabaseUrl = (): Promise<string> => {
	const url = process.env.TEST_DATABASE_URL
	if (url !== undefined && url.trim() !== '') return Promise.resolve(url)
	containerUrl ??= new PostgreSqlContainer(testPostgresImage)
		.start()
		.then((container) => container.getConnectionUri())
	return containerUrl
}

/** One worker slot: Vitest's pool, Jest's worker, otherwise the only worker. */
const readWorkerId = (): number => {
	if (process.env.VITEST_POOL_ID !== undefined) {
		return readVitestPoolId(process.env.VITEST_POOL_ID)
	}
	const jest = Number(process.env.JEST_WORKER_ID)
	return Number.isSafeInteger(jest) && jest > 0 ? jest : 1
}

/** The isolated PostgreSQL schema of this test worker and its connection URL. */
export interface TestDatabase {
	/** `DATABASE_URL` for the application: the worker schema is its search path. */
	readonly applicationUrl: string
	/** Tags the application's connections, to prove they use `applicationUrl`. */
	readonly applicationName: string
	/** Counts the open connections tagged with `applicationName`. */
	countApplicationConnections(): Promise<number>
	/** Drops the worker schema and closes the administrative connection. */
	dispose(): Promise<void>
}

/** Recreates this worker's empty schema; stale state from a crash is dropped. */
export const openTestDatabase = async (): Promise<TestDatabase> => {
	const url = await readTestDatabaseUrl()
	const admin = new Pool({ connectionString: url, max: 1 })
	try {
		const worker = new PostgresTestWorker({
			query: (statement) => admin.query(statement),
			workerId: readWorkerId(),
		})
		await worker.reset()
		const applicationName = worker.schemaName
		const applicationUrl = new URL(url)
		applicationUrl.searchParams.set('options', worker.connectionOptions)
		applicationUrl.searchParams.set('application_name', applicationName)
		return {
			applicationName,
			applicationUrl: applicationUrl.href,
			countApplicationConnections: async () => {
				const result = await admin.query<{ readonly count: number }>(
					'SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1',
					[applicationName],
				)
				return result.rows[0]?.count ?? 0
			},
			dispose: async () => {
				try {
					await worker.dispose()
				} finally {
					await admin.end()
				}
			},
		}
	} catch (error: unknown) {
		await admin.end()
		throw error
	}
}
