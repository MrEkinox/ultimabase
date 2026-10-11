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

/** Lists public read operations once so validation stays exhaustive. */
export const schemaReadAccessBranches = [
	'one',
	'many',
	'count',
	'exists',
] as const
export const schemaItemAccessFamilies = [
	'create',
	'update',
	'upsert',
	'delete',
] as const

export type SchemaReadAccessBranch = (typeof schemaReadAccessBranches)[number]
export type SchemaItemAccessFamily = (typeof schemaItemAccessFamilies)[number]

/** Names the public slot of each native operation rule. */
export const schemaOperationAccessSlots = [
	'one',
	'many',
	'count',
	'exists',
	'create',
	'update',
	'upsert',
	'delete',
] as const
export type SchemaOperationAccessSlot =
	(typeof schemaOperationAccessSlots)[number]

/**
 * One normalized operation rule. `path` names it in diagnostics
 * (`read.many`, `update.where`); `step` is `filter` for the `where` member of
 * a detailed `{ where, item }` rule and `operation` otherwise.
 */
export interface NormalizedOperationRule {
	readonly path: string
	readonly rule: NormalizedAccessRule
	readonly step: 'filter' | 'operation'
}

/**
 * One rule under a key that is not a native operation: a request plugin
 * command (`softDeleteOne`) or a plugin permission (`readDeleted`). The
 * compiler classifies it against the compiled application.
 */
export interface ExtensionAccessDeclarations {
	readonly item?: NormalizedAccessRule
	readonly operation: NormalizedOperationRule
}

/** Retains normalized rules in the private compiler format. */
export interface SchemaAccessDeclarations {
	readonly operation?: Readonly<
		Partial<Record<SchemaOperationAccessSlot, NormalizedOperationRule>>
	>
	readonly item?: NormalizedAccessRuleMap<SchemaItemAccessFamily>
	readonly extensions?: Readonly<Record<string, ExtensionAccessDeclarations>>
}

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
const extensionKeyPattern = /^[_A-Za-z][_0-9A-Za-z]*$/u

/** Copies and validates one schema declaration without executing policy code. */
export const normalizeSchemaAccessDeclarations = (
	access: unknown,
): SchemaAccessDeclarations | undefined => {
	if (access === undefined) return undefined
	if (!isPlainRecord(access)) {
		throw new TypeError('access must be a plain object')
	}

	const operation: [string, NormalizedOperationRule][] = []
	const item: [string, NormalizedAccessRule][] = []
	const extensions: [string, ExtensionAccessDeclarations][] = []

	for (const key of Reflect.ownKeys(access)) {
		if (typeof key !== 'string') {
			throw new TypeError('access contains an unsupported symbol key')
		}
		const path = `access.${key}`
		const value = access[key]
		if (key === 'read') {
			if (isAccessRule(value)) {
				for (const branch of schemaReadAccessBranches) {
					operation.push([
						branch,
						immutableRecord({
							path: 'read',
							rule: value,
							step: 'operation' as const,
						}),
					])
				}
				continue
			}
			const branches = normalizeAccessRuleMap(
				value,
				schemaReadAccessBranches,
				path,
			)
			for (const [branch, rule] of Object.entries(branches)) {
				operation.push([
					branch,
					immutableRecord({
						path: `read.${branch}`,
						rule,
						step: 'operation' as const,
					}),
				])
			}
			continue
		}
		if (isItemFamily(key)) {
			const rule = normalizeRule(value, path, key)
			operation.push([key, rule.operation])
			if (rule.item !== undefined) item.push([key, rule.item])
			continue
		}
		if (!extensionKeyPattern.test(key)) {
			throw new TypeError(`Unknown schema Access rule: ${path}`)
		}
		extensions.push([key, normalizeRule(value, path, key)])
	}

	const declarations: SchemaAccessDeclarations = {
		...(operation.length === 0
			? {}
			: { operation: immutableRecord(Object.fromEntries(operation)) }),
		...(item.length === 0
			? {}
			: { item: immutableRecord(Object.fromEntries(item)) }),
		...(extensions.length === 0
			? {}
			: { extensions: immutableRecord(Object.fromEntries(extensions)) }),
	}
	return Object.keys(declarations).length === 0
		? undefined
		: immutableRecord(declarations)
}
