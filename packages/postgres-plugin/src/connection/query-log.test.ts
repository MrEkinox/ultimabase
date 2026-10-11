import type { Logger } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import type {
	PostgresPool,
	PostgresPoolClient,
	PostgresQueryResult,
} from './contracts.js'
import { observePostgresQueries } from './query-log.js'

/** Answers every statement after an optional delay; one statement fails. */
class TimedPool implements PostgresPool {
	readonly received: unknown[][] = []
	ended = false

	constructor(private readonly delayMs = 0) {}

	async #answer(arguments_: unknown[]): Promise<PostgresQueryResult> {
		this.received.push(arguments_)
		await new Promise((resolve) => setTimeout(resolve, this.delayMs))
		const [first] = arguments_
		if (typeof first === 'string' && first.includes('missing_table')) {
			throw Object.assign(new Error('relation "missing_table" value 42'), {
				code: '42P01',
			})
		}
		return { rows: [{ value: 1 }] }
	}

	connect(): Promise<PostgresPoolClient> {
		return Promise.resolve({
			query: (...arguments_: unknown[]) => this.#answer(arguments_),
			release: () => undefined,
		})
	}

	end(): Promise<void> {
		this.ended = true
		return Promise.resolve()
	}

	query(...arguments_: unknown[]): Promise<PostgresQueryResult> {
		return this.#answer(arguments_)
	}
}

const createRecordingLogger = (): Logger & { readonly lines: string[] } => {
	const lines: string[] = []
	const record = (level: string) => (message: string) => {
		lines.push(`${level}: ${message}`)
	}
	return {
		debug: record('debug'),
		error: record('error'),
		info: record('info'),
		lines,
		warn: record('warn'),
	}
}

/** Replaces the measured duration, which varies between runs. */
const withoutDurations = (lines: readonly string[]): string[] =>
	lines.map((line) => line.replaceAll(/\d+\.\d ms/gu, 'N ms'))

describe('PostgreSQL query log (ADR-0320)', () => {
	it('logs pooled and transaction statements at info without their values', async () => {
		const pool = new TimedPool()
		const logger = createRecordingLogger()
		const observed = observePostgresQueries(pool, { logQueries: true }, logger)

		await expect(
			observed.query('select *\n  from "posts" where "id" = $1', [
				'secret-value',
			]),
		).resolves.toStrictEqual({ rows: [{ value: 1 }] })
		const client = await observed.connect()
		await client.query('BEGIN')
		// Drizzle passes a query config object.
		await Reflect.apply(client.query.bind(client), undefined, [
			{ text: 'update "posts" set "title" = $1', rowMode: 'array' },
			['secret-title'],
		])
		client.release()
		await observed.end()

		expect(withoutDurations(logger.lines)).toStrictEqual([
			'info: query N ms: select * from "posts" where "id" = $1',
			'info: query N ms: BEGIN',
			'info: query N ms: update "posts" set "title" = $1',
		])
		expect(logger.lines.join('\n')).not.toContain('secret')
		// The driver still receives the values.
		expect(pool.received[0]).toStrictEqual([
			'select *\n  from "posts" where "id" = $1',
			['secret-value'],
		])
		expect(pool.ended).toBe(true)
	})

	it('logs only statements over slowQueryMs, at warn', async () => {
		const logger = createRecordingLogger()
		const slow = observePostgresQueries(
			new TimedPool(30),
			{ slowQueryMs: 10 },
			logger,
		)
		const fast = observePostgresQueries(
			new TimedPool(0),
			{ slowQueryMs: 10_000 },
			logger,
		)

		await slow.query('select pg_sleep($1)', [0.03])
		await fast.query('select 1')

		expect(withoutDurations(logger.lines)).toStrictEqual([
			'warn: slow query (over 10 ms) N ms: select pg_sleep($1)',
		])
	})

	it('marks a failed statement with its SQLSTATE and rethrows the driver error', async () => {
		const logger = createRecordingLogger()
		const observed = observePostgresQueries(
			new TimedPool(),
			{ logQueries: true },
			logger,
		)

		await expect(observed.query('select * from missing_table')).rejects.toThrow(
			'relation "missing_table" value 42',
		)
		expect(withoutDurations(logger.lines)).toStrictEqual([
			'info: query N ms (failed, 42P01): select * from missing_table',
		])
	})
})
