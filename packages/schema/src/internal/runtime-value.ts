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

/**
 * Narrows arrays without inheriting the standard library's permissive element type.
 */
export const isUnknownArray = (value: unknown): value is unknown[] =>
	Array.isArray(value)

/**
 * Protects public JavaScript entry points that cannot rely on TypeScript literals.
 */
export const assertNonEmptyString = (value: unknown, path: string): string => {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`${path} must be a non-empty string`)
	}

	return value
}
