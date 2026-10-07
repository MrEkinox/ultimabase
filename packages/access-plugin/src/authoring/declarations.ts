import {
	immutableArray,
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

/** Retains a complete immutable grouped declaration. */
export type NormalizedRequiredAccessRuleMap<TKey extends string> = Readonly<
	Record<TKey, NormalizedAccessRule>
>

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

/** Names the private channels for field-level read and write rules. */
export const fieldReadAccessChannels = ['item', 'filter', 'order'] as const
export const fieldWriteAccessTransitions = ['fill', 'replace', 'clear'] as const
export type FieldReadAccessChannel = (typeof fieldReadAccessChannels)[number]
export type FieldWriteAccessTransition =
	(typeof fieldWriteAccessTransitions)[number]

/** Retains operation rules in the private stage-oriented compiler format. */
export interface SchemaOperationAccessDeclarations {
	readonly read?:
		NormalizedAccessRule | NormalizedAccessRuleMap<SchemaReadAccessBranch>
	readonly create?: NormalizedAccessRule
	readonly update?: NormalizedAccessRule
	readonly upsert?: NormalizedAccessRule
	readonly delete?: NormalizedAccessRule
}

/** Retains one application-specific mutation in the same monotonic stages. */
export interface SchemaMutationAccessDeclarations {
	readonly filter?: NormalizedAccessRule
	readonly item?: NormalizedAccessRule
	readonly operation?: NormalizedAccessRule
}

/** Retains normalized rules in the private monotonic lifecycle. */
export interface SchemaAccessDeclarations {
	readonly operation?: SchemaOperationAccessDeclarations
	readonly filter?: NormalizedAccessRuleMap<SchemaFilterAccessFamily>
	readonly item?: NormalizedAccessRuleMap<SchemaItemAccessFamily>
	readonly mutations?: Readonly<
		Record<string, SchemaMutationAccessDeclarations>
	>
}

/** Retains only validated field rules inside private field capabilities. */
export interface FieldAccessDeclarations {
	readonly read?:
		| NormalizedAccessRule
		| NormalizedRequiredAccessRuleMap<FieldReadAccessChannel>
	readonly write?: NormalizedRequiredAccessRuleMap<FieldWriteAccessTransition>
	readonly relationWrite?: NormalizedAccessRule
}

const isRuleCallback = (value: unknown): value is ErasedAccessRule =>
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
const forEachKnownKey = (
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
const normalizeAccessRuleMap = (
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

const hasEveryRule = <TKey extends string>(
	rules: Readonly<Record<string, NormalizedAccessRule>>,
	keys: readonly TKey[],
): rules is NormalizedRequiredAccessRuleMap<TKey> =>
	keys.every((key) => Object.hasOwn(rules, key))

/** Copies one grouped rule map and rejects the first omitted branch. */
const normalizeRequiredAccessRuleMap = <TKey extends string>(
	value: unknown,
	keys: readonly TKey[],
	path: string,
): NormalizedRequiredAccessRuleMap<TKey> => {
	const rules = normalizeAccessRuleMap(value, keys, path)
	if (!hasEveryRule(rules, keys)) {
		const missing = keys.find((key) => !Object.hasOwn(rules, key))
		throw new TypeError(`${path}.${String(missing)} is required`)
	}
	return rules
}

/** Copies plain where structures so later caller mutation cannot change policy. */
const snapshotWhereValue = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return immutableArray(value.map(snapshotWhereValue))
	}
	if (!isPlainRecord(value)) return value

	// Entries keep every own key, including `__proto__`, as ordinary data.
	return immutableRecord(
		Object.fromEntries(
			Reflect.ownKeys(value).map((key) => {
				if (typeof key !== 'string') {
					throw new TypeError('Access where contains an unsupported symbol key')
				}
				return [key, snapshotWhereValue(value[key])]
			}),
		),
	)
}

/** Retains dynamic rules and lowers static where objects to one immutable value rule. */
const normalizeWhereRule = (value: unknown, path: string): ErasedAccessRule => {
	if (isRuleCallback(value)) return value
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object or function`)
	}
	const snapshot = snapshotWhereValue(value)

	// The private plan stores executable rules; this setup-time wrapper keeps
	// that single representation without exposing a callback publicly.
	return () => snapshot
}

interface NormalizedStages<TAllow> {
	readonly allow?: TAllow
	readonly where?: ErasedAccessRule
	readonly item?: NormalizedAccessRule
}

const allStages = new Set(['allow', 'where', 'item'])
const stageKeys: Readonly<Record<SchemaAccessFamily, ReadonlySet<string>>> =
	immutableRecord({
		create: new Set(['allow', 'item']),
		delete: allStages,
		read: new Set(['allow', 'where']),
		update: allStages,
		upsert: allStages,
	})

/**
 * Lowers one concise rule or one staged `{ allow, where, item }` object. Every
 * key is validated before any value, then values are read in stage order.
 */
const normalizeStages = <TAllow>(
	value: unknown,
	path: string,
	keys: ReadonlySet<string>,
	normalizeAllow: (allow: unknown) => TAllow,
): NormalizedStages<TAllow | NormalizedAccessRule> => {
	if (isAccessRule(value)) return { allow: value }
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a boolean, function, or object`)
	}
	forEachKnownKey(value, path, keys)

	return {
		...(Object.hasOwn(value, 'allow')
			? { allow: normalizeAllow(value.allow) }
			: {}),
		...(Object.hasOwn(value, 'where')
			? { where: normalizeWhereRule(value.where, `${path}.where`) }
			: {}),
		...(Object.hasOwn(value, 'item')
			? { item: normalizeAccessRule(value.item, `${path}.item`) }
			: {}),
	}
}

