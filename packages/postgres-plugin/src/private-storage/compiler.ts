import { createHash } from 'node:crypto'

import type {
	PrivateStorageAdapterCollection,
	SchemaIndexDefinition,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import { getColumns } from 'drizzle-orm'
import {
	foreignKey,
	getTableConfig,
	pgTable,
	type AnyPgColumnBuilder,
	type PgColumn,
	type UpdateDeleteAction,
} from 'drizzle-orm/pg-core'

import { createPostgresForeignKeyName } from '../naming/foreign-key.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import { compilePostgresFieldBuilder } from '../schema/field-compiler.js'
import { compilePostgresIndexBuilders } from '../schema/index-compiler.js'
import type { CompiledPostgresField } from '../schema/contracts.js'
import type { CompiledPostgresPrivateCollection } from './contracts.js'

const privateTableName = (
	collection: PrivateStorageAdapterCollection,
): string => {
	const identity = JSON.stringify([
		collection.owner.pluginId,
		collection.owner.instanceId ?? null,
		collection.contributionId,
	])
	return `_ub_private_${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`
}

const postgresDeleteAction: Readonly<
	Record<'cascade' | 'fail', UpdateDeleteAction>
> = {
	cascade: 'cascade',
	fail: 'restrict',
}

/** Compiles one Core-attributed private descriptor without registering a public schema. */
export const compilePostgresPrivateCollection = (
	collection: PrivateStorageAdapterCollection,
	publicSchemas: PostgresSchemaCatalog,
): CompiledPostgresPrivateCollection => {
	const tableName = privateTableName(collection)
	const pending = Object.entries(collection.fields).map(([name, field]) => {
		const compiled = compilePostgresFieldBuilder(name, field.create)
		return [name, compiled] as const
	})
	const builders = Object.fromEntries(
		pending.map(([name, field]) => [name, field.builder]),
	) as Record<string, AnyPgColumnBuilder>
	const storageByField = immutableRecord(
		Object.fromEntries(pending.map(([name, field]) => [name, field.storage])),
	)
	const indexes: readonly SchemaIndexDefinition[] = collection.indexes.map(
		(index) =>
			immutableRecord({
				fields: index.fields as readonly [string, ...string[]],
				unique: true,
			}),
	)
	const table = pgTable(tableName, builders, (columns) => [
		...compilePostgresIndexBuilders(
			tableName,
			indexes,
			columns,
			storageByField,
		),
		...collection.references.map((reference) => {
			const source = columns[reference.field]
			const target = getColumns(publicSchemas.get(reference.target).table).id
			if (source === undefined || target === undefined) {
				throw new TypeError(
					'PostgreSQL private reference column is unavailable',
				)
			}
			return foreignKey({
				columns: [source],
				foreignColumns: [target],
				name: createPostgresForeignKeyName(
					tableName,
					reference.field,
					publicSchemas.get(reference.target).tableName,
					'id',
				),
			}).onDelete(postgresDeleteAction[reference.onDelete])
		}),
	])
	const columns = Object.fromEntries(
		getTableConfig(table).columns.map((column) => [column.name, column]),
	) as Readonly<Record<string, PgColumn>>
	const fields = immutableRecord(
		Object.fromEntries(
			pending.map(([name, field]) => {
				const column = columns[name]
				if (column === undefined)
					throw new TypeError(`PostgreSQL omitted private field: ${name}`)
				const plan = collection.fields[name]
				if (plan === undefined)
					throw new TypeError(`PostgreSQL private plan is unavailable: ${name}`)
				const compiled: CompiledPostgresField = immutableRecord({
					column,
					...(field.generation === undefined
						? {}
						: { generation: field.generation }),
					plan: plan.create,
					storage: field.storage,
				})
				return [name, compiled]
			}),
		),
	)
	return immutableRecord({ definition: collection, fields, table, tableName })
}
