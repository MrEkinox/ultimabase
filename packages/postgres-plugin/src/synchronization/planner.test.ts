import { describe, expect, it } from 'vitest'

import type { PostgresDatabaseSnapshot } from '../introspection/contracts.js'
import type { DesiredPostgresTable } from './contracts.js'
import { planPostgresSchemaChanges } from './planner.js'

const desired: DesiredPostgresTable = {
	columns: [
		{
			name: 'id',
			nullable: false,
			primary: true,
			type: 'uuid',
		},
		{
			defaultExpression: "'draft'::text",
			name: 'title',
			nullable: false,
			primary: false,
			renamedFrom: 'headline',
			type: 'text',
		},
		{
			name: 'views',
			nullable: true,
			primary: false,
			type: 'bigint',
		},
	],
	foreignKeys: [],
	indexes: [
		{
			columns: ['title'],
			method: 'btree',
			name: 'articles_title_idx',
			unique: false,
		},
	],
	name: 'articles',
}

const live: PostgresDatabaseSnapshot = {
	namespace: 'public',
	tables: [
		{
			columns: [
				{ name: 'id', nullable: false, type: 'uuid' },
				{ name: 'headline', nullable: true, type: 'varchar' },
				{ name: 'obsolete', nullable: true, type: 'text' },
			],
			constraints: [
				{
					columns: ['id'],
					definition: 'PRIMARY KEY (id)',
					kind: 'p',
					name: 'articles_pkey',
				},
			],
			indexes: [
				{
					columns: ['id'],
					definition: 'CREATE UNIQUE INDEX articles_pkey',
					method: 'btree',
					name: 'articles_pkey',
					primary: true,
					unique: true,
				},
				{
					columns: ['obsolete'],
					definition: 'CREATE INDEX legacy_idx',
					method: 'btree',
					name: 'legacy_idx',
					primary: false,
					unique: false,
				},
			],
			managed: true,
			name: 'articles',
		},
		{
			columns: [{ name: 'value', nullable: true, type: 'text' }],
			constraints: [],
			indexes: [],
			managed: false,
			name: 'external_data',
		},
	],
	unsupported: [],
}

