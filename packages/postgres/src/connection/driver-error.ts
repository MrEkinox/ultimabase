/** Reads the stable driver code without trusting or retaining the original error. */
export const readPostgresDriverCode = (error: unknown): string | undefined => {
	if (
		(typeof error !== 'object' || error === null) &&
		typeof error !== 'function'
	) {
		return undefined
	}

	if (!('code' in error) || typeof error.code !== 'string') {
		return undefined
	}

	return error.code
}
