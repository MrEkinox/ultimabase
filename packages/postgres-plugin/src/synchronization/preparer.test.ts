import { FrameworkError, type Logger } from '@ultimabase/core'
import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import type {
	PostgresPool,
	PostgresPoolClient,
	PostgresQueryResult,
} from '../connection/contracts.js'
import { PostgresSchemaCatalog } from '../schema/catalog.js'
import { prepareDirectPostgresSchema } from './preparer.js'

/** Records read and transactional statements across the pg-compatible boundary. */
class PolicyFixturePool implements PostgresPool {
	readonly poolQueries: string[] = []
	readonly transactionQueries: string[] = []

	constructor(
		private readonly columns: readonly unknown[] = [],
		private readonly failingStatement?: Readonly<{
			match: string
			code: string
		}>,
		private readonly constraints: readonly unknown[] = [],
	) {}

	connect(): Promise<PostgresPoolClient> {
		return Promise.resolve({
			query: (queryText: string): Promise<PostgresQueryResult> => {
				this.transactionQueries.push(queryText)
				if (
					this.failingStatement !== undefined &&
					queryText.includes(this.failingStatement.match)
				) {
					return Promise.reject(
						Object.assign(new Error('driver detail with a value'), {
							code: this.failingStatement.code,
						}),
					)
				}
				return Promise.resolve({ rows: [] })
			},
			release: () => undefined,
		})
	}

	end(): Promise<void> {
		return Promise.resolve()
	}

	query(queryText: string): Promise<PostgresQueryResult> {
		this.poolQueries.push(queryText)

		if (queryText.includes('current_schema')) {
			return Promise.resolve({ rows: [{ namespace: 'worker_one' }] })
		}

		if (queryText.includes('pg_catalog.pg_index')) {
			return Promise.resolve({ rows: [] })
		}

		if (queryText.includes('pg_catalog.pg_constraint')) {
			return Promise.resolve({ rows: this.constraints })
		}

		if (queryText.includes('pg_catalog.pg_attribute')) {
			return Promise.resolve({ rows: this.columns })
		}

		return Promise.resolve({ rows: [] })
	}
}

const ArticleSchema = UltimaBase.Schema.define({
	className: 'Article',
	fields: (field) => ({ title: field.string() }),
})