describe('PostgreSQL schema change planner', () => {
	it('creates tables before adding circular-safe foreign keys', () => {
		const users: DesiredPostgresTable = {
			columns: [{ name: 'id', nullable: false, primary: true, type: 'uuid' }],
			foreignKeys: [],
			indexes: [],
			name: 'users',
		}
		const posts: DesiredPostgresTable = {
			columns: [
				{ name: 'id', nullable: false, primary: true, type: 'uuid' },
				{ name: 'author', nullable: false, primary: false, type: 'uuid' },
			],
			foreignKeys: [
				{
					column: 'author',
					name: 'posts_author_fk',
					onDelete: 'cascade',
					targetColumn: 'id',
					targetTable: 'users',
				},
			],
			indexes: [],
			name: 'posts',
		}
		const changes = planPostgresSchemaChanges([posts, users], {
			namespace: 'public',
			tables: [],
			unsupported: [],
		})

		expect(changes.map(({ kind }) => kind)).toStrictEqual([
			'create-table',
			'create-table',
			'add-foreign-key',
		])
	})

	it('replaces foreign keys when their target action drifts', () => {
		const [articleTable, ...otherTables] = live.tables

		if (articleTable === undefined) {
			throw new TypeError('Planner fixture requires the articles table')
		}

		const pointerDesired: DesiredPostgresTable = {
			columns: desired.columns,
			foreignKeys: [
				{
					column: 'title',
					name: 'articles_title_fk',
					onDelete: 'cascade',
					targetColumn: 'id',
					targetTable: 'owners',
				},
			],
			indexes: desired.indexes,
			name: desired.name,
		}
		const changes = planPostgresSchemaChanges([pointerDesired], {
			...live,
			tables: [
				{
					...articleTable,
					constraints: [
						...articleTable.constraints,
						{
							columns: ['title'],
							definition: 'FOREIGN KEY (title) REFERENCES owners(id)',
							kind: 'f',
							name: 'articles_title_fk',
							onDelete: 'restrict',
							targetColumns: ['id'],
							targetTable: 'owners',
						},
					],
				},
				...otherTables,
			],
		})

		expect(changes[0]).toMatchObject({
			constraint: 'articles_title_fk',
			kind: 'drop-constraint',
		})
		expect(changes.at(-1)).toMatchObject({
			kind: 'add-foreign-key',
		})
	})

	it('plans additive changes without inferring destructive column removal', () => {
		const changes = planPostgresSchemaChanges([desired], live)

		expect(changes.map(({ kind }) => kind)).toStrictEqual([
			'rename-column',
			'alter-column-type',
			'set-column-nullability',
			'set-column-default',
			'add-column',
			'drop-index',
			'create-index',
		])
		expect(
			changes.some(
				(change) =>
					change.kind === 'drop-column' && change.column === 'obsolete',
			),
		).toBe(false)
		expect(changes[0]).toStrictEqual({
			from: 'headline',
			kind: 'rename-column',
			table: 'articles',
			to: 'title',
		})
		expect(
			changes.some(
				(change) => 'table' in change && change.table === 'external_data',
			),
		).toBe(false)
		expect(Object.isFrozen(changes)).toBe(true)
	})

	it('plans direct decimal shape changes as physical numeric type changes', () => {
		const decimalDesired: DesiredPostgresTable = {
			columns: [
				{
					name: 'amount',
					nullable: true,
					primary: false,
					type: 'numeric(18, 4)',
				},
			],
			foreignKeys: [],
			indexes: [],
			name: 'accounts',
		}
		const changes = planPostgresSchemaChanges([decimalDesired], {
			namespace: 'public',
			tables: [
				{
					columns: [{ name: 'amount', nullable: true, type: 'numeric(12, 2)' }],
					constraints: [],
					indexes: [],
					managed: true,
					name: 'accounts',
				},
			],
			unsupported: [],
		})

		expect(changes).toStrictEqual([
			{
				column: 'amount',
				from: 'numeric(12, 2)',
				kind: 'alter-column-type',
				table: 'accounts',
				to: 'numeric(18, 4)',
			},
		])
	})

	it('creates missing tables and reports unsupported managed structures', () => {
		expect(
			planPostgresSchemaChanges([desired], {
				namespace: 'public',
				tables: [],
				unsupported: [],
			}),
		).toMatchObject([{ kind: 'create-table' }])

		expect(
			planPostgresSchemaChanges([desired], {
				...live,
				unsupported: [
					{ kind: 'column-generated', name: 'title', table: 'articles' },
				],
			})[0],
		).toStrictEqual({
			kind: 'unsupported-structure',
			structure: 'column-generated:title',
			table: 'articles',
		})
	})

	it('replaces an index when its physical method drifts', () => {
		const ginDesired: DesiredPostgresTable = {
			...desired,
			indexes: [
				{
					columns: ['title'],
					method: 'gin',
					name: 'articles_title_idx',
					unique: false,
				},
			],
		}
		const article = live.tables[0]

		if (article === undefined) {
			throw new TypeError('Planner fixture requires the articles table')
		}

		const changes = planPostgresSchemaChanges([ginDesired], {
			...live,
			tables: [
				{
					...article,
					indexes: [
						...article.indexes,
						{
							columns: ['title'],
							definition: 'CREATE INDEX articles_title_idx',
							method: 'btree',
							name: 'articles_title_idx',
							primary: false,
							unique: false,
						},
					],
				},
			],
		})

		expect(changes).toContainEqual({
			index: ginDesired.indexes[0],
			kind: 'create-index',
			table: 'articles',
		})
		expect(changes).toContainEqual({
			index: 'articles_title_idx',
			kind: 'drop-index',
			table: 'articles',
		})
	})
})
