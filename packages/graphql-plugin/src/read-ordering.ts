import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

/** Converts the ordered GraphQL representation into Core's object input. */
export const normalizeGraphqlOrdering = (
	value: unknown,
): Readonly<Record<string, 'asc' | 'desc'>> => {
	if (!isUnknownArray(value)) {
		throw new TypeError('GraphQL orderBy must be a list')
	}
	const order: Record<string, 'asc' | 'desc'> = {}
	for (const [index, item] of value.entries()) {
		if (
			!isPlainRecord(item) ||
			typeof item.field !== 'string' ||
			(item.direction !== 'asc' && item.direction !== 'desc')
		) {
			throw new TypeError(
				`GraphQL orderBy[${String(index)}] must contain a field and direction`,
			)
		}
		if (Object.hasOwn(order, item.field)) {
			throw new TypeError(`GraphQL orderBy repeats field ${item.field}`)
		}
		order[item.field] = item.direction
	}
	return immutableRecord(order)
}

/** Adds the accepted deterministic ID order without changing prior priority. */
export const effectiveGraphqlConnectionOrdering = (
	value: unknown,
): Readonly<Record<string, 'asc' | 'desc'>> => {
	const order =
		value === undefined || value === null
			? immutableRecord<Record<string, 'asc' | 'desc'>>({})
			: normalizeGraphqlOrdering(value)
	return Object.hasOwn(order, 'id')
		? order
		: immutableRecord({ ...order, id: 'asc' })
}
