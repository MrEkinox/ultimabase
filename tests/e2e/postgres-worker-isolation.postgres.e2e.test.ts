import process from 'node:process'

import { PostgresTestWorker, readVitestPoolId } from '@ultimabase/testing'
import { Pool } from 'pg'
import { describe, expect, inject, it } from 'vitest'

import { postgresConnectionUriContextKey } from './postgres-context.js'

describe('PostgreSQL worker isolation', () => {
	it('keeps equal table names and resets independent across concurrent namespaces', async () => {
		const connectionUri = inject(postgresConnectionUriContextKey)
		const adminPool = new Pool({ connectionString: connectionUri })
		const workerId = readVitestPoolId(process.env.VITEST_POOL_ID) * 10
		const createWorker = (offset: number): PostgresTestWorker =>
			new PostgresTestWorker({
				prefix: 'ultimabase_parallel',
				query: async (statement): Promise<void> => {
					await adminPool.query(statement)
				},
				workerId: workerId + offset,
			})
		const firstWorker = createWorker(1)
		const secondWorker = createWorker(2)
		const firstPool = new Pool({
			connectionString: connectionUri,
			options: firstWorker.connectionOptions,
		})
		const secondPool = new Pool({
			connectionString: connectionUri,
			options: secondWorker.connectionOptions,
		})

		try {
			await Promise.all([firstWorker.reset(), secondWorker.reset()])
			await Promise.all([
				firstPool.query('CREATE TABLE shared_values (value text NOT NULL)'),
				secondPool.query('CREATE TABLE shared_values (value text NOT NULL)'),
			])
			await Promise.all([
				firstPool.query('INSERT INTO shared_values (value) VALUES ($1)', [
					'first',
				]),
				secondPool.query('INSERT INTO shared_values (value) VALUES ($1)', [
					'second',
				]),
			])

			const [firstResult, secondResult] = await Promise.all([
				firstPool.query<{ readonly value: string }>(
					'SELECT value FROM shared_values',
				),
				secondPool.query<{ readonly value: string }>(
					'SELECT value FROM shared_values',
				),
			])

			expect(firstResult.rows).toStrictEqual([{ value: 'first' }])
			expect(secondResult.rows).toStrictEqual([{ value: 'second' }])

			await firstWorker.reset()

			const firstTable = await firstPool.query<{
				readonly table: string | null
			}>("SELECT to_regclass(current_schema() || '.shared_values') AS table")
			const preservedSecond = await secondPool.query<{
				readonly value: string
			}>('SELECT value FROM shared_values')

			expect(firstTable.rows).toStrictEqual([{ table: null }])
			expect(preservedSecond.rows).toStrictEqual([{ value: 'second' }])
		} finally {
			try {
				await Promise.all([firstPool.end(), secondPool.end()])
			} finally {
				try {
					await Promise.all([firstWorker.dispose(), secondWorker.dispose()])
				} finally {
					await adminPool.end()
				}
			}
		}
	}, 30_000)
})
