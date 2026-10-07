import { immutableArray } from '@ultimabase/shared'

import type { ReservedSystemFieldName } from './system-fields.js'

/** Lists Query logical operators that cannot also be schema field names. */
export const reservedQueryLogicalFieldNames: readonly ['AND', 'OR', 'NOT'] =
	immutableArray(['AND', 'OR', 'NOT'])

export type ReservedQueryLogicalFieldName =
	(typeof reservedQueryLogicalFieldNames)[number]

/** Lists instance capabilities that cannot be shadowed by visible model values. */
export const reservedSchemaModelFieldNames: readonly [
	'create',
	'delete',
	'get',
	'relation',
	'then',
	'toJSON',
	'update',
	'upsert',
] = immutableArray([
	'create',
	'delete',
	'get',
	'relation',
	'then',
	'toJSON',
	'update',
	'upsert',
])

export type ReservedSchemaModelFieldName =
	(typeof reservedSchemaModelFieldNames)[number]

/** Identifies every field name reserved by a current Schema or Query contract. */
export type ReservedSchemaFieldName =
	| ReservedSystemFieldName
	| ReservedQueryLogicalFieldName
	| ReservedSchemaModelFieldName

/** Rejects exact field maps while preserving runtime checks for dynamic maps. */
export type ReservedSchemaFieldCollision<TFields extends object> =
	string extends keyof TFields
		? unknown
		: Extract<keyof TFields, ReservedSchemaFieldName> extends never
			? unknown
			: never

/** Tests one runtime name against the canonical Query logical declaration. */
export const isReservedQueryLogicalFieldName = (
	name: string,
): name is ReservedQueryLogicalFieldName =>
	reservedQueryLogicalFieldNames.some((reservedName) => reservedName === name)

/** Tests one runtime name against the canonical schema-model declaration. */
export const isReservedSchemaModelFieldName = (
	name: string,
): name is ReservedSchemaModelFieldName =>
	reservedSchemaModelFieldNames.some((reservedName) => reservedName === name)
