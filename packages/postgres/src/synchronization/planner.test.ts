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
	indexes: [
		{
			columns: ['title'],
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
	it('plans add, change, rename, and drop operations deterministically', () => {
		const changes = planPostgresSchemaChanges([desired], live)

		expect(changes.map(({ kind }) => kind)).toStrictEqual([
			'rename-column',
			'alter-column-type',
			'set-column-nullability',
			'set-column-default',
			'add-column',
			'drop-index',
			'create-index',
			'drop-column',
		])
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
})
