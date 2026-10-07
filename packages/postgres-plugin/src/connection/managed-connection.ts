import { FrameworkError } from '@ultimabase/core'

import type {
	PostgresConnectionService,
	PostgresConnectionState,
	PostgresPool,
	PostgresPoolClient,
} from './contracts.js'

import { readPostgresDriverCode } from './driver-error.js'

/** Supplies the internal resource ownership needed by the plugin lifecycle. */
export interface ManagedPostgresConnection extends PostgresConnectionService {
	connect(): Promise<void>
	close(): Promise<void>
	getPool(): PostgresPool
}

/** Removes driver messages and causes because either may contain credentials. */
const createSanitizedPostgresError = (
	message: string,
	publicMessage: string,
	kind: 'postgres-connection-failed' | 'postgres-disposal-failed',
	error: unknown,
	retryable: boolean,
): FrameworkError<'INTERNAL_ERROR'> => {
	const driverCode = readPostgresDriverCode(error)

	return new FrameworkError('INTERNAL_ERROR', message, {
		publicMessage,
		retryable,
		internalDetails: {
			kind,
			...(driverCode === undefined ? {} : { driverCode }),
		},
	})
}

const createConnectionError = (
	error: unknown,
): FrameworkError<'INTERNAL_ERROR'> =>
	createSanitizedPostgresError(
		'PostgreSQL connection verification failed.',
		'The database connection could not be established.',
		'postgres-connection-failed',
		error,
		true,
	)

const createDisposalError = (
	error: unknown,
): FrameworkError<'INTERNAL_ERROR'> =>
	createSanitizedPostgresError(
		'PostgreSQL pool disposal failed.',
		'The database connection could not be released.',
		'postgres-disposal-failed',
		error,
		false,
	)

/** Owns one application pool without making it reachable through public context. */
class ApplicationPostgresConnection
	implements ManagedPostgresConnection, AsyncDisposable
{
	readonly #pool: PostgresPool
	readonly #ownsPool: boolean
	#state: PostgresConnectionState = 'idle'
	#connectPromise: Promise<void> | undefined
	#closePromise: Promise<void> | undefined
	#closing = false

	constructor(pool: PostgresPool, ownsPool: boolean) {
		this.#pool = pool
		this.#ownsPool = ownsPool
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
		let client: PostgresPoolClient

		try {
			client = await this.#pool.connect()
			client.release()
		} catch (error: unknown) {
			throw createConnectionError(error)
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
			throw createDisposalError(error)
		}
	}
}

/** Creates the internal service while retaining whether the plugin owns its pool. */
export const createManagedPostgresConnection = (
	pool: PostgresPool,
	ownsPool: boolean,
): ManagedPostgresConnection =>
	new ApplicationPostgresConnection(pool, ownsPool)
