import { isPlainRecord, type MaybePromise } from '@ultimabase/shared'

const defaultSchemaPrefix = 'ultimabase_test'
const maximumPostgresIdentifierLength = 63
const safeSchemaPrefix = /^[a-z][a-z0-9_]*$/u

/** Runs one administrative PostgreSQL statement without exposing a driver type. */
export type PostgresTestQuery = (statement: string) => MaybePromise<unknown>

/** Configures one deterministic namespace owned by a Vitest worker slot. */
export interface PostgresTestWorkerOptions {
	readonly prefix?: string
	readonly query: PostgresTestQuery
	readonly workerId: number
}

const isPostgresTestQuery = (value: unknown): value is PostgresTestQuery =>
	typeof value === 'function'

const normalizeWorkerId = (value: unknown): number => {
	if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1) {
		throw new TypeError('PostgreSQL test workerId must be a positive integer')
	}

	return value
}

const normalizePrefix = (value: unknown): string => {
	if (typeof value !== 'string' || !safeSchemaPrefix.test(value)) {
		throw new TypeError(
			'PostgreSQL test schema prefix must use lowercase letters, digits, and underscores',
		)
	}

	return value
}

/** Reads Vitest's reusable worker-slot identifier from the current process. */
export const readVitestPoolId = (value: string | undefined): number => {
	if (value === undefined || !/^\d+$/u.test(value)) {
		throw new TypeError('VITEST_POOL_ID must be a positive integer')
	}

	return normalizeWorkerId(Number(value))
}

/** Owns reset and cleanup for exactly one safe PostgreSQL worker namespace. */
export class PostgresTestWorker {
	readonly connectionOptions: string
	readonly schemaName: string
	readonly #query: PostgresTestQuery

	constructor(options: PostgresTestWorkerOptions) {
		const untrustedOptions: unknown = options

		if (!isPlainRecord(untrustedOptions)) {
			throw new TypeError('PostgreSQL test worker options must be an object')
		}

		const workerId = normalizeWorkerId(untrustedOptions.workerId)
		const prefix = normalizePrefix(
			untrustedOptions.prefix ?? defaultSchemaPrefix,
		)
		const schemaName = `${prefix}_${String(workerId)}`

		if (schemaName.length > maximumPostgresIdentifierLength) {
			throw new TypeError(
				'PostgreSQL test worker schema exceeds the identifier limit',
			)
		}
		if (!isPostgresTestQuery(untrustedOptions.query)) {
			throw new TypeError('PostgreSQL test worker query must be a function')
		}

		this.#query = untrustedOptions.query
		this.schemaName = schemaName
		// Generated identifiers need no shell or SQL quoting inside libpq's option value.
		this.connectionOptions = `-c search_path=${schemaName}`

		Object.freeze(this)
	}

	/** Drops stale worker state and recreates only this worker's empty namespace. */
	async reset(): Promise<void> {
		await this.#query(`DROP SCHEMA IF EXISTS "${this.schemaName}" CASCADE`)
		await this.#query(`CREATE SCHEMA "${this.schemaName}"`)
	}

	/** Removes this worker namespace without touching another worker's tables. */
	async dispose(): Promise<void> {
		await this.#query(`DROP SCHEMA IF EXISTS "${this.schemaName}" CASCADE`)
	}
}
