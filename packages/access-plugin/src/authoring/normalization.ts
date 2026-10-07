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

/** Retains a complete immutable grouped declaration. */
export type NormalizedRequiredAccessRuleMap<TKey extends string> = Readonly<
	Record<TKey, NormalizedAccessRule>
>

const isAccessRule = (value: unknown): value is NormalizedAccessRule =>
	typeof value === 'boolean' || typeof value === 'function'

/** Validates one direct decision without invoking developer code. */
export const normalizeAccessRule = (
	value: unknown,
	path: string,
): NormalizedAccessRule => {
	if (!isAccessRule(value)) {
		throw new TypeError(`${path} must be a boolean or function`)
	}

	return value
}

/** Copies one declaration map through a caller-owned value normalizer. */
const normalizeAccessValueMap = <TKey extends string, TValue>(
	value: unknown,
	keys: readonly TKey[],
	path: string,
	normalizeValue: (value: unknown, path: string, key: TKey) => TValue,
): Readonly<Partial<Record<TKey, TValue>>> | undefined => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	const allowedKeys = new Set<string>(keys)
	const values: Partial<Record<TKey, TValue>> = {}
	let valueCount = 0

	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string') {
			throw new TypeError(`${path} contains an unsupported symbol key`)
		}

		if (!allowedKeys.has(key)) {
			throw new TypeError(`Unknown Access rule: ${path}.${key}`)
		}

		const typedKey = key as TKey
		values[typedKey] = normalizeValue(value[key], `${path}.${key}`, typedKey)
		valueCount += 1
	}

	return valueCount === 0 ? undefined : immutableRecord(values)
}

/** Copies one declaration map while rejecting unsupported policy vocabulary. */
export const normalizeAccessRuleMap = <TKey extends string>(
	value: unknown,
	keys: readonly TKey[],
	path: string,
): NormalizedAccessRuleMap<TKey> | undefined =>
	normalizeAccessValueMap(value, keys, path, normalizeAccessRule)

/** Copies one grouped rule map and rejects every omitted branch. */
export const normalizeRequiredAccessRuleMap = <TKey extends string>(
	value: unknown,
	keys: readonly TKey[],
	path: string,
): NormalizedRequiredAccessRuleMap<TKey> => {
	const rules = normalizeAccessRuleMap(value, keys, path)

	for (const key of keys) {
		if (rules === undefined || !Object.hasOwn(rules, key)) {
			throw new TypeError(`${path}.${key} is required`)
		}
	}

	// Every key was proven present above before the private type is strengthened.
	return rules as NormalizedRequiredAccessRuleMap<TKey>
}

/** Normalizes one concise rule or one sparse grouped declaration. */
export const normalizeAccessRuleOrMap = <TKey extends string>(
	value: unknown,
	keys: readonly TKey[],
	path: string,
): NormalizedAccessRule | NormalizedAccessRuleMap<TKey> =>
	isAccessRule(value)
		? value
		: (normalizeAccessRuleMap(value, keys, path) ?? immutableRecord({}))
