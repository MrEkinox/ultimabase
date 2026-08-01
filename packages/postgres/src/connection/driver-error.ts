const maximumCauseDepth = 8

const isObjectLike = (value: unknown): value is object =>
	(typeof value === 'object' && value !== null) || typeof value === 'function'

/** Reads a stable driver code through bounded standard error causes only. */
export const readPostgresDriverCode = (error: unknown): string | undefined => {
	const visited = new WeakSet<object>()
	let candidate: unknown = error

	for (let depth = 0; depth < maximumCauseDepth; depth += 1) {
		if (!isObjectLike(candidate) || visited.has(candidate)) {
			return undefined
		}

		visited.add(candidate)

		if ('code' in candidate && typeof candidate.code === 'string') {
			return candidate.code
		}

		candidate = 'cause' in candidate ? candidate.cause : undefined
	}

	return undefined
}
