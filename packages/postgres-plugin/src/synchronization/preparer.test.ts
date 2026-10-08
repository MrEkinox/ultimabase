import { FrameworkError } from '@ultimabase/core'
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

		if (
			queryText.includes('pg_catalog.pg_index') ||
			queryText.includes('pg_catalog.pg_constraint')
		) {
			return Promise.resolve({ rows: [] })
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

describe('direct PostgreSQL schema preparation', () => {
	it('does not inspect or mutate structure under ignore policy', async () => {
		const pool = new PolicyFixturePool()

		await prepareDirectPostgresSchema(
			pool,
			new PostgresSchemaCatalog([ArticleSchema]),
			'ignore',
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

		await prepareDirectPostgresSchema(
			pool,
			new PostgresSchemaCatalog([ArticleSchema]),
			'override',
		)

		expect(pool.transactionQueries[0]).toBe('BEGIN')
		expect(pool.transactionQueries[1]).toContain(
			'CREATE TABLE "worker_one"."articles"',
		)
		expect(pool.transactionQueries.at(-1)).toBe('COMMIT')
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
		).catch((error: unknown) => error)

		expect(failure).toMatchObject({
			code: 'INTERNAL_ERROR',
			message:
				'PostgreSQL direct schema synchronization failed while applying: create table "articles" [SQLSTATE 42P07].',
		})
		expect(String(failure)).not.toContain('driver detail')
		expect(pool.transactionQueries.at(-1)).toBe('ROLLBACK')
	})
})
