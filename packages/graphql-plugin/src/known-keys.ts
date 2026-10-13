/** Rejects undeclared keys, symbols included, naming the first offending key. */
export const assertGraphqlKnownKeys = (
	value: object,
	keys: ReadonlySet<string | symbol>,
	path: string,
	label = 'unknown option',
): void => {
	for (const key of Reflect.ownKeys(value)) {
		if (!keys.has(key)) {
			throw new TypeError(`${path} contains ${label}: ${String(key)}`)
		}
	}
}
