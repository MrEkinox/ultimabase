import { isPlainRecord } from '@ultimabase/shared'

/** @internal Rejects every own key outside one exact object vocabulary. */
export const assertExactObjectKeys = (
	value: object,
	keys: ReadonlySet<string>,
	unknownKeyPrefix: string,
): void => {
	const unknownKey = Reflect.ownKeys(value).find(
		(key) => typeof key !== 'string' || !keys.has(key),
	)
	if (unknownKey !== undefined) {
		throw new TypeError(`${unknownKeyPrefix}${String(unknownKey)}`)
	}
}

/** @internal Rejects unknown enumerable string keys while deliberately ignoring symbols. */
export const assertExactEnumerableKeys = (
	value: object,
	keys: ReadonlySet<string>,
	unknownKeyPrefix: string,
): void => {
	const unknownKey = Object.keys(value).find((key) => !keys.has(key))
	if (unknownKey !== undefined)
		throw new TypeError(`${unknownKeyPrefix}${unknownKey}`)
}

/** @internal Combines the shared plain-object and exact-key boundary. */
export const assertExactPlainObject: (
	value: unknown,
	keys: ReadonlySet<string>,
	notPlainObject: string,
	unknownKeyPrefix: string,
) => asserts value is Readonly<Record<PropertyKey, unknown>> = (
	value,
	keys,
	notPlainObject,
	unknownKeyPrefix,
) => {
	if (!isPlainRecord(value)) throw new TypeError(notPlainObject)
	assertExactObjectKeys(value, keys, unknownKeyPrefix)
}
