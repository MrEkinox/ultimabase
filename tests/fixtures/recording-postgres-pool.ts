import type {
	PostgresPool,
	PostgresPoolClient,
	PostgresQueryResult,
} from '@ultimabase/postgres-plugin'

import type { PostgresWorkerFixture } from './postgres-worker-fixture.js'

/** Reads SQL text from both direct node-postgres calls and Drizzle query configs. */
const readQueryText = (input: unknown): string => {
	if (typeof input === 'string') return input
	if (
		typeof input === 'object' &&
		input !== null &&
		'text' in input &&
		typeof input.text === 'string'
	) {
		return input.text
	}

	throw new TypeError('PostgreSQL query instrumentation received invalid SQL')
}

/** Records statements while leaving the worker fixture responsible for cleanup. */
export class RecordingPostgresPool implements PostgresPool {
	readonly statements: string[] = []
	readonly #pool: PostgresWorkerFixture['pool']

	constructor(pool: PostgresWorkerFixture['pool']) {
		this.#pool = pool
	}

	async connect(): Promise<PostgresPoolClient> {
		const client = await this.#pool.connect()

		return {
			query: async (
				queryText: string,
				values?: unknown[],
			): Promise<PostgresQueryResult> => {
				this.statements.push(readQueryText(queryText))
				const result = await client.query(queryText, values)

				return { rows: result.rows }
			},
			release: (error) => {
				client.release(error)
			},
		}
	}

	end(): Promise<void> {
		// The worker fixture remains the owner of its concrete pool.
		return Promise.resolve()
	}

	async query(
		queryText: string,
		values?: unknown[],
	): Promise<PostgresQueryResult> {
		this.statements.push(readQueryText(queryText))
		const result = await this.#pool.query(queryText, values)

		return { rows: result.rows }
	}

	reset(): void {
		this.statements.length = 0
	}

	selectCount(): number {
		return this.statements.filter((statement) =>
			statement.trimStart().toLowerCase().startsWith('select'),
		).length
	}
}