/** Records every log line by level. */
const createRecordingLogger = (): Logger &
	Readonly<{ lines: readonly string[] }> => {
	const lines: string[] = []
	const record =
		(level: string) =>
		(message: string): void => {
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

const silentLogger: Logger = createRecordingLogger()

/** One live catalog row of the `articles` table. */
const liveColumn = (
	name: string,
	type: string,
	nullable: boolean,
	defaultExpression: string | null = null,
): Readonly<Record<string, unknown>> => ({
	column_name: name,
	data_type: type,
	default_expression: defaultExpression,
	generated_kind: '',
	identity_kind: '',
	nullable,
	table_kind: 'r',
	table_name: 'articles',
})

/** The primary key of a live `articles` table. */
const primaryKey = {
	columns: ['id'],
	constraint_kind: 'p',
	constraint_name: 'articles_pkey',
	definition: 'PRIMARY KEY (id)',
	delete_action: null,
	table_name: 'articles',
	target_columns: [],
	target_table: null,
}

/** Serves one live `articles` table with its primary key. */
const createArticlesPool = (columns: readonly unknown[]): PolicyFixturePool =>
	new PolicyFixturePool(columns, undefined, [primaryKey])

/** The system columns of `articles`, as UltimaBase creates them. */
const systemColumns = [
	liveColumn('id', 'uuid', false),
	liveColumn('created_at', 'timestamp(3) with time zone', false),
	liveColumn('updated_at', 'timestamp(3) with time zone', false),
]

describe('direct PostgreSQL schema preparation', () => {
	it('does not inspect or mutate structure under ignore policy', async () => {
		const pool = new PolicyFixturePool()

		await prepareDirectPostgresSchema(
			pool,
			new PostgresSchemaCatalog([ArticleSchema]),
			'ignore',
			silentLogger,
		)

		expect(pool.poolQueries).toStrictEqual([])
		expect(pool.transactionQueries).toStrictEqual([])
	})

	it('reports deterministic drift without beginning a transaction', async () => {
		const pool = new PolicyFixturePool()
		let failure: unknown

		try {
			await prepareDirectPostgresSchema(
				pool,
				new PostgresSchemaCatalog([ArticleSchema]),
				'fail',
				silentLogger,
			)
		} catch (error: unknown) {
			failure = error
		}

		expect(failure).toBeInstanceOf(FrameworkError)
		expect(failure).toHaveProperty(
			'message',
			'PostgreSQL schema differs from the registered UltimaBase schemas. 1 change(s): create table "articles".',
		)
		expect(failure).toMatchObject({
			code: 'VALIDATION_ERROR',
			internalDetails: {
				kind: 'postgres-schema-drift',
				changes: [{ kind: 'create-table' }],
			},
		})
		expect(pool.transactionQueries).toStrictEqual([])
	})

	it('creates missing structures transactionally under override policy', async () => {
		const pool = new PolicyFixturePool()
		const logger = createRecordingLogger()

		await prepareDirectPostgresSchema(
			pool,
			new PostgresSchemaCatalog([ArticleSchema]),
			'override',
			logger,
		)

		expect(pool.transactionQueries[0]).toBe('BEGIN')
		expect(pool.transactionQueries[1]).toContain(
			'CREATE TABLE "worker_one"."articles"',
		)
		expect(pool.transactionQueries.at(-1)).toBe('COMMIT')
		// ADR-0320: one info line per applied change.
		expect(logger.lines).toStrictEqual([
			'info: schema change applied: create table "articles"',
		])
	})

	it('refuses unsupported managed structures before opening a transaction', async () => {
		const pool = new PolicyFixturePool([
			{
				column_name: 'title',
				data_type: 'text',
				default_expression: null,
				generated_kind: 's',
				identity_kind: '',
				nullable: true,
				table_kind: 'r',
				table_name: 'articles',
			},
		])

		await expect(
			prepareDirectPostgresSchema(
				pool,
				new PostgresSchemaCatalog([ArticleSchema]),
				'override',
				silentLogger,
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			internalDetails: { kind: 'postgres-schema-unsupported' },
		})
		expect(pool.transactionQueries).toStrictEqual([])
	})

	// Regression: a failed synchronization did not say which change failed.
	it('names the failing change and its SQLSTATE without driver text', async () => {
		const pool = new PolicyFixturePool([], {
			match: 'CREATE TABLE',
			code: '42P07',
		})

		const failure = await prepareDirectPostgresSchema(
			pool,
			new PostgresSchemaCatalog([ArticleSchema]),
			'override',
			silentLogger,
		).catch((error: unknown) => error)

		expect(failure).toMatchObject({
			code: 'INTERNAL_ERROR',
			message:
				'PostgreSQL direct schema synchronization failed while applying: create table "articles" [SQLSTATE 42P07].',
		})
		expect(String(failure)).not.toContain('driver detail')
		expect(pool.transactionQueries.at(-1)).toBe('ROLLBACK')
	})

	describe('safe synchronization (ADR-0320)', () => {
		it('refuses a required column no field declares and suggests renamedFrom', async () => {
			const pool = createArticlesPool([
				...systemColumns,
				liveColumn('headline', 'text', false),
			])

			const failure = await prepareDirectPostgresSchema(
				pool,
				new PostgresSchemaCatalog([ArticleSchema]),
				'override',
				silentLogger,
			).catch((error: unknown) => error)

			expect(failure).toMatchObject({
				code: 'VALIDATION_ERROR',
				message:
					'PostgreSQL schema has 1 required column(s) that no field declares, so every insert would fail: "articles"."headline" (text), which looks renamed to field title: declare postgres: { renamedFrom: \'headline\' } on that field or rename the column outside UltimaBase. Unless a column was renamed, make it optional, give it a default or drop it with a migration outside UltimaBase.',
				internalDetails: {
					kind: 'postgres-schema-unmanaged-required-column',
					columns: ['articles.headline'],
				},
			})
			expect(pool.transactionQueries).toStrictEqual([])
		})

		it('refuses an unmanaged required column even without other changes', async () => {
			const pool = createArticlesPool([
				...systemColumns,
				liveColumn('title', 'text', true),
				liveColumn('legacy', 'bigint', false),
			])

			await expect(
				prepareDirectPostgresSchema(
					pool,
					new PostgresSchemaCatalog([ArticleSchema]),
					'override',
					silentLogger,
				),
			).rejects.toThrow(
				'every insert would fail: "articles"."legacy" (bigint). Unless',
			)
		})

		it('keeps unmanaged columns with a default or under fail and ignore', async () => {
			const columns = [
				...systemColumns,
				liveColumn('title', 'text', true),
				liveColumn('legacy', 'bigint', false, '0'),
			]

			for (const policy of ['override', 'fail', 'ignore'] as const) {
				await expect(
					prepareDirectPostgresSchema(
						createArticlesPool(columns),
						new PostgresSchemaCatalog([ArticleSchema]),
						policy,
						silentLogger,
					),
				).resolves.toBeUndefined()
			}
		})

		it('warns about an optional column that looks renamed and applies the plan', async () => {
			const pool = createArticlesPool([
				...systemColumns,
				liveColumn('headline', 'text', true),
			])
			const logger = createRecordingLogger()

			await prepareDirectPostgresSchema(
				pool,
				new PostgresSchemaCatalog([ArticleSchema]),
				'override',
				logger,
			)

			expect(logger.lines).toStrictEqual([
				'warn: column "articles"."headline" (text), which looks renamed to field title: declare postgres: { renamedFrom: \'headline\' } on that field or rename the column outside UltimaBase; otherwise its data stays in the old column.',
				'info: schema change applied: add column "articles"."title" (text, optional)',
			])
			expect(pool.transactionQueries).toContain(
				'ALTER TABLE "worker_one"."articles" ADD COLUMN "title" text',
			)
		})

		it('refuses a narrowing or reinterpreting type change', async () => {
			const pool = createArticlesPool([
				...systemColumns,
				liveColumn('title', 'double precision', true),
			])

			const failure = await prepareDirectPostgresSchema(
				pool,
				new PostgresSchemaCatalog([ArticleSchema]),
				'override',
				silentLogger,
			).catch((error: unknown) => error)

			expect(failure).toMatchObject({
				code: 'VALIDATION_ERROR',
				message:
					'PostgreSQL direct synchronization applies only widening type conversions; it refuses 1 change(s): change type of "articles"."title" from double precision to text. Restore the field type, or convert the column with a migration outside UltimaBase.',
				internalDetails: {
					kind: 'postgres-schema-unsafe-type-change',
					changes: [{ kind: 'alter-column-type', column: 'title' }],
				},
			})
			expect(pool.transactionQueries).toStrictEqual([])
		})

		it('applies and logs a widening type change', async () => {
			const Price = UltimaBase.Schema.define({
				className: 'Article',
				fields: (field) => ({
					title: field.decimal({ precision: 12, scale: 2 }),
				}),
			})
			const pool = createArticlesPool([
				...systemColumns,
				liveColumn('title', 'numeric(10,2)', true),
			])
			const logger = createRecordingLogger()

			await prepareDirectPostgresSchema(
				pool,
				new PostgresSchemaCatalog([Price]),
				'override',
				logger,
			)

			expect(pool.transactionQueries).toContain(
				'ALTER TABLE "worker_one"."articles" ALTER COLUMN "title" TYPE numeric(12, 2) USING "title"::numeric(12, 2)',
			)
			expect(logger.lines).toStrictEqual([
				'info: schema change applied: change type of "articles"."title" from numeric(10,2) to numeric(12, 2)',
			])
		})
	})
})
