import { nativeCommandCatalog } from '@ultimabase/core/plugin'
import {
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

/** Erases rule variance only after the public declaration has been type-checked. */
export type ErasedAccessRule = (input: never) => MaybePromise<unknown>

/** Retains one direct boolean or callback without executing policy code. */
export type NormalizedAccessRule = boolean | ErasedAccessRule

/** Retains a sparse immutable rule map for later Access-plan compilation. */
export type NormalizedAccessRuleMap<TKey extends string> = Readonly<
	Partial<Record<TKey, NormalizedAccessRule>>
>

export const schemaItemAccessFamilies = [
	'create',
	'update',
	'upsert',
	'delete',
] as const

export type SchemaItemAccessFamily = (typeof schemaItemAccessFamilies)[number]

/**
 * One normalized operation rule. `path` names it in diagnostics
 * (`findMany`, `update.where`); `step` is `filter` for the `where` member of
 * a detailed `{ where, item }` rule and `operation` otherwise.
 */
export interface NormalizedOperationRule {
	readonly path: string
	readonly rule: NormalizedAccessRule
	readonly step: 'filter' | 'operation'
}

/**
 * The rules of one key: `all`, a group, an operation (native or plugin), a
 * read method or a plugin permission. The compiler places each key in Core's
 * operation vocabulary against the compiled application (ADR-0347).
 */
export interface SchemaAccessDeclaration {
	readonly item?: NormalizedAccessRule
	readonly operation: NormalizedOperationRule
}

/** Retains normalized rules by key, in the private compiler format. */
export type SchemaAccessDeclarations = Readonly<
	Record<string, SchemaAccessDeclaration>
>

export const isRuleCallback = (value: unknown): value is ErasedAccessRule =>
	typeof value === 'function'

export const isAccessRule = (value: unknown): value is NormalizedAccessRule =>
	typeof value === 'boolean' || isRuleCallback(value)

/** Validates one direct decision without invoking developer code. */
const normalizeAccessRule = (
	value: unknown,
	path: string,
): NormalizedAccessRule => {
	if (!isAccessRule(value)) {
		throw new TypeError(`${path} must be a boolean or function`)
	}
	return value
}

/** Visits own keys in order, rejecting symbols and vocabulary outside `allowed`. */
export const forEachKnownKey = (
	value: Readonly<Record<string, unknown>>,
	path: string,
	allowed: ReadonlySet<string>,
	visit?: (key: string) => void,
): void => {
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string') {
			throw new TypeError(`${path} contains an unsupported symbol key`)
		}
		if (!allowed.has(key)) {
			throw new TypeError(`Unknown Access rule: ${path}.${key}`)
		}
		visit?.(key)
	}
}

/** Copies one sparse rule map; each key is validated just before its value. */
export const normalizeAccessRuleMap = (
	value: unknown,
	keys: readonly string[],
	path: string,
): Readonly<Record<string, NormalizedAccessRule>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	const rules: [string, NormalizedAccessRule][] = []
	forEachKnownKey(value, path, new Set(keys), (key) => {
		rules.push([key, normalizeAccessRule(value[key], `${path}.${key}`)])
	})
	return immutableRecord(Object.fromEntries(rules))
}

const detailedKeys: ReadonlySet<string> = new Set(['item', 'where'])

/** Lowers one rule or one detailed `{ where, item }` object. */
const normalizeRule = (
	value: unknown,
	path: string,
	key: string,
): Readonly<{
	item?: NormalizedAccessRule
	operation: NormalizedOperationRule
}> => {
	if (isAccessRule(value)) {
		return immutableRecord({
			operation: immutableRecord({
				path: key,
				rule: value,
				step: 'operation' as const,
			}),
		})
	}
	if (!isPlainRecord(value)) {
		throw new TypeError(
			`${path} must be a boolean, function, or { where, item }`,
		)
	}
	forEachKnownKey(value, path, detailedKeys)
	for (const member of detailedKeys) {
		if (!Object.hasOwn(value, member)) {
			throw new TypeError(`${path}.${member} is required`)
		}
	}
	return immutableRecord({
		item: normalizeAccessRule(value.item, `${path}.item`),
		operation: immutableRecord({
			path: `${key}.where`,
			rule: normalizeAccessRule(value.where, `${path}.where`),
			step: 'filter' as const,
		}),
	})
}

const isItemFamily = (key: string): key is SchemaItemAccessFamily =>
	key === 'create' || key === 'update' || key === 'upsert' || key === 'delete'

/** Keys that take the short form only: `all`, groups and read keys. */
const shortFormKeys: ReadonlySet<string> = new Set([
	'all',
	'read',
	'write',
	'find',
	'findOne',
	'findMany',
	'count',
	'exists',
])

/** The operation of each native write method, which Access never takes. */
const nativeWriteMethods: ReadonlyMap<string, string> = new Map(
	nativeCommandCatalog
		.filter(({ group }) => group === 'write')
		.map(({ method, operation }) => [method, operation]),
)

/**
 * Throws for a native write method key: a write rule never depends on
 * cardinality (ADR-0347), so `createMany` cannot bypass `create`.
 */
export const assertNoNativeWriteMethod = (key: string, path: string): void => {
	const operation = nativeWriteMethods.get(key)
	if (operation !== undefined) {
		throw new TypeError(
			`${path} names a write method: use its operation ${operation}`,
		)
	}
}

const extensionKeyPattern = /^[_A-Za-z][_0-9A-Za-z]*$/u

/** Copies and validates one schema declaration without executing policy code. */
export const normalizeSchemaAccessDeclarations = (
	access: unknown,
): SchemaAccessDeclarations | undefined => {
	if (access === undefined) return undefined
	if (!isPlainRecord(access)) {
		throw new TypeError('access must be a plain object')
	}

	const declarations: [string, SchemaAccessDeclaration][] = []
	for (const key of Reflect.ownKeys(access)) {
		if (typeof key !== 'string') {
			throw new TypeError('access contains an unsupported symbol key')
		}
		const path = `access.${key}`
		const value = access[key]
		assertNoNativeWriteMethod(key, path)
		if (shortFormKeys.has(key)) {
			declarations.push([
				key,
				immutableRecord({
					operation: immutableRecord({
						path: key,
						rule: normalizeAccessRule(value, path),
						step: 'operation' as const,
					}),
				}),
			])
			continue
		}
		if (!isItemFamily(key) && !extensionKeyPattern.test(key)) {
			throw new TypeError(`Unknown schema Access rule: ${path}`)
		}
		declarations.push([key, normalizeRule(value, path, key)])
	}
	// Keys are user-controlled: copied as entries, never assigned.
	return declarations.length === 0
		? undefined
		: immutableRecord(Object.fromEntries(declarations))
}
