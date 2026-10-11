import { setTimeout as delay } from 'node:timers/promises'

import { FrameworkError, type Logger } from '@ultimabase/core'

import type {
	PostgresConnectionService,
	PostgresConnectionState,
	PostgresPool,
} from './contracts.js'

import { readPostgresDriverCode } from './driver-error.js'

/** Supplies the internal resource ownership needed by the plugin lifecycle. */
export interface ManagedPostgresConnection extends PostgresConnectionService {
	connect(): Promise<void>
	close(): Promise<void>
	getPool(): PostgresPool
}

/** How the first connection is retried (ADR-0320). */
export interface PostgresConnectRetryPolicy {
	/** Further attempts after the first failure; 0 fails at once. */
	readonly connectRetries: number
	readonly logger: Logger
	/** Waits between attempts; replaced by tests. */
	readonly wait?: (milliseconds: number) => Promise<void>
}

const firstRetryDelayMs = 500
const maximumRetryDelayMs = 8000

/** Doubles from 0.5 s up to 8 s: 0.5, 1, 2, 4, 8, 8, ... seconds. */
export const postgresConnectRetryDelay = (retry: number): number =>
	Math.min(firstRetryDelayMs * 2 ** retry, maximumRetryDelayMs)

const sqlStatePattern = /^[0-9A-Z]{5}$/u
const systemCodePattern = /^E[A-Z0-9_]{1,39}$/u

/**
 * Names a driver code without its message: an SQLSTATE such as `28P01`
 * (authentication) or `3D000` (missing database), or a Node system code such
 * as `ECONNREFUSED`. Any other shape is omitted, never echoed.
 */
const describeDriverCode = (driverCode: string | undefined): string => {
	if (driverCode === undefined) return ''
	if (sqlStatePattern.test(driverCode)) return ` [SQLSTATE ${driverCode}]`
	return systemCodePattern.test(driverCode) ? ` [${driverCode}]` : ''
}

/** Removes driver messages and causes because either may contain credentials. */
const createSanitizedPostgresError = (
	phase: 'connection' | 'disposal',
	error: unknown,
): FrameworkError<'INTERNAL_ERROR'> => {
	const driverCode = readPostgresDriverCode(error)
	const connecting = phase === 'connection'

	return new FrameworkError(
		'INTERNAL_ERROR',
		connecting
			? `PostgreSQL connection verification failed${describeDriverCode(driverCode)}.`
			: 'PostgreSQL pool disposal failed.',
		{
			publicMessage: connecting
				? 'The database connection could not be established.'
				: 'The database connection could not be released.',
			retryable: connecting,
			internalDetails: {
				kind: connecting
					? 'postgres-connection-failed'
					: 'postgres-disposal-failed',
				...(driverCode === undefined ? {} : { driverCode }),
			},
		},
	)
}

/** Owns one application pool without making it reachable through public context. */
class ApplicationPostgresConnection
	implements ManagedPostgresConnection, AsyncDisposable
{
	readonly #pool: PostgresPool
	readonly #ownsPool: boolean
	readonly #retry: PostgresConnectRetryPolicy | undefined
	#state: PostgresConnectionState = 'idle'
	#connectPromise: Promise<void> | undefined
	#closePromise: Promise<void> | undefined
	#closing = false

	constructor(
		pool: PostgresPool,
		ownsPool: boolean,
		retry: PostgresConnectRetryPolicy | undefined,
	) {
		this.#pool = pool
		this.#ownsPool = ownsPool
		this.#retry = retry
	}

	get state(): PostgresConnectionState {
		return this.#state
	}

	getPool(): PostgresPool {
		return this.#pool
	}

	/** Verifies authentication once and immediately returns the client to the pool. */
	connect(): Promise<void> {
		if (this.#closing || this.#state === 'closed') {
			throw new TypeError('Cannot connect a closed PostgreSQL connection')
		}

		this.#connectPromise ??= this.#performConnect()

		return this.#connectPromise
	}

	/** Releases an owned pool once while leaving injected pools externally managed. */
	close(): Promise<void> {
		this.#closePromise ??= this.#performClose()

		return this.#closePromise
	}

	[Symbol.asyncDispose](): Promise<void> {
		return this.close()
	}

	async #performConnect(): Promise<void> {
		const retries = this.#retry?.connectRetries ?? 0

		for (let retry = 0; ; retry += 1) {
			try {
				const client = await this.#pool.connect()
				client.release()
				break
			} catch (error: unknown) {
				if (this.#retry === undefined || retry >= retries || this.#closing) {
					throw createSanitizedPostgresError('connection', error)
				}

				const waitMs = postgresConnectRetryDelay(retry)
				// The driver code only: messages may contain credentials.
				this.#retry.logger.warn(
					`connection attempt ${String(retry + 1)} of ${String(retries + 1)} failed${describeDriverCode(readPostgresDriverCode(error))}; retrying in ${String(waitMs)} ms.`,
				)
				await (this.#retry.wait ?? delay)(waitMs)
			}
		}

		// A concurrent close owns the final state even if verification just succeeded.
		if (!this.#closing) {
			this.#state = 'connected'
		}
	}

	async #performClose(): Promise<void> {
		this.#closing = true

		if (this.#connectPromise !== undefined) {
			try {
				await this.#connectPromise
			} catch {
				// Connection failures are reported by connect(); cleanup must still release the pool.
			}
		}

		this.#state = 'closed'

		if (!this.#ownsPool) {
			return
		}

		try {
			await this.#pool.end()
		} catch (error: unknown) {
			throw createSanitizedPostgresError('disposal', error)
		}
	}
}

/**
 * Creates the internal service while retaining whether the plugin owns its
 * pool and how its first connection is retried.
 */
export const createManagedPostgresConnection = (
	pool: PostgresPool,
	ownsPool: boolean,
	retry?: PostgresConnectRetryPolicy,
): ManagedPostgresConnection =>
	new ApplicationPostgresConnection(pool, ownsPool, retry)
