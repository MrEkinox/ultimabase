/**
 * Narrows untrusted values without accepting class instances or collection
 * objects whose enumerable shape would lose runtime semantics.
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
 * Narrows arrays without inheriting the standard library's permissive element
 * type at an untrusted boundary.
 */
export const isUnknownArray = (value: unknown): value is readonly unknown[] =>
	Array.isArray(value)

/** Protects public JavaScript entry points that require one stable identifier. */
export function assertNonEmptyString(
	value: unknown,
	path: string,
): asserts value is string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`${path} must be a non-empty string`)
	}
}

/** Validates optional boolean metadata without relying on truthiness. */
export function assertOptionalBoolean(
	value: unknown,
	path: string,
): asserts value is boolean | undefined {
	if (value !== undefined && typeof value !== 'boolean') {
		throw new TypeError(`${path} must be a boolean`)
	}
}
