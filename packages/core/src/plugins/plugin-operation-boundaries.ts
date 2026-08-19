/** Rejects snapshots that retain mutable objects across an operation boundary. */
export const assertImmutableOperationValue = (
	value: unknown,
	path: string,
	seen: WeakSet<object> = new WeakSet(),
): void => {
	if (typeof value !== 'object' || value === null || seen.has(value)) return
	seen.add(value)
	if (!Object.isFrozen(value)) {
		throw new TypeError(`${path} snapshot must be immutable`)
	}
	for (const key of Reflect.ownKeys(value)) {
		assertImmutableOperationValue(Reflect.get(value, key), path, seen)
	}
}
