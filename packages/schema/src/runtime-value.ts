/**
 * Narrows untrusted values to plain records without accepting class instances
 * or collection objects whose enumerable shape would lose runtime semantics.
 */
export const isPlainRecord = (
	value: unknown,
): value is Record<string, unknown> => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false
	}

	const prototype: object | null = Reflect.getPrototypeOf(value)

	return prototype === null || prototype === Object.prototype
}
