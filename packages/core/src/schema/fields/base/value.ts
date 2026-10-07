/**
 * Validates static primitive defaults at the same boundary as declarative metadata.
 */
export const normalizeStringValue = (value: unknown, path: string): string => {
	if (typeof value !== 'string') {
		throw new TypeError(`${path} must be a string`)
	}

	return value
}

/** Keeps boolean defaults exact instead of relying on JavaScript truthiness. */
export const normalizeBooleanValue = (
	value: unknown,
	path: string,
): boolean => {
	if (typeof value !== 'boolean') {
		throw new TypeError(`${path} must be a boolean`)
	}

	return value
}

/** Rejects fractional and unsafe integer defaults before a plan can be compiled. */
export const normalizeSafeIntegerValue = (
	value: unknown,
	path: string,
): number => {
	if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
		throw new TypeError(`${path} must be a safe integer`)
	}

	return value
}

/** Preserves every JavaScript number while leaving finite constraints to Runtime. */
export const normalizeNumberValue = (value: unknown, path: string): number => {
	if (typeof value !== 'number') {
		throw new TypeError(`${path} must be a number`)
	}

	return value
}

/** Keeps bigint defaults separate from coercible number and string inputs. */
export const normalizeBigintValue = (value: unknown, path: string): bigint => {
	if (typeof value !== 'bigint') {
		throw new TypeError(`${path} must be a bigint`)
	}

	return value
}
