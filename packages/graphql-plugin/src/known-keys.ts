/** Returns one own key when it is a declared string key, otherwise rejects it. */
const readGraphqlKnownKey = (
	key: string | symbol,
	keys: ReadonlySet<string>,
	path: string,
	label = 'unknown option',
): string => {
	if (typeof key !== 'string' || !keys.has(key)) {
		throw new TypeError(`${path} contains ${label}: ${String(key)}`)
	}
	return key
}

/** Rejects symbol and undeclared keys, naming the first offending key. */
export const assertGraphqlKnownKeys = (
	value: object,
	keys: ReadonlySet<string>,
	path: string,
	label?: string,
): void => {
	for (const key of Reflect.ownKeys(value)) {
		readGraphqlKnownKey(key, keys, path, label)
	}
}
