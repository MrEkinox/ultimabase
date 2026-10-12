import { createHash } from 'node:crypto'

import type { PrivateStorageAdapterCollection } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import { getColumns } from 'drizzle-orm'
import {
	foreignKey,
	getTableConfig,
	pgTable,
	type PgTable,
	type UpdateDeleteAction,
} from 'drizzle-orm/pg-core'

import {
	assertDistinctPostgresColumns,
	createPostgresForeignKeyName,
	toPostgresColumnName,
} from '../naming.js'
import { required } from '../required.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { CompiledPostgresField } from '../schema/contracts.js'
import { compilePostgresFieldBuilder } from '../schema/field-compiler.js'
import { compilePostgresIndexBuilders } from '../schema/index-compiler.js'

/** Keeps one private descriptor beside its non-public compiled PostgreSQL table. */
export interface CompiledPostgresPrivateCollection {
	readonly definition: PrivateStorageAdapterCollection
	readonly fields: Readonly<Record<string, CompiledPostgresField>>
	readonly table: PgTable
	readonly tableName: string
}

const postgresDeleteActions: Readonly<
	Record<'cascade' | 'fail', UpdateDeleteAction>
> = { cascade: 'cascade', fail: 'restrict' }

/** Compiles one Core-attributed private descriptor without registering a public schema. */
export const compilePostgresPrivateCollection = (
	collection: PrivateStorageAdapterCollection,
	publicSchemas: PostgresSchemaCatalog,
): CompiledPostgresPrivateCollection => {
	// Hashing the owner identity keeps plugin and contribution names out of SQL.
	const identity = JSON.stringify([
		collection.owner.pluginId,
		collection.owner.instanceId ?? null,
		collection.contributionId,
	])
	const tableName = `_ub_private_${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`
	assertDistinctPostgresColumns(tableName, Object.keys(collection.fields))
	const pending = Object.entries(collection.fields).map(
		([name, field]) =>
			[
				name,
				field.create,
				compilePostgresFieldBuilder(name, field.create),
			] as const,
	)
	const table = pgTable(
		tableName,
		Object.fromEntries(pending.map(([name, , field]) => [name, field.builder])),
		(columns) => [
			...compilePostgresIndexBuilders(
				tableName,
				[
					...collection.indexes.map(({ fields }) => ({ fields, unique: true })),
					...collection.lookups.map(({ fields }) => ({
						fields,
						unique: false,
					})),
				],
				columns,
				new Map(pending.map(([name, , field]) => [name, field.storage])),
			),
			...collection.references.map((reference) => {
				const target = publicSchemas.get(reference.target)

				return foreignKey({
					columns: [
						required(
							columns[reference.field],
							'PostgreSQL private reference column is unavailable',
						),
					],
					foreignColumns: [
						required(
							getColumns(target.table).id,
							'PostgreSQL private reference column is unavailable',
						),
					],
					name: createPostgresForeignKeyName(
						tableName,
						toPostgresColumnName(reference.field),
						target.tableName,
						'id',
					),
				}).onDelete(postgresDeleteActions[reference.onDelete])
			}),
		],
	)
	const columns = new Map(
		getTableConfig(table).columns.map((column) => [column.name, column]),
	)
	const fields = Object.fromEntries(
		pending.map(([name, plan, field]): [string, CompiledPostgresField] => [
			name,
			immutableRecord({
				column: required(
					columns.get(toPostgresColumnName(name)),
					`PostgreSQL omitted private field: ${name}`,
				),
				...(field.generation === undefined
					? {}
					: { generation: field.generation }),
				plan,
				storage: field.storage,
			}),
		]),
	)

	return immutableRecord({
		definition: collection,
		fields: immutableRecord(fields),
		table,
		tableName,
	})
}
