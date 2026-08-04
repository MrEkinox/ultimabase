import type {
	PostgresPoolClient,
	PostgresQueryResult,
} from '../connection/contracts.js'
import { describe, expect, it } from 'vitest'

import { createPostgresItemRecovery } from './item-recovery.js'

/** Records only the transaction-control SQL needed by the savepoint boundary. */
class RecoveryClient implements PostgresPoolClient {
	readonly calls: string[] = []
	readonly #failAt: number | undefined

	constructor(failAt?: number) {
		this.#failAt = failAt
	}

	query(queryText: string): Promise<PostgresQueryResult> {
		this.calls.push(queryText)

		return this.calls.length === this.#failAt
			? Promise.reject(
					Object.assign(new Error('private SQL'), { code: '08006' }),
				)
			: Promise.resolve({ rows: [] })
	}

	release(): void {
		// Savepoint recovery never owns the borrowed client lifecycle.
	}
}

describe('PostgreSQL item recovery', () => {
	it('releases successful item savepoints in sequence', async () => {
		const client = new RecoveryClient()
		const recovery = createPostgresItemRecovery(client)

		await expect(
			recovery.attempt(() => Promise.resolve('first')),
		).resolves.toEqual({ status: 'succeeded', value: 'first' })
		await expect(
			recovery.attempt(() => Promise.resolve('second')),
		).resolves.toEqual({ status: 'succeeded', value: 'second' })
		expect(client.calls).toStrictEqual([
			'SAVEPOINT ultimabase_bulk_0',
			'RELEASE SAVEPOINT ultimabase_bulk_0',
			'SAVEPOINT ultimabase_bulk_1',
			'RELEASE SAVEPOINT ultimabase_bulk_1',
		])
	})

	it('rolls back one failed item while retaining its original failure as data', async () => {
		const client = new RecoveryClient()
		const recovery = createPostgresItemRecovery(client)
		const persistenceError = new Error('mapped persistence failure')
		const result = await recovery.attempt(() =>
			Promise.reject(persistenceError),
		)

		expect(result).toStrictEqual({
			error: persistenceError,
			status: 'failed',
		})
		expect(client.calls).toStrictEqual([
			'SAVEPOINT ultimabase_bulk_0',
			'ROLLBACK TO SAVEPOINT ultimabase_bulk_0',
			'RELEASE SAVEPOINT ultimabase_bulk_0',
		])
	})

	it.each([1, 2, 3])(
		'rejects when savepoint control call %s leaves recovery uncertain',
		async (failAt) => {
			const recovery = createPostgresItemRecovery(new RecoveryClient(failAt))

			await expect(
				recovery.attempt(() => Promise.reject(new Error('item failed'))),
			).rejects.toMatchObject({
				code: 'TRANSACTION_ERROR',
				internalDetails: {
					kind: 'postgres-transaction-failed',
					phase: 'savepoint',
				},
			})
		},
	)

	it('rejects a failed release after successful persistence', async () => {
		const recovery = createPostgresItemRecovery(new RecoveryClient(2))

		await expect(
			recovery.attempt(() => Promise.resolve('persisted')),
		).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			internalDetails: {
				kind: 'postgres-transaction-failed',
				phase: 'savepoint',
			},
		})
	})
})
