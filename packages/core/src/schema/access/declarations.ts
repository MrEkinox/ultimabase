import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { SchemaDefinition } from '../schema/definition.js'
import type { SchemaAccess } from './contracts.js'
import {
	normalizeAccessRuleMap,
	type NormalizedAccessRuleMap,
} from './normalization.js'

/** Lists schema levels once so validation and diagnostics cannot drift. */
export const schemaAccessLevels = ['operation', 'filter', 'item'] as const

/** Identifies every schema Access level accepted at the declaration boundary. */
export type SchemaAccessLevel = (typeof schemaAccessLevels)[number]

export const schemaOperationAccessFamilies = [
	'read',
	'create',
	'update',
	'upsert',
	'delete',
] as const
export const schemaFilterAccessFamilies = [
	'read',
	'update',
	'upsert',
	'delete',
] as const
export const schemaItemAccessFamilies = [
	'create',
	'update',
	'upsert',
	'delete',
] as const

export type SchemaOperationAccessFamily =
	(typeof schemaOperationAccessFamilies)[number]
export type SchemaFilterAccessFamily =
	(typeof schemaFilterAccessFamilies)[number]
export type SchemaItemAccessFamily = (typeof schemaItemAccessFamilies)[number]

/** Stores only declared schema rules for later application-level compilation. */
export interface SchemaAccessDeclarations {
	readonly operation?: NormalizedAccessRuleMap<SchemaOperationAccessFamily>
	readonly filter?: NormalizedAccessRuleMap<SchemaFilterAccessFamily>
	readonly item?: NormalizedAccessRuleMap<SchemaItemAccessFamily>
}

const schemaAccessDeclarations = new WeakMap<object, SchemaAccessDeclarations>()

/** Copies and validates one native schema declaration without executing rules. */
export const normalizeSchemaAccessDeclarations = (
	access: unknown,
): SchemaAccessDeclarations | undefined => {
	if (access === undefined) {
		return undefined
	}

	if (!isPlainRecord(access)) {
		throw new TypeError('access must be a plain object')
	}

	const allowedLevels = new Set<string>(schemaAccessLevels)

	for (const key of Reflect.ownKeys(access)) {
		if (typeof key !== 'string') {
			throw new TypeError('access contains an unsupported symbol key')
		}

		if (!allowedLevels.has(key)) {
			throw new TypeError(`Unknown schema Access level: access.${key}`)
		}
	}

	const operation = Object.hasOwn(access, 'operation')
		? normalizeAccessRuleMap(
				access.operation,
				schemaOperationAccessFamilies,
				'access.operation',
			)
		: undefined
	const filter = Object.hasOwn(access, 'filter')
		? normalizeAccessRuleMap(
				access.filter,
				schemaFilterAccessFamilies,
				'access.filter',
			)
		: undefined
	const item = Object.hasOwn(access, 'item')
		? normalizeAccessRuleMap(
				access.item,
				schemaItemAccessFamilies,
				'access.item',
			)
		: undefined

	if (operation === undefined && filter === undefined && item === undefined) {
		return undefined
	}

	return immutableRecord({
		...(operation === undefined ? {} : { operation }),
		...(filter === undefined ? {} : { filter }),
		...(item === undefined ? {} : { item }),
	})
}

/** Attaches one normalized declaration to the exact Schema identity. */
export const declareSchemaAccess = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	access: SchemaAccess<TSchema> | undefined,
): void => {
	const declarations = normalizeSchemaAccessDeclarations(access)

	if (declarations !== undefined) {
		schemaAccessDeclarations.set(schema, declarations)
	}
}

/** Resolves private declarations for the Access compiler only. */
export const getSchemaAccessDeclarations = (
	schema: SchemaDefinition,
): SchemaAccessDeclarations | undefined => schemaAccessDeclarations.get(schema)
