/** Applies an empty option object only when an optional argument is omitted. */
export const defaultUndefinedOptions = (value: unknown): unknown => {
	if (value === undefined) return {}
	return value
}

/** Resolves one bounded integer option without weakening the caller's policy. */
export const resolveBoundedInteger = (
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
	path: string,
): number => {
	const resolved = value ?? fallback
	if (
		typeof resolved !== 'number' ||
		!Number.isSafeInteger(resolved) ||
		resolved < minimum ||
		resolved > maximum
	) {
		throw new TypeError(
			`${path} must be a safe integer from ${String(minimum)} through ${String(maximum)}`,
		)
	}
	return resolved
}
