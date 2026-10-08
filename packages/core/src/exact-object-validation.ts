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

/** @internal Rejects every value that is not a plain object with one exact message. */
export const assertPlainObject: (
	value: unknown,
	message: string,
) => asserts value is Record<string, unknown> = (value, message) => {
	if (!isPlainRecord(value)) throw new TypeError(message)
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
	assertPlainObject(value, notPlainObject)
	assertExactObjectKeys(value, keys, unknownKeyPrefix)
}

/** @internal Combines the shared plain-object and enumerable-key boundary. */
export const assertExactEnumerablePlainObject: (
	value: unknown,
	keys: ReadonlySet<string>,
	notPlainObject: string,
	unknownKeyPrefix: string,
) => asserts value is Record<string, unknown> = (
	value,
	keys,
	notPlainObject,
	unknownKeyPrefix,
) => {
	assertPlainObject(value, notPlainObject)
	assertExactEnumerableKeys(value, keys, unknownKeyPrefix)
}

/** @internal Validates one command input with required and optional enumerable keys. */
export const assertExactCommandKeys: (
	input: unknown,
	path: string,
	requiredKeys: readonly string[],
	optionalKeys?: readonly string[],
) => asserts input is Readonly<Record<string, unknown>> = (
	input,
	path,
	requiredKeys,
	optionalKeys = [],
) => {
	assertExactEnumerablePlainObject(
		input,
		new Set([...requiredKeys, ...optionalKeys]),
		`${path} must be an object`,
		`${path} contains unknown key: `,
	)

	for (const key of requiredKeys) {
		if (!Object.hasOwn(input, key)) {
			throw new TypeError(`${path} must contain key: ${key}`)
		}
	}
}

/** @internal Compares two objects' own enumerable string-key sets, ignoring order. */
export const haveSameEnumerableKeys = (
	left: object,
	right: object,
): boolean => {
	const leftKeys = Object.keys(left)

	return (
		leftKeys.length === Object.keys(right).length &&
		leftKeys.every((key) => Object.hasOwn(right, key))
	)
}
