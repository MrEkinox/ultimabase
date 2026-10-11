import { FrameworkError } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import type { PostgresPool, PostgresPoolClient } from './contracts.js'
import {
	createManagedPostgresConnection,
	postgresConnectRetryDelay,
} from './managed-connection.js'

interface FixturePoolOptions {
	readonly connectBarrier?: Promise<void>
	readonly connectError?: Error
	readonly disposalError?: Error
}

/** Records lifecycle calls without introducing a second PostgreSQL implementation. */
class FixturePool implements PostgresPool {
	connectCalls = 0
	endCalls = 0
	releaseCalls = 0
	readonly #options: FixturePoolOptions

	constructor(options: FixturePoolOptions = {}) {
		this.#options = options
	}

	async connect(): Promise<PostgresPoolClient> {
		this.connectCalls += 1
		await this.#options.connectBarrier

		if (this.#options.connectError !== undefined) {
			throw this.#options.connectError
		}

		return {
			query: (): never => {
				throw new TypeError('Connection fixture does not execute queries')
			},
			release: () => {
				this.releaseCalls += 1
			},
		}
	}

	end(): Promise<void> {
		this.endCalls += 1

		return this.#options.disposalError === undefined
			? Promise.resolve()
			: Promise.reject(this.#options.disposalError)
	}

	query(): never {
		throw new TypeError('Fixture connection tests do not execute queries')
	}
}

const createDriverError = (message: string, code: string): Error =>
	Object.assign(new Error(message), { code })

describe('managed PostgreSQL connection', () => {
	it('verifies once, releases its client, and disposes an owned pool once', async () => {
		const pool = new FixturePool()
		const connection = createManagedPostgresConnection(pool, true)

		expect(connection.state).toBe('idle')
		expect(connection.getPool()).toBe(pool)

		await Promise.all([connection.connect(), connection.connect()])

		expect(connection.state).toBe('connected')
		expect(pool.connectCalls).toBe(1)
		expect(pool.releaseCalls).toBe(1)

		await Promise.all([connection.close(), connection.close()])
		await connection.close()

		expect(connection.state).toBe('closed')
		expect(pool.endCalls).toBe(1)
		expect(() => connection.connect()).toThrow(
			new TypeError('Cannot connect a closed PostgreSQL connection'),
		)
	})

	it('leaves an injected pool under developer ownership', async () => {
		const pool = new FixturePool()
		const connection = createManagedPostgresConnection(pool, false)

		await connection.connect()
		await connection.close()

		expect(connection.state).toBe('closed')
		expect(pool.connectCalls).toBe(1)
		expect(pool.releaseCalls).toBe(1)
		expect(pool.endCalls).toBe(0)
	})

	it('keeps a concurrent close as the final lifecycle state', async () => {
		const verification = Promise.withResolvers<undefined>()
		const pool = new FixturePool({ connectBarrier: verification.promise })
		const connection = createManagedPostgresConnection(pool, true)
		const connecting = connection.connect()
		const closing = connection.close()

		expect(() => connection.connect()).toThrow(
			new TypeError('Cannot connect a closed PostgreSQL connection'),
		)

		verification.resolve(undefined)
		await Promise.all([connecting, closing])

		expect(connection.state).toBe('closed')
		expect(pool.releaseCalls).toBe(1)
		expect(pool.endCalls).toBe(1)
	})

	it('removes driver messages and credentials from connection failures', async () => {
		const secret = 'never-expose-this-password'
		const driverError = createDriverError(
			`authentication failed for ${secret}`,
			'28P01',
		)
		const connection = createManagedPostgresConnection(
			new FixturePool({ connectError: driverError }),
			true,
		)
		let failure: unknown

		try {
			await connection.connect()
		} catch (error: unknown) {
			failure = error
		}

		expect(failure).toBeInstanceOf(FrameworkError)
		expect(failure).toMatchObject({
			code: 'INTERNAL_ERROR',
			message: 'PostgreSQL connection verification failed [SQLSTATE 28P01].',
			retryable: true,
			cause: undefined,
			internalDetails: {
				kind: 'postgres-connection-failed',
				driverCode: '28P01',
			},
		})
		expect(String(failure)).not.toContain(secret)
		expect(JSON.stringify(failure)).not.toContain(secret)

		await connection.close()
	})

	// The driver code is the actionable, credential-free part of the failure.
	it('names system codes and omits codes of any other shape', async () => {
		const messageFor = async (code: string): Promise<unknown> => {
			const connection = createManagedPostgresConnection(
				new FixturePool({ connectError: createDriverError('hidden', code) }),
				true,
			)
			const failure = await connection.connect().then(
				() => undefined,
				(error: unknown) => (error instanceof Error ? error.message : error),
			)
			await connection.close()
			return failure
		}

		expect(await messageFor('ECONNREFUSED')).toBe(
			'PostgreSQL connection verification failed [ECONNREFUSED].',
		)
		expect(await messageFor('password=leaked')).toBe(
			'PostgreSQL connection verification failed.',
		)
	})

	it('sanitizes owned-pool disposal failures and remains finalized', async () => {
		const secret = 'disposal-secret'
		const connection = createManagedPostgresConnection(
			new FixturePool({
				disposalError: createDriverError(`close failed: ${secret}`, 'XX001'),
			}),
			true,
		)
		let failure: unknown

		try {
			await connection.close()
		} catch (error: unknown) {
			failure = error
		}

		expect(failure).toMatchObject({
			code: 'INTERNAL_ERROR',
			message: 'PostgreSQL pool disposal failed.',
			cause: undefined,
			internalDetails: {
				kind: 'postgres-disposal-failed',
				driverCode: 'XX001',
			},
		})
		expect(String(failure)).not.toContain(secret)
		expect(JSON.stringify(failure)).not.toContain(secret)
		expect(connection.state).toBe('closed')
		await expect(connection.close()).rejects.toBe(failure)
	})

	describe('first-connection retries (ADR-0320)', () => {
		/** Fails the first `failures` attempts with one driver code. */
		class FlakyPool extends FixturePool {
			#remaining: number

			constructor(failures: number) {
				super()
				this.#remaining = failures
			}

			override async connect(): Promise<PostgresPoolClient> {
				if (this.#remaining > 0) {
					this.#remaining -= 1
					this.connectCalls += 1
					throw createDriverError('password=secret refused', 'ECONNREFUSED')
				}
				return super.connect()
			}
		}

		const createRetryPolicy = (connectRetries: number) => {
			const waits: number[] = []
			const warnings: string[] = []
			const ignore = (): undefined => undefined
			return {
				policy: {
					connectRetries,
					logger: {
						debug: ignore,
						error: ignore,
						info: ignore,
						warn: (message: string) => {
							warnings.push(message)
						},
					},
					wait: (milliseconds: number): Promise<void> => {
						waits.push(milliseconds)
						return Promise.resolve()
					},
				},
				waits,
				warnings,
			}
		}

		it('retries with growing delays and logs each failure without its message', async () => {
			const pool = new FlakyPool(3)
			const { policy, waits, warnings } = createRetryPolicy(5)
			const connection = createManagedPostgresConnection(pool, true, policy)

			await connection.connect()

			expect(connection.state).toBe('connected')
			expect(pool.connectCalls).toBe(4)
			expect(waits).toStrictEqual([500, 1000, 2000])
			expect(warnings).toStrictEqual([
				'connection attempt 1 of 6 failed [ECONNREFUSED]; retrying in 500 ms.',
				'connection attempt 2 of 6 failed [ECONNREFUSED]; retrying in 1000 ms.',
				'connection attempt 3 of 6 failed [ECONNREFUSED]; retrying in 2000 ms.',
			])
		})

		it('fails with the sanitized error once the retries are exhausted', async () => {
			const pool = new FlakyPool(10)
			const { policy, waits } = createRetryPolicy(2)
			const connection = createManagedPostgresConnection(pool, true, policy)

			const failure = await connection
				.connect()
				.catch((error: unknown) => error)

			expect(failure).toBeInstanceOf(FrameworkError)
			expect(failure).toMatchObject({
				message: 'PostgreSQL connection verification failed [ECONNREFUSED].',
				cause: undefined,
			})
			expect(String(failure)).not.toContain('secret')
			expect(pool.connectCalls).toBe(3)
			expect(waits).toStrictEqual([500, 1000])
		})

		it('does not retry by default', async () => {
			const pool = new FlakyPool(1)
			const { policy, waits } = createRetryPolicy(0)
			const connection = createManagedPostgresConnection(pool, true, policy)

			await expect(connection.connect()).rejects.toBeInstanceOf(FrameworkError)
			expect(pool.connectCalls).toBe(1)
			expect(waits).toStrictEqual([])
		})

		it('caps the delay at 8 seconds', () => {
			expect(
				[0, 1, 2, 3, 4, 5, 9].map((retry) => postgresConnectRetryDelay(retry)),
			).toStrictEqual([500, 1000, 2000, 4000, 8000, 8000, 8000])
		})
	})
})
