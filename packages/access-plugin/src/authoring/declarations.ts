import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { SchemaDefinition } from '@ultimabase/core'
import type { SchemaAccess } from './contracts.js'
import {
	normalizeAccessRule,
	normalizeAccessRuleOrRequiredMap,
	type ErasedAccessRule,
	type NormalizedAccessRule,
	type NormalizedAccessRuleMap,
	type NormalizedRequiredAccessRuleMap,
} from './normalization.js'

/** Lists public operation families once so validation stays exhaustive. */
export const schemaAccessFamilies = [
	'read',
	'create',
	'update',
	'upsert',
	'delete',
] as const

export const schemaReadAccessBranches = [
	'one',
	'many',
	'count',
	'exists',
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

export type SchemaAccessFamily = (typeof schemaAccessFamilies)[number]
export type SchemaReadAccessBranch = (typeof schemaReadAccessBranches)[number]
export type SchemaFilterAccessFamily =
	(typeof schemaFilterAccessFamilies)[number]
export type SchemaItemAccessFamily = (typeof schemaItemAccessFamilies)[number]

/** Retains operation rules in the private stage-oriented compiler format. */
export interface SchemaOperationAccessDeclarations {
	readonly read?:
		| NormalizedAccessRule
		| NormalizedRequiredAccessRuleMap<SchemaReadAccessBranch>
	readonly create?: NormalizedAccessRule
	readonly update?: NormalizedAccessRule
	readonly upsert?: NormalizedAccessRule
	readonly delete?: NormalizedAccessRule
}

/** Retains normalized rules in the existing private monotonic lifecycle. */
export interface SchemaAccessDeclarations {
	readonly operation?: SchemaOperationAccessDeclarations
	readonly filter?: NormalizedAccessRuleMap<SchemaFilterAccessFamily>
	readonly item?: NormalizedAccessRuleMap<SchemaItemAccessFamily>
}

const schemaAccessDeclarations = new WeakMap<object, SchemaAccessDeclarations>()

type MutableSchemaOperationAccessDeclarations = {
	-readonly [
		TKey in keyof SchemaOperationAccessDeclarations
	]?: SchemaOperationAccessDeclarations[TKey]
}

type MutableAccessRuleMap<TKey extends string> = Partial<
	Record<TKey, NormalizedAccessRule>
>

interface MutableSchemaAccessDeclarations {
	readonly operation: MutableSchemaOperationAccessDeclarations
	readonly filter: MutableAccessRuleMap<SchemaFilterAccessFamily>
	readonly item: MutableAccessRuleMap<SchemaItemAccessFamily>
}

/** Copies plain where structures so later caller mutation cannot change policy. */
const snapshotWhereValue = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return immutableArray(value.map(snapshotWhereValue))
	}

	if (!isPlainRecord(value)) {
		return value
	}

	const snapshot: Record<string, unknown> = {}

	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string') {
			throw new TypeError('Access where contains an unsupported symbol key')
		}

		snapshot[key] = snapshotWhereValue(value[key])
	}

	return immutableRecord(snapshot)
}

/** Retains dynamic rules and lowers static where objects to one immutable value rule. */
const normalizeWhereRule = (value: unknown, path: string): ErasedAccessRule => {
	if (typeof value === 'function') {
		return value as ErasedAccessRule
	}

	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object or function`)
	}

	const snapshot = snapshotWhereValue(value)

	// The private plan already stores executable rules. This setup-time wrapper
	// preserves that stable representation without exposing a callback publicly.
	return () => snapshot
}

const detailedKeys = immutableRecord({
	create: immutableArray(['allow', 'item'] as const),
	delete: immutableArray(['allow', 'where', 'item'] as const),
	read: immutableArray(['allow', 'where'] as const),
	update: immutableArray(['allow', 'where', 'item'] as const),
	upsert: immutableArray(['allow', 'where', 'item'] as const),
})

/** Lowers one operation-oriented public branch into private lifecycle stages. */
const normalizeSchemaAccessFamily = (
	declarations: MutableSchemaAccessDeclarations,
	family: SchemaAccessFamily,
	value: unknown,
): void => {
	if (typeof value === 'boolean' || typeof value === 'function') {
		declarations.operation[family] = normalizeAccessRule(
			value,
			`access.${family}`,
		)
		return
	}

	if (!isPlainRecord(value)) {
		throw new TypeError(
			`access.${family} must be a boolean, function, or object`,
		)
	}

	const allowedKeys = new Set<string>(detailedKeys[family])

	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string') {
			throw new TypeError(`access.${family} contains an unsupported symbol key`)
		}

		if (!allowedKeys.has(key)) {
			throw new TypeError(`Unknown Access rule: access.${family}.${key}`)
		}
	}

	if (Object.hasOwn(value, 'allow')) {
		if (family === 'read') {
			declarations.operation.read = normalizeAccessRuleOrRequiredMap(
				value.allow,
				schemaReadAccessBranches,
				'access.read.allow',
			)
		} else {
			declarations.operation[family] = normalizeAccessRule(
				value.allow,
				`access.${family}.allow`,
			)
		}
	}

	if (Object.hasOwn(value, 'where')) {
		const whereFamily = family as SchemaFilterAccessFamily
		declarations.filter[whereFamily] = normalizeWhereRule(
			value.where,
			`access.${family}.where`,
		)
	}

	if (Object.hasOwn(value, 'item')) {
		const itemFamily = family as SchemaItemAccessFamily
		declarations.item[itemFamily] = normalizeAccessRule(
			value.item,
			`access.${family}.item`,
		)
	}
}

const freezeRuleMap = <TKey extends string>(
	rules: MutableAccessRuleMap<TKey>,
): NormalizedAccessRuleMap<TKey> | undefined =>
	Reflect.ownKeys(rules).length === 0 ? undefined : immutableRecord(rules)

/** Copies and validates one native declaration without executing policy code. */
export const normalizeSchemaAccessDeclarations = (
	access: unknown,
): SchemaAccessDeclarations | undefined => {
	if (access === undefined) {
		return undefined
	}

	if (!isPlainRecord(access)) {
		throw new TypeError('access must be a plain object')
	}

	const allowedFamilies = new Set<string>(schemaAccessFamilies)
	const declarations: MutableSchemaAccessDeclarations = {
		filter: {},
		item: {},
		operation: {},
	}

	for (const key of Reflect.ownKeys(access)) {
		if (typeof key !== 'string') {
			throw new TypeError('access contains an unsupported symbol key')
		}

		if (!allowedFamilies.has(key)) {
			throw new TypeError(`Unknown schema Access family: access.${key}`)
		}

		normalizeSchemaAccessFamily(
			declarations,
			key as SchemaAccessFamily,
			access[key],
		)
	}

	const operation =
		Reflect.ownKeys(declarations.operation).length === 0
			? undefined
			: immutableRecord(declarations.operation)
	const filter = freezeRuleMap(declarations.filter)
	const item = freezeRuleMap(declarations.item)

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
export const declareSchemaAccess = <
	TDeclarationSchema extends SchemaDefinition,
>(
	schema: SchemaDefinition,
	access: SchemaAccess<TDeclarationSchema> | undefined,
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
