import { FrameworkError } from '@ultimabase/core'
import { Schema, stringField } from '@ultimabase/core'
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

	constructor(private readonly columns: readonly unknown[] = []) {}

	connect(): Promise<PostgresPoolClient> {
		return Promise.resolve({
			query: (queryText: string): Promise<PostgresQueryResult> => {
				this.transactionQueries.push(queryText)
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

const ArticleSchema = Schema.define({
	className: 'Article',
	fields: { title: stringField() },
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
})
