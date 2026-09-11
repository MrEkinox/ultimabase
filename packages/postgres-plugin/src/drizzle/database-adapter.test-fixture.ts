import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

import type { PostgresDriverQueryClient } from './client.js'
import type {
	PostgresPool,
	PostgresPoolClient,
} from '../connection/contracts.js'

interface RecordedDriverQuery {
	readonly params: readonly unknown[]
	readonly text: string
}

interface FixtureDriverResult {
	readonly rowCount: number
	readonly rows: readonly (readonly unknown[])[]
}

type TransactionStatement = 'BEGIN' | 'COMMIT' | 'ROLLBACK'

/** Emulates only node-postgres' query boundary while Drizzle builds and maps real SQL. */
export class FixtureDriver
	implements PostgresDriverQueryClient, PostgresPoolClient
{
	readonly #responses: (Error | FixtureDriverResult)[] = []
	readonly #transactionFailures = new Map<TransactionStatement, Error>()
	readonly calls: RecordedDriverQuery[] = []
	readonly transactionCalls: TransactionStatement[] = []
	readonly releaseArguments: (Error | boolean | undefined)[] = []
	releaseCalls = 0
	#releaseFailure: Error | undefined

	respond(
		rows: readonly (readonly unknown[])[],
		rowCount: number = rows.length,
	): void {
		this.#responses.push({ rowCount, rows })
	}

	fail(error: Error): void {
		this.#responses.push(error)
	}

	failTransaction(statement: TransactionStatement, error: Error): void {
		this.#transactionFailures.set(statement, error)
	}

	failRelease(error: Error): void {
		this.#releaseFailure = error
	}

	query(...arguments_: unknown[]): Promise<FixtureDriverResult> {
		const values: readonly unknown[] = arguments_
		const configuration = values[0]
		const parameters = values[1]

		if (
			configuration === 'BEGIN' ||
			configuration === 'COMMIT' ||
			configuration === 'ROLLBACK'
		) {
			this.transactionCalls.push(configuration)
			const failure = this.#transactionFailures.get(configuration)

			return failure === undefined
				? Promise.resolve({ rowCount: 0, rows: [] })
				: Promise.reject(failure)
		}

		if (
			!isPlainRecord(configuration) ||
			typeof configuration.text !== 'string' ||
			!isUnknownArray(parameters)
		) {
			return Promise.reject(new TypeError('Invalid Drizzle fixture query'))
		}

		this.calls.push({ params: parameters, text: configuration.text })
		const response = this.#responses.shift()

		if (response === undefined) {
			return Promise.reject(new TypeError('Missing Drizzle fixture response'))
		}

		return response instanceof Error
			? Promise.reject(response)
			: Promise.resolve(response)
	}

	release(error?: Error | boolean): void {
		this.releaseCalls += 1
		this.releaseArguments.push(error)

		if (this.#releaseFailure !== undefined) {
			throw this.#releaseFailure
		}
	}
}

/** Borrows the exact fixture driver used by each transaction adapter. */
export class FixturePool implements PostgresPool {
	readonly #connectError: Error | undefined
	readonly #rootDriver: FixtureDriver
	readonly #transactionDrivers: readonly FixtureDriver[]
	connectCalls = 0

	constructor(
		rootDriver: FixtureDriver,
		transactionDrivers: readonly FixtureDriver[],
		connectError?: Error,
	) {
		this.#connectError = connectError
		this.#rootDriver = rootDriver
		this.#transactionDrivers = transactionDrivers
	}

	connect(): Promise<PostgresPoolClient> {
		this.connectCalls += 1
		const client = this.#transactionDrivers[this.connectCalls - 1]

		if (this.#connectError !== undefined) {
			return Promise.reject(this.#connectError)
		}

		if (client === undefined) {
			return Promise.reject(
				new TypeError('Missing PostgreSQL transaction fixture client'),
			)
		}

		return Promise.resolve(client)
	}

	end(): Promise<void> {
		return Promise.resolve()
	}

	query(...arguments_: unknown[]): Promise<FixtureDriverResult> {
		return this.#rootDriver.query(...arguments_)
	}
}
