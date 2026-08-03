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

const isAccessRule = (value: unknown): value is NormalizedAccessRule =>
	typeof value === 'boolean' || typeof value === 'function'

/** Copies one declaration map while rejecting unsupported policy vocabulary. */
export const normalizeAccessRuleMap = <TKey extends string>(
	value: unknown,
	keys: readonly TKey[],
	path: string,
): NormalizedAccessRuleMap<TKey> | undefined => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	const allowedKeys = new Set<string>(keys)
	const rules: Partial<Record<TKey, NormalizedAccessRule>> = {}
	let ruleCount = 0

	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string') {
			throw new TypeError(`${path} contains an unsupported symbol key`)
		}

		if (!allowedKeys.has(key)) {
			throw new TypeError(`Unknown Access rule: ${path}.${key}`)
		}

		const rule = value[key]

		if (!isAccessRule(rule)) {
			throw new TypeError(`${path}.${key} must be a boolean or function`)
		}

		rules[key as TKey] = rule
		ruleCount += 1
	}

	return ruleCount === 0 ? undefined : immutableRecord(rules)
}
