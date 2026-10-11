import { Buffer } from 'node:buffer'

import {
	Schema,
	readPluginFieldExistingRows,
	type PluginFieldExistingRows,
	type PointerReferentialAction,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { getTableName } from 'drizzle-orm'
import {
	getTableConfig,
	type PgColumn,
	type PgTable,
	type UpdateDeleteAction,
} from 'drizzle-orm/pg-core'

import { required } from '../required.js'
import type {
	CompiledPostgresField,
	CompiledPostgresJoinRelation,
} from '../schema/contracts.js'
import {
	readDrizzleIndexColumns,
	readDrizzleIndexMethod,
	readDrizzleIndexName,
	readPostgresIndexPredicate,
} from '../schema/index-compiler.js'
import type { DesiredPostgresTable } from './contracts.js'

const quoteLiteral = (value: string): string =>
	`'${value.replaceAll("'", "''")}'`

const renderDefaultExpression = (
	column: PgColumn,
	type: string,
): string | undefined => {
	const declaredDefault: unknown = column.default

	if (declaredDefault === undefined) return undefined
	return renderValueExpression(column, type, declaredDefault)
}

/** Renders one logical value of `column` as an SQL literal. */
const renderValueExpression = (
	column: PgColumn,
	type: string,
	logical: unknown,
): string => {
	// Drizzle columns own logical-to-storage mapping for static defaults too.
	const value: unknown =
		logical === null ? null : column.mapToDriverValue(logical)

	if (value === null) {
		return type === 'jsonb' ? "'null'::jsonb" : 'NULL'
	}

	if (
		typeof value === 'boolean' ||
		typeof value === 'number' ||
		typeof value === 'bigint'
	) {
		return String(value)
	}

	if (value instanceof Uint8Array) {
		return `decode(${quoteLiteral(Buffer.from(value).toString('hex'))}, 'hex')`
	}

	const text: unknown = type === 'jsonb' ? JSON.stringify(value) : value

	if (typeof text !== 'string') {
		throw new TypeError(
			`Unsupported Drizzle PostgreSQL default: ${column.name}`,
		)
	}

	return `${quoteLiteral(text)}::${type}`
}

const foreignKeyActions = new Map<
	UpdateDeleteAction | undefined,
	PointerReferentialAction
>([
	['cascade', 'cascade'],
	['restrict', 'restrict'],
	['set null', 'setNull'],
])

/** Logical facts of one column that Drizzle metadata does not carry. */
interface DesiredColumnFacts {
	readonly existingRows?: PluginFieldExistingRows
	readonly field: string
	readonly renamedFrom?: string
}

const compileDesiredTable = (
	table: PgTable,
	factsByColumn: ReadonlyMap<string, DesiredColumnFacts>,
): DesiredPostgresTable => {
	const config = getTableConfig(table)
	const tablePrimaryColumns = new Set(
		config.primaryKeys.flatMap(({ columns }) =>
			columns.map(({ name }) => name),
		),
	)

	return immutableRecord({
		columns: immutableArray(
			config.columns.map((column) => {
				const type = column
					.getSQLType()
					.replace(/\s+\(/gu, '(')
					.replaceAll(/\s+/gu, ' ')
					.trim()
				const defaultExpression = renderDefaultExpression(column, type)
				const identity = column.generatedIdentity?.type
				const facts = factsByColumn.get(column.name)
				const renamedFrom = facts?.renamedFrom
				const backfill = facts?.existingRows
				const existingRows =
					backfill === undefined
						? undefined
						: 'missing' in backfill
							? immutableRecord({ missing: backfill.missing })
							: immutableRecord({
									expression: renderValueExpression(
										column,
										type,
										backfill.value,
									),
								})

				return immutableRecord({
					...(defaultExpression === undefined ? {} : { defaultExpression }),
					...(existingRows === undefined ? {} : { existingRows }),
					...(facts === undefined ? {} : { field: facts.field }),
					...(identity === undefined ? {} : { identity }),
					name: column.name,
					nullable: !column.notNull,
					primary: column.primary || tablePrimaryColumns.has(column.name),
					...(renamedFrom === undefined ? {} : { renamedFrom }),
					type,
				})
			}),
		),
		foreignKeys: immutableArray(
			config.foreignKeys.map((foreignKey) => {
				const reference = foreignKey.reference()
				const [sourceColumn] = reference.columns
				const [targetColumn] = reference.foreignColumns
				const name = foreignKey.getName()

				if (
					reference.columns.length !== 1 ||
					reference.foreignColumns.length !== 1 ||
					sourceColumn === undefined ||
					targetColumn === undefined
				) {
					throw new TypeError(
						`PostgreSQL direct synchronization requires a single-column foreign key: ${name}`,
					)
				}

				return immutableRecord({
					column: sourceColumn.name,
					name,
					onDelete: required(
						foreignKeyActions.get(foreignKey.onDelete),
						`Unsupported Drizzle PostgreSQL foreign-key action: ${name}`,
					),
					targetColumn: targetColumn.name,
					targetTable: getTableName(reference.foreignTable),
				})
			}),
		),
		indexes: immutableArray(
			config.indexes.map((index) => {
				const name = readDrizzleIndexName(index)
				const predicate = readPostgresIndexPredicate(name)
				return immutableRecord({
					columns: readDrizzleIndexColumns(index),
					method: readDrizzleIndexMethod(index),
					name,
					...(predicate === undefined ? {} : { predicate }),
					unique: index.config.unique,
				})
			}),
		),
		name: config.name,
	})
}

/** Normalizes Drizzle table metadata while overlaying field names and rename intent. */
/** Reads the neutral `existingRows` metadata of one top-level plugin field. */
const readExistingRows = (
	definition: unknown,
	{ plan }: CompiledPostgresField,
): PluginFieldExistingRows | undefined =>
	// Private storage collections are not schemas and declare nothing.
	!Schema.is(definition) || plan.kind !== 'scalar'
		? undefined
		: readPluginFieldExistingRows(plan.field, definition)

export const compileDesiredPostgresTables = (
	schemas: readonly Readonly<{
		readonly definition?: unknown
		readonly fields: Readonly<Record<string, CompiledPostgresField>>
		readonly table: PgTable
	}>[],
	relations: readonly CompiledPostgresJoinRelation[] = [],
): readonly DesiredPostgresTable[] =>
	immutableArray([
		...schemas.map((schema) =>
			compileDesiredTable(
				schema.table,
				new Map(
					Object.entries(schema.fields).map(
						([field, compiled]): [string, DesiredColumnFacts] => {
							const existingRows = readExistingRows(
								schema.definition,
								compiled,
							)
							return [
								compiled.column.name,
								{
									field,
									...(compiled.renamedFrom === undefined
										? {}
										: { renamedFrom: compiled.renamedFrom }),
									...(existingRows === undefined ? {} : { existingRows }),
								},
							]
						},
					),
				),
			),
		),
		...relations.map((relation) =>
			compileDesiredTable(relation.table, new Map()),
		),
	])
