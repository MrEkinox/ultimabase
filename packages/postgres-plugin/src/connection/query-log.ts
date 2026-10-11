import { performance } from 'node:perf_hooks'

import type { Logger } from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'

import type {
	PostgresPool,
	PostgresPoolClient,
	PostgresQueryResult,
} from './contracts.js'
import { readPostgresDriverCode } from './driver-error.js'

/** Debugging switches of `postgresPlugin({ debug })` (ADR-0320). */
export interface PostgresDebugOptions {
	/**
	 * Logs every statement and its duration at `info`, never parameter values.
	 * @example `debug: { logQueries: true }`
	 */
	readonly logQueries?: boolean
	/**
	 * Logs statements slower than this many milliseconds at `warn`, never
	 * parameter values; cheap enough for production.
	 * @example `debug: { slowQueryMs: 500 }`
	 */
	readonly slowQueryMs?: number
}

const hasQueryResultRows = (value: unknown): value is PostgresQueryResult =>
	typeof value === 'object' &&
	value !== null &&
	'rows' in value &&
	Array.isArray(value.rows)

/** Reads the statement text of `query(text, values)` or `query({ text })`. */
const readStatement = (arguments_: readonly unknown[]): string => {
	const [first] = arguments_
	const text: unknown = isPlainRecord(first) ? first.text : first

	// Placeholders only: values travel separately and are never read here.
	return typeof text === 'string'
		? text.replaceAll(/\s+/gu, ' ').trim()
		: '(statement without text)'
}

type QueryRunner = (arguments_: readonly unknown[]) => unknown
type ObservedQuery = (...arguments_: unknown[]) => Promise<PostgresQueryResult>

/** Times one driver call and logs it according to the debug options. */
const createObservedQuery = (
	run: QueryRunner,
	options: PostgresDebugOptions,
	logger: Logger,
): ObservedQuery => {
	const { logQueries = false, slowQueryMs } = options

	return async (...arguments_: unknown[]): Promise<PostgresQueryResult> => {
		const started = performance.now()
		let failure: string | undefined

		try {
			const result: unknown = await run(arguments_)
			if (!hasQueryResultRows(result)) {
				throw new TypeError('PostgreSQL driver returned an invalid result')
			}
			return result
		} catch (error: unknown) {
			const code = readPostgresDriverCode(error)
			failure = code === undefined ? ' (failed)' : ` (failed, ${code})`
			throw error
		} finally {
			const duration = performance.now() - started
			const line = `${duration.toFixed(1)} ms${failure ?? ''}: ${readStatement(arguments_)}`

			if (slowQueryMs !== undefined && duration >= slowQueryMs) {
				logger.warn(`slow query (over ${String(slowQueryMs)} ms) ${line}`)
			} else if (logQueries) {
				logger.info(`query ${line}`)
			}
		}
	}
}

const observeClient = (
	client: PostgresPoolClient,
	options: PostgresDebugOptions,
	logger: Logger,
): PostgresPoolClient => ({
	query: createObservedQuery(
		(arguments_): unknown =>
			Reflect.apply(client.query.bind(client), undefined, arguments_),
		options,
		logger,
	),
	release: (error) => {
		client.release(error)
	},
})

/**
 * Wraps a pool so every statement, pooled or inside a borrowed transaction
 * client, is timed and logged without its values (ADR-0320).
 */
export const observePostgresQueries = (
	pool: PostgresPool,
	options: PostgresDebugOptions,
	logger: Logger,
): PostgresPool => ({
	connect: async () => observeClient(await pool.connect(), options, logger),
	end: () => pool.end(),
	query: createObservedQuery(
		(arguments_): unknown =>
			Reflect.apply(pool.query.bind(pool), undefined, arguments_),
		options,
		logger,
	),
})
