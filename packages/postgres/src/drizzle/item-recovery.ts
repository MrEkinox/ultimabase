import { immutableRecord } from '@ultimabase/shared'

import type { PostgresPoolClient } from '../connection/contracts.js'
import { createPostgresTransactionError } from './transaction-error.js'

export type PostgresItemAttempt<TResult> =
	| Readonly<{ readonly status: 'succeeded'; readonly value: TResult }>
	| Readonly<{ readonly error: unknown; readonly status: 'failed' }>

/** Runs one item behind a PostgreSQL savepoint without creating a side transaction. */
export interface PostgresItemRecovery {
	attempt<TResult>(
		run: () => Promise<TResult>,
	): Promise<PostgresItemAttempt<TResult>>
}

/** Creates collision-free internal savepoints for one borrowed transaction client. */
export const createPostgresItemRecovery = (
	client: PostgresPoolClient,
): PostgresItemRecovery => {
	let sequence = 0

	return Object.freeze({
		attempt: async <TResult>(
			run: () => Promise<TResult>,
		): Promise<PostgresItemAttempt<TResult>> => {
			const savepoint = `ultimabase_bulk_${String(sequence)}`
			sequence += 1

			try {
				// The identifier is framework-generated and never contains developer input.
				await client.query(`SAVEPOINT ${savepoint}`)
			} catch (error: unknown) {
				throw createPostgresTransactionError('savepoint', error)
			}

			let value: TResult

			try {
				value = await run()
			} catch (operationError: unknown) {
				try {
					await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
					await client.query(`RELEASE SAVEPOINT ${savepoint}`)
				} catch (recoveryError: unknown) {
					// Failed recovery leaves the outer transaction unsafe to commit.
					throw createPostgresTransactionError('savepoint', recoveryError)
				}

				return immutableRecord({
					error: operationError,
					status: 'failed' as const,
				})
			}

			try {
				await client.query(`RELEASE SAVEPOINT ${savepoint}`)
			} catch (error: unknown) {
				throw createPostgresTransactionError('savepoint', error)
			}

			return immutableRecord({ status: 'succeeded' as const, value })
		},
	})
}
