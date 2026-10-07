import { findSchemaModelRecord } from '../schema/schema/model-state.js'

/** Rejects mutable containers while retaining Core's native schema value contract. */
export const assertImmutableOperationValue = (
	value: unknown,
	path: string,
	seen: WeakSet<object> = new WeakSet(),
	withinPersistedModel = false,
): void => {
	if (typeof value !== 'object' || value === null || seen.has(value)) return
	// Native schema bytes are detached by Core but cannot be frozen by JavaScript.
	if (withinPersistedModel && value instanceof Uint8Array) return
	seen.add(value)
	if (!Object.isFrozen(value)) {
		throw new TypeError(`${path} snapshot must be immutable`)
	}
	const modelValues =
		withinPersistedModel || findSchemaModelRecord(value)?.state === 'persisted'
	// Model aliases must not exempt the same native value in an ordinary payload.
	const childrenSeen =
		modelValues && !withinPersistedModel ? new WeakSet<object>() : seen
	for (const key of Reflect.ownKeys(value)) {
		assertImmutableOperationValue(
			Reflect.get(value, key),
			path,
			childrenSeen,
			modelValues,
		)
	}
}