const isSchemaAccessFamily = (key: string): key is SchemaAccessFamily =>
	Object.hasOwn(stageKeys, key)
const schemaMutationCommandNamePattern = /^[_A-Za-z][_0-9A-Za-z]*$/u

/** Copies and validates one native declaration without executing policy code. */
export const normalizeSchemaAccessDeclarations = (
	access: unknown,
): SchemaAccessDeclarations | undefined => {
	if (access === undefined) return undefined
	if (!isPlainRecord(access)) {
		throw new TypeError('access must be a plain object')
	}

	const operation: {
		-readonly [
			TKey in SchemaAccessFamily
		]?: SchemaOperationAccessDeclarations[TKey]
	} = {}
	const filter: [string, ErasedAccessRule][] = []
	const item: [string, NormalizedAccessRule][] = []
	const mutations: [string, SchemaMutationAccessDeclarations][] = []

	for (const key of Reflect.ownKeys(access)) {
		if (typeof key !== 'string') {
			throw new TypeError('access contains an unsupported symbol key')
		}
		const path = `access.${key}`
		const rule = (allow: unknown) => normalizeAccessRule(allow, `${path}.allow`)

		if (!isSchemaAccessFamily(key)) {
			if (!schemaMutationCommandNamePattern.test(key)) {
				throw new TypeError(`Unknown schema Access family: ${path}`)
			}
			const stages = normalizeStages(access[key], path, allStages, rule)
			mutations.push([
				key,
				immutableRecord({
					...(stages.allow === undefined ? {} : { operation: stages.allow }),
					...(stages.where === undefined ? {} : { filter: stages.where }),
					...(stages.item === undefined ? {} : { item: stages.item }),
				}),
			])
			continue
		}

		let stages: NormalizedStages<unknown>
		if (key === 'read') {
			const read = normalizeStages(
				access[key],
				path,
				stageKeys.read,
				(allow) =>
					isAccessRule(allow)
						? allow
						: normalizeAccessRuleMap(
								allow,
								schemaReadAccessBranches,
								`${path}.allow`,
							),
			)
			if (read.allow !== undefined) operation.read = read.allow
			stages = read
		} else {
			const family = normalizeStages(access[key], path, stageKeys[key], rule)
			if (family.allow !== undefined) operation[key] = family.allow
			stages = family
		}
		if (stages.where !== undefined) filter.push([key, stages.where])
		if (stages.item !== undefined) item.push([key, stages.item])
	}

	const declarations: SchemaAccessDeclarations = {
		...(Object.keys(operation).length === 0
			? {}
			: { operation: immutableRecord(operation) }),
		...(filter.length === 0
			? {}
			: { filter: immutableRecord(Object.fromEntries(filter)) }),
		...(item.length === 0
			? {}
			: { item: immutableRecord(Object.fromEntries(item)) }),
		...(mutations.length === 0
			? {}
			: { mutations: immutableRecord(Object.fromEntries(mutations)) }),
	}
	return Object.keys(declarations).length === 0
		? undefined
		: immutableRecord(declarations)
}

const publicFieldReadAccessChannels = ['output', 'where', 'orderBy'] as const
const fieldAccessCapabilities = new Set(['read', 'write'])

/** Copies and validates one inline declaration without executing policy code. */
export const normalizeFieldAccessDeclarations = (
	access: unknown,
): FieldAccessDeclarations | undefined => {
	if (access === undefined) return undefined
	if (!isPlainRecord(access)) {
		throw new TypeError('access must be a plain object')
	}

	const declarations: {
		-readonly [
			TKey in keyof FieldAccessDeclarations
		]?: FieldAccessDeclarations[TKey]
	} = {}
	forEachKnownKey(access, 'access', fieldAccessCapabilities, (key) => {
		const value = access[key]
		if (key === 'read') {
			if (isAccessRule(value)) {
				declarations.read = value
				return
			}
			const read = normalizeRequiredAccessRuleMap(
				value,
				publicFieldReadAccessChannels,
				'access.read',
			)
			declarations.read = immutableRecord({
				filter: read.where,
				item: read.output,
				order: read.orderBy,
			})
		} else if (isRuleCallback(value)) {
			// A write callback is only meaningful as a relation edge decision.
			declarations.relationWrite = value
		} else if (typeof value === 'boolean') {
			declarations.write = immutableRecord({
				clear: value,
				fill: value,
				replace: value,
			})
			declarations.relationWrite = value
		} else {
			declarations.write = normalizeRequiredAccessRuleMap(
				value,
				fieldWriteAccessTransitions,
				'access.write',
			)
		}
	})

	return Object.keys(declarations).length === 0
		? undefined
		: immutableRecord(declarations)
}
