/** Reads normalized update operations across source-only Runtime fixtures. */
export const getUpdateOperations = (update: unknown): readonly unknown[] => {
	if (typeof update !== 'object' || update === null) return []
	const operations: unknown = Reflect.get(update, 'operations')
	return Array.isArray(operations) ? operations : []
}
