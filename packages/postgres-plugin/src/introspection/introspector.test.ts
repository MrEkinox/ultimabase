import { describe, expect, it } from 'vitest'

import type {
	PostgresPool,
	PostgresPoolClient,
	PostgresQueryResult,
} from '../connection/contracts.js'
import { introspectPostgresDatabase } from './introspector.js'

interface CatalogFixtures {
	readonly columns: readonly unknown[]
	readonly constraints: readonly unknown[]
	readonly indexes: readonly unknown[]
}

/** Supplies deterministic catalog rows without coupling unit tests to Docker. */
class FixtureCatalogPool implements PostgresPool {
	readonly queries: string[] = []

	constructor(private readonly fixtures: CatalogFixtures) {}

	connect(): Promise<PostgresPoolClient> {
		return Promise.resolve({
			query: (): never => {
				throw new TypeError('Catalog fixture does not execute transactions')
			},
			release: () => undefined,
		})
	}

	end(): Promise<void> {
		return Promise.resolve()
	}

	query(queryText: string): Promise<PostgresQueryResult> {
		this.queries.push(queryText)

		const rows = queryText.includes('pg_catalog.pg_index')
			? this.fixtures.indexes
			: queryText.includes('pg_catalog.pg_constraint')
				? this.fixtures.constraints
				: this.fixtures.columns

		return Promise.resolve({ rows })
	}
}

const fixtures: CatalogFixtures = {
	columns: [
		{
			column_name: 'id',
			data_type: 'uuid',
			default_expression: null,
			generated_kind: '',
			identity_kind: '',
			nullable: false,
			table_kind: 'r',
			table_name: 'articles',
		},
		{
			column_name: 'title',
			data_type: 'text',
			default_expression: "'draft'::text",
			generated_kind: '',
			identity_kind: '',
			nullable: false,
			table_kind: 'r',
			table_name: 'articles',
		},
		{
			column_name: 'sequence',
			data_type: 'bigint',
			default_expression: null,
			generated_kind: '',
			identity_kind: 'd',
			nullable: false,
			table_kind: 'r',
			table_name: 'articles',
		},
		{
			column_name: 'legacy_range',
			data_type: 'int4range',
			default_expression: null,
			generated_kind: 's',
			identity_kind: '',
			nullable: true,
			table_kind: 'p',
			table_name: 'legacy_records',
		},
		{
			column_name: 'visible',
			data_type: 'text',
			default_expression: null,
			generated_kind: '',
			identity_kind: '',
			nullable: true,
			table_kind: 'v',
			table_name: 'report_view',
		},
		{
			column_name: null,
			data_type: null,
			default_expression: null,
			generated_kind: null,
			identity_kind: null,
			nullable: null,
			table_kind: 'r',
			table_name: 'unused_table',
		},
	],
	indexes: [
		{
			columns: ['id'],
			definition:
				'CREATE UNIQUE INDEX articles_pkey ON public.articles USING btree (id)',
			expressions: null,
			has_included_columns: false,
			index_name: 'articles_pkey',
			is_primary: true,
			is_unique: true,
			method: 'btree',
			predicate: null,
			table_name: 'articles',
		},
		{
			columns: [],
			definition:
				'CREATE INDEX legacy_lower_idx ON public.legacy_records USING hash (lower(name)) WHERE active',
			expressions: 'lower(name)',
			has_included_columns: true,
			index_name: 'legacy_lower_idx',
			is_primary: false,
			is_unique: false,
			method: 'hash',
			predicate: 'active',
			table_name: 'legacy_records',
		},
	],
	constraints: [
		{
			columns: ['id'],
			constraint_kind: 'p',
			constraint_name: 'articles_pkey',
			definition: 'PRIMARY KEY (id)',
			table_name: 'articles',
		},
		{
			columns: ['owner_id'],
			constraint_kind: 'f',
			constraint_name: 'legacy_owner_fk',
			delete_action: 'r',
			definition: 'FOREIGN KEY (owner_id) REFERENCES owners(id)',
			table_name: 'legacy_records',
			target_columns: ['id'],
			target_table: 'owners',
		},
	],
}

