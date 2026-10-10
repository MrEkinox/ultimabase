const maximumCauseDepth = 8

const isObjectLike = (value: unknown): value is object =>
	(typeof value === 'object' && value !== null) || typeof value === 'function'

/** Finds the first error in a bounded standard cause chain carrying a driver code. */
const findPostgresDriverError = (error: unknown): object | undefined => {
	const visited = new WeakSet<object>()
	let candidate: unknown = error

	for (let depth = 0; depth < maximumCauseDepth; depth += 1) {
		if (!isObjectLike(candidate) || visited.has(candidate)) {
			return undefined
		}

		visited.add(candidate)

		if ('code' in candidate && typeof candidate.code === 'string') {
			return candidate
		}

		candidate = 'cause' in candidate ? candidate.cause : undefined
	}

	return undefined
}

/** Reads a stable driver code through bounded standard error causes only. */
export const readPostgresDriverCode = (error: unknown): string | undefined => {
	const driverError = findPostgresDriverError(error)

	return driverError !== undefined &&
		'code' in driverError &&
		typeof driverError.code === 'string'
		? driverError.code
		: undefined
}

/** Reads the violated constraint name reported beside the same driver code. */
export const readPostgresDriverConstraint = (
	error: unknown,
): string | undefined => {
	const driverError = findPostgresDriverError(error)

	return driverError !== undefined &&
		'constraint' in driverError &&
		typeof driverError.constraint === 'string'
		? driverError.constraint
		: undefined
}
