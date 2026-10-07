import { describe, expect, it, vi } from 'vitest'

import { PostgresTestWorker, readVitestPoolId } from './worker.js'

describe('PostgreSQL test worker', () => {
	it('derives a deterministic safe namespace and resets only that namespace', async () => {
		const query = vi.fn<(statement: string) => Promise<void>>(() =>
			Promise.resolve(),
		)
		const worker = new PostgresTestWorker({ query, workerId: 7 })

		expect(worker.schemaName).toBe('ultimabase_test_7')
		expect(worker.connectionOptions).toBe('-c search_path=ultimabase_test_7')

		await worker.reset()
		await worker[Symbol.asyncDispose]()

		expect(query.mock.calls).toStrictEqual([
			['DROP SCHEMA IF EXISTS "ultimabase_test_7" CASCADE'],
			['CREATE SCHEMA "ultimabase_test_7"'],
			['DROP SCHEMA IF EXISTS "ultimabase_test_7" CASCADE'],
		])
		expect(Object.isFrozen(worker)).toBe(true)
	})

	it('supports isolated suite prefixes without allowing SQL identifiers', () => {
		const query = (): undefined => undefined

		expect(
			new PostgresTestWorker({ prefix: 'adapter_suite', query, workerId: 2 })
				.schemaName,
		).toBe('adapter_suite_2')
		expect(
			() =>
				new PostgresTestWorker({ prefix: 'Unsafe-Schema', query, workerId: 2 }),
		).toThrow(
			new TypeError(
				'PostgreSQL test schema prefix must use lowercase letters, digits, and underscores',
			),
		)
		expect(
			() =>
				new PostgresTestWorker({
					prefix: 'a'.repeat(63),
					query,
					workerId: 2,
				}),
		).toThrow(
			new TypeError(
				'PostgreSQL test worker schema exceeds the identifier limit',
			),
		)
	})

	it('validates explicit and process-derived worker identifiers', () => {
		expect(readVitestPoolId('12')).toBe(12)
		expect(() => readVitestPoolId('0')).toThrow(
			new TypeError('PostgreSQL test workerId must be a positive integer'),
		)
		expect(() => readVitestPoolId('worker')).toThrow(
			new TypeError('VITEST_POOL_ID must be a positive integer'),
		)
		expect(
			() => new PostgresTestWorker({ query: () => undefined, workerId: 0 }),
		).toThrow(
			new TypeError('PostgreSQL test workerId must be a positive integer'),
		)
	})
})
