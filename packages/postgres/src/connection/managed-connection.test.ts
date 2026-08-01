import { FrameworkError } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import type { PostgresPool, PostgresPoolClient } from './contracts.js'
import { createManagedPostgresConnection } from './managed-connection.js'

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
			message: 'PostgreSQL connection verification failed.',
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
})
