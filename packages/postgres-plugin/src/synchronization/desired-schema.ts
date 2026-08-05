import { Buffer } from 'node:buffer'

import type { PointerReferentialAction } from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { getTableName } from 'drizzle-orm'
import type { PgColumn, PgTable, UpdateDeleteAction } from 'drizzle-orm/pg-core'
import { getTableConfig } from 'drizzle-orm/pg-core'

import type {
	CompiledPostgresJoinRelation,
	CompiledPostgresSchema,
} from '../schema/contracts.js'
import {
	readDrizzleIndexColumns,
	readDrizzleIndexMethod,
	readDrizzleIndexName,
} from '../schema/drizzle-table-metadata.js'
import type {
	DesiredPostgresColumn,
	DesiredPostgresForeignKey,
	DesiredPostgresIndex,
	DesiredPostgresTable,
} from './contracts.js'

type DrizzlePostgresTableConfig = ReturnType<typeof getTableConfig>

const quoteLiteral = (value: string): string =>
	`'${value.replaceAll("'", "''")}'`

const normalizeType = (type: string): string =>
	type.replace(/\s+\(/gu, '(').replaceAll(/\s+/gu, ' ').trim()

const renderDefaultExpression = (
	column: PgColumn,
	type: string,
): string | undefined => {
	const declaredDefault: unknown = column.default

	if (declaredDefault === undefined) return undefined

	// Drizzle columns own logical-to-storage mapping for static defaults too.
	const value: unknown =
		declaredDefault === null ? null : column.mapToDriverValue(declaredDefault)

	if (value === null) {
		return type === 'jsonb' ? "'null'::jsonb" : 'NULL'
	}

	if (typeof value === 'boolean' || typeof value === 'number') {
		return String(value)
	}

	if (typeof value === 'bigint') {
		return value.toString()
	}

	if (value instanceof Uint8Array) {
		return `decode(${quoteLiteral(Buffer.from(value).toString('hex'))}, 'hex')`
	}

	if (type === 'jsonb') {
		const serialized: unknown = JSON.stringify(value)

		if (typeof serialized !== 'string') {
			throw new TypeError(
				`Unsupported Drizzle PostgreSQL default: ${column.name}`,
			)
		}

		return `${quoteLiteral(serialized)}::jsonb`
	}

	if (typeof value !== 'string') {
		throw new TypeError(
			`Unsupported Drizzle PostgreSQL default: ${column.name}`,
		)
	}

	return `${quoteLiteral(value)}::${type}`
}

const compileDesiredColumns = (
	config: DrizzlePostgresTableConfig,
	renamedFromByColumn: ReadonlyMap<string, string>,
): readonly DesiredPostgresColumn[] => {
	const tablePrimaryColumns = new Set(
		config.primaryKeys.flatMap((primaryKey) =>
			primaryKey.columns.map((column) => column.name),
		),
	)

	return immutableArray(
		config.columns.map((column) => {
			const type = normalizeType(column.getSQLType())
			const defaultExpression = renderDefaultExpression(column, type)
			const identity = column.generatedIdentity?.type
			const renamedFrom = renamedFromByColumn.get(column.name)

			return immutableRecord({
				...(defaultExpression === undefined ? {} : { defaultExpression }),
				...(identity === undefined ? {} : { identity }),
				name: column.name,
				nullable: !column.notNull,
				primary: column.primary || tablePrimaryColumns.has(column.name),
				...(renamedFrom === undefined ? {} : { renamedFrom }),
				type,
			})
		}),
	)
}

const compileDesiredIndexes = (
	config: DrizzlePostgresTableConfig,
): readonly DesiredPostgresIndex[] =>
	immutableArray(
		config.indexes.map((index) =>
			immutableRecord({
				columns: readDrizzleIndexColumns(index),
				method: readDrizzleIndexMethod(index),
				name: readDrizzleIndexName(index),
				unique: index.config.unique,
			}),
		),
	)

const readForeignKeyAction = (
	action: UpdateDeleteAction | undefined,
	name: string,
): PointerReferentialAction => {
	if (action === 'cascade' || action === 'restrict') return action
	if (action === 'set null') return 'setNull'

	throw new TypeError(
		`Unsupported Drizzle PostgreSQL foreign-key action: ${name}`,
	)
}

const compileDesiredForeignKeys = (
	config: DrizzlePostgresTableConfig,
): readonly DesiredPostgresForeignKey[] =>
	immutableArray(
		config.foreignKeys.map((foreignKey) => {
			const reference = foreignKey.reference()
			const sourceColumn = reference.columns[0]
			const targetColumn = reference.foreignColumns[0]
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
				onDelete: readForeignKeyAction(foreignKey.onDelete, name),
				targetColumn: targetColumn.name,
				targetTable: getTableName(reference.foreignTable),
			})
		}),
	)

const compileDesiredTable = (
	table: PgTable,
	renamedFromByColumn: ReadonlyMap<string, string>,
): DesiredPostgresTable => {
	const config = getTableConfig(table)

	return immutableRecord({
		columns: compileDesiredColumns(config, renamedFromByColumn),
		foreignKeys: compileDesiredForeignKeys(config),
		indexes: compileDesiredIndexes(config),
		name: config.name,
	})
}

const readRenamedColumns = (
	schema: CompiledPostgresSchema,
): ReadonlyMap<string, string> =>
	new Map(
		Object.values(schema.fields).flatMap((field) =>
			field.renamedFrom === undefined
				? []
				: [[field.column.name, field.renamedFrom] as const],
		),
	)

/** Normalizes Drizzle table metadata while overlaying UltimaBase rename intent. */
export const compileDesiredPostgresTables = (
	schemas: readonly CompiledPostgresSchema[],
	relations: readonly CompiledPostgresJoinRelation[] = [],
): readonly DesiredPostgresTable[] =>
	immutableArray([
		...schemas.map((schema) =>
			compileDesiredTable(schema.table, readRenamedColumns(schema)),
		),
		...relations.map((relation) =>
			compileDesiredTable(relation.table, new Map()),
		),
	])