describe('PostgreSQL catalog introspection', () => {
	it('normalizes managed and unrelated structures deterministically', async () => {
		const pool = new FixtureCatalogPool(fixtures)
		const snapshot = await introspectPostgresDatabase(pool, 'public', [
			'articles',
		])

		expect(snapshot.namespace).toBe('public')
		expect(
			snapshot.tables.map(({ name, managed }) => ({ managed, name })),
		).toStrictEqual([
			{ managed: true, name: 'articles' },
			{ managed: false, name: 'legacy_records' },
			{ managed: false, name: 'report_view' },
			{ managed: false, name: 'unused_table' },
		])
		expect(snapshot.tables[3]?.columns).toStrictEqual([])
		expect(snapshot.tables[0]).toMatchObject({
			columns: [
				{ name: 'id', nullable: false, type: 'uuid' },
				{
					defaultExpression: "'draft'::text",
					name: 'title',
					nullable: false,
					type: 'text',
				},
				{
					identity: 'byDefault',
					name: 'sequence',
					nullable: false,
					type: 'bigint',
				},
			],
			constraints: [{ kind: 'p', name: 'articles_pkey' }],
			indexes: [
				{
					columns: ['id'],
					method: 'btree',
					name: 'articles_pkey',
					primary: true,
					unique: true,
				},
			],
		})
		expect(snapshot.tables[1]?.constraints).toContainEqual({
			columns: ['owner_id'],
			definition: 'FOREIGN KEY (owner_id) REFERENCES owners(id)',
			kind: 'f',
			name: 'legacy_owner_fk',
			onDelete: 'restrict',
			targetColumns: ['id'],
			targetTable: 'owners',
		})
		expect(snapshot.unsupported).toStrictEqual([
			{
				kind: 'partitioned-table',
				name: 'legacy_records',
				table: 'legacy_records',
			},
			{ kind: 'column-type', name: 'legacy_range', table: 'legacy_records' },
			{
				kind: 'column-generated',
				name: 'legacy_range',
				table: 'legacy_records',
			},
			{ kind: 'table-kind', name: 'report_view', table: 'report_view' },
			{
				kind: 'index-method',
				name: 'legacy_lower_idx',
				table: 'legacy_records',
			},
			{
				kind: 'index-partial',
				name: 'legacy_lower_idx',
				table: 'legacy_records',
			},
			{
				kind: 'index-expression',
				name: 'legacy_lower_idx',
				table: 'legacy_records',
			},
			{
				kind: 'index-included-columns',
				name: 'legacy_lower_idx',
				table: 'legacy_records',
			},
		])
		expect(Object.isFrozen(snapshot)).toBe(true)
		expect(Object.isFrozen(snapshot.tables)).toBe(true)

		// Catalog names must be text arrays so `pg` returns string arrays instead of literals.
		const collectionQueries = pool.queries.filter((query) =>
			query.includes(') AS columns'),
		)
		expect(collectionQueries).toHaveLength(2)
		expect(
			collectionQueries.every((query) =>
				query.includes('SELECT attribute.attname::text'),
			),
		).toBe(true)
		expect(
			pool.queries.some((query) => query.includes('AS target_columns')),
		).toBe(true)
	})

	it('rejects malformed driver results at the unknown boundary', async () => {
		const pool = new FixtureCatalogPool({
			columns: [null],
			constraints: [],
			indexes: [],
		})

		await expect(
			introspectPostgresDatabase(pool, 'public', []),
		).rejects.toThrow(
			new TypeError('PostgreSQL catalog row must be a plain object'),
		)
	})

	it('rejects invalid namespace and unknown identity metadata', async () => {
		await expect(
			introspectPostgresDatabase(new FixtureCatalogPool(fixtures), '', []),
		).rejects.toThrow(
			new TypeError('PostgreSQL namespace must be a non-empty string'),
		)

		const firstColumn = fixtures.columns[0]

		if (typeof firstColumn !== 'object' || firstColumn === null) {
			throw new TypeError('Expected a catalog column fixture')
		}

		const invalidIdentityPool = new FixtureCatalogPool({
			columns: [{ ...firstColumn, identity_kind: 'future' }],
			constraints: [],
			indexes: [],
		})

		await expect(
			introspectPostgresDatabase(invalidIdentityPool, 'public', []),
		).rejects.toThrow(new TypeError('Unknown PostgreSQL identity kind: future'))
	})
})
