import { Buffer } from 'node:buffer'

import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	CompiledPostgresJoinRelation,
	CompiledPostgresSchema,
} from '../schema/contracts.js'
import type {
	DesiredPostgresColumn,
	DesiredPostgresForeignKey,
	DesiredPostgresIndex,
	DesiredPostgresTable,
} from './contracts.js'

const quoteLiteral = (value: string): string =>
	`'${value.replaceAll("'", "''")}'`

const normalizeType = (type: string): string =>
	type.replace(/\s+\(/gu, '(').replaceAll(/\s+/gu, ' ').trim()

type StaticDefault =
	| { readonly present: false }
	| { readonly present: true; readonly value: unknown }

const readStaticDefault = (
	schema: CompiledPostgresSchema,
	fieldName: string,
): StaticDefault => {
	const field = schema.fields[fieldName]

	if (field === undefined) {
		throw new TypeError(`Missing compiled PostgreSQL field: ${fieldName}`)
	}

	const options: unknown = field.plan.field.options

	if (
		!isPlainRecord(options) ||
		!Object.hasOwn(options, 'default') ||
		typeof options.default === 'function'
	) {
		return { present: false }
	}

	return { present: true, value: options.default }
}

const renderDefaultExpression = (
	schema: CompiledPostgresSchema,
	fieldName: string,
	type: string,
): string | undefined => {
	const field = schema.fields[fieldName]
	const declaredDefault = readStaticDefault(schema, fieldName)

	if (field === undefined || !declaredDefault.present) return undefined

	const encoded = field.codec.encode(declaredDefault.value)

	if (typeof encoded === 'boolean' || typeof encoded === 'number') {
		return String(encoded)
	}

	if (typeof encoded === 'bigint') {
		return encoded.toString()
	}

	if (encoded instanceof Uint8Array) {
		return `decode(${quoteLiteral(Buffer.from(encoded).toString('hex'))}, 'hex')`
	}

	if (field.storage === 'jsonb') {
		return `${quoteLiteral(JSON.stringify(encoded))}::jsonb`
	}

	if (typeof encoded !== 'string') {
		throw new TypeError(`Unsupported PostgreSQL default: ${fieldName}`)
	}

	return `${quoteLiteral(encoded)}::${type}`
}

const compileDesiredColumns = (
	schema: CompiledPostgresSchema,
): readonly DesiredPostgresColumn[] =>
	immutableArray(
		Object.entries(schema.fields).map(([fieldName, field]) => {
			const type = normalizeType(field.column.getSQLType())
			const defaultExpression = renderDefaultExpression(schema, fieldName, type)
			const identity = field.column.generatedIdentity?.type
			const renamedFrom = field.renamedFrom

			return immutableRecord({
				...(defaultExpression === undefined ? {} : { defaultExpression }),
				...(identity === undefined ? {} : { identity }),
				name: fieldName,
				nullable: !field.column.notNull,
				primary: field.column.primary,
				...(renamedFrom === undefined ? {} : { renamedFrom }),
				type,
			})
		}),
	)

const compileDesiredIndexes = (
	schema: CompiledPostgresSchema,
): readonly DesiredPostgresIndex[] =>
	immutableArray(
		schema.indexes.map((index) =>
			immutableRecord({
				columns: index.fields,
				name: index.name,
				unique: index.unique,
			}),
		),
	)

const compileDesiredForeignKeys = (
	schema: CompiledPostgresSchema,
): readonly DesiredPostgresForeignKey[] =>
	immutableArray(
		Object.entries(schema.fields).flatMap(([fieldName, field]) =>
			field.pointer === undefined
				? []
				: [
						immutableRecord({
							column: fieldName,
							name: field.pointer.constraintName,
							onDelete: field.pointer.onDelete,
							targetColumn: field.pointer.targetColumn,
							targetTable: field.pointer.targetTable,
						}),
					],
		),
	)

/** Compiles private Drizzle tables into a small comparable synchronization model. */
export const compileDesiredPostgresTables = (
	schemas: readonly CompiledPostgresSchema[],
	relations: readonly CompiledPostgresJoinRelation[] = [],
): readonly DesiredPostgresTable[] =>
	immutableArray([
		...schemas.map((schema) =>
			immutableRecord({
				columns: compileDesiredColumns(schema),
				foreignKeys: compileDesiredForeignKeys(schema),
				indexes: compileDesiredIndexes(schema),
				name: schema.tableName,
			}),
		),
		...relations.map((relation) =>
			immutableRecord({
				columns: immutableArray([
					immutableRecord({
						name: relation.sourceColumn.name,
						nullable: false,
						primary: false,
						type: 'uuid',
					}),
					immutableRecord({
						name: relation.targetColumn.name,
						nullable: false,
						primary: false,
						type: 'uuid',
					}),
				]),
				foreignKeys: immutableArray(
					relation.foreignKeys.map((foreignKey) =>
						immutableRecord({
							column: foreignKey.column,
							name: foreignKey.constraintName,
							onDelete: 'cascade' as const,
							targetColumn: 'id',
							targetTable: foreignKey.targetTable,
						}),
					),
				),
				indexes: immutableArray(
					relation.indexes.map((index) =>
						immutableRecord({
							columns: index.fields,
							name: index.name,
							unique: index.unique,
						}),
					),
				),
				name: relation.tableName,
			}),
		),
	])
