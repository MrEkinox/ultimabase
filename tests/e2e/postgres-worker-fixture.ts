import process from 'node:process'

import { PostgresTestWorker, readVitestPoolId } from '@ultimabase/testing'
import { Pool } from 'pg'
import { inject } from 'vitest'

import { postgresConnectionUriContextKey } from './postgres-context.js'

/** Owns one worker-scoped pool and its isolated PostgreSQL namespace. */
export interface PostgresWorkerFixture {
	readonly connectionUri: string
	readonly pool: Pool
	readonly schemaName: string
	dispose(): Promise<void>
}

const withConnectionOptions = (
	connectionUri: string,
	options: string,
): string => {
	const url = new URL(connectionUri)

	url.searchParams.set('options', options)

	return url.toString()
}

/** Creates and resets the namespace assigned to the current Vitest worker slot. */
export const createPostgresWorkerFixture =
	async (): Promise<PostgresWorkerFixture> => {
		const baseConnectionUri = inject(postgresConnectionUriContextKey)
		const adminPool = new Pool({ connectionString: baseConnectionUri })
		const worker = new PostgresTestWorker({
			query: async (statement): Promise<void> => {
				await adminPool.query(statement)
			},
			workerId: readVitestPoolId(process.env.VITEST_POOL_ID),
		})

		try {
			await worker.reset()
		} catch (error: unknown) {
			await adminPool.end()
			throw error
		}

		const connectionUri = withConnectionOptions(
			baseConnectionUri,
			worker.connectionOptions,
		)
		const pool = new Pool({ connectionString: connectionUri })
		let disposed = false

		return Object.freeze({
			connectionUri,
			pool,
			schemaName: worker.schemaName,
			dispose: async (): Promise<void> => {
				if (disposed) return

				disposed = true

				try {
					await pool.end()
				} finally {
					try {
						await worker.dispose()
					} finally {
						await adminPool.end()
					}
				}
			},
		})
	}
