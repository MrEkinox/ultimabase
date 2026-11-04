// A `oneOf` in a `where` (D-247): `is` and `isNot` on the fields its kinds
// share, a kind's own `is` and `isNot`, `kind`, and `null` when optional;
// each turns into filters on the hidden `one` of each kind.
import type { Filter } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { OneOfInfo } from './one-of-schema.ts'
import { entries, unknownKey } from './query-where.ts'

/** The filters a relation's operand turns into, on its hidden `one`. */
type Related = (field: string, value: unknown, path: string) => Filter[]

const all = (filters: readonly Filter[]): Filter =>
	filters.length === 1 && filters[0] !== undefined
		? filters[0]
		: { AND: [...filters] }

export function oneOfFilters(
	model: string,
	info: OneOfInfo,
	value: unknown,
	path: string,
	related: Related,
): Filter[] {
	const filters: Filter[] = []
	for (const [key, given] of entries(value, path)) {
		const at = `${path}.${key}`
		const kind = info.kinds.get(key)
		if (kind !== undefined) {
			filters.push(...related(kind.field, given, at))
			continue
		}
		if (key === 'kind') {
			const named =
				typeof given === 'string' ? info.kinds.get(given) : undefined
			if (named === undefined) {
				const kinds = [...info.kinds.keys()].join(', ')
				throw new InvalidQuery(at, `${at} must be one of ${kinds}.`)
			}
			filters.push(...related(named.field, { isNot: null }, at))
			continue
		}
		if (key !== 'is' && key !== 'isNot') throw unknownKey(at, model)
		if (given === null && !info.optional) {
			throw new InvalidQuery(at, `${at}: ${model}.${info.name} is required.`)
		}
		const each = [...info.kinds.values()].map(({ field }) =>
			all(related(field, { [key]: given }, at)),
		)
		// Is X: one kind's is; is not X: no kind's is (`null` none set).
		filters.push((key === 'is') !== (given === null) ? { OR: each } : all(each))
	}
	return filters
}
