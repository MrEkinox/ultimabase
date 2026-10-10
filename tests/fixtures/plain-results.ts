/**
 * Recognizes one query result row: results are frozen plain objects without
 * methods (ADR-0310), including included pointer and relation targets.
 */
export const isPlainResult = (
	value: unknown,
): value is Readonly<Record<string, unknown>> =>
	typeof value === 'object' &&
	value !== null &&
	Object.getPrototypeOf(value) === Object.prototype &&
	Object.isFrozen(value)
