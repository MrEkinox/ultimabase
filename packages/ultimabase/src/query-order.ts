// A read's `orderBy` (D-20): the row's fields, a field reached through
// `one` relations, or the number of a `many` relation's rows (D-134).
import type { Order, Step } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { ModelInfo } from './schema.ts'
import type { Models, Scope } from './query-where.ts'
import { entries, isObject, unknownKey } from './query-where.ts'

const systemFields = ['id', 'createdAt', 'updatedAt']

function direction(value: unknown, path: string): 'asc' | 'desc' {
	if (value !== 'asc' && value !== 'desc') {
		throw new InvalidQuery(path, `${path} must be 'asc' or 'desc'.`)
	}
	return value
}

/** A scalar field that sorts: no json, no list, no plugin field (D-94). */
function sortable(model: ModelInfo, field: string, path: string): void {
	const known = model.fields.get(field)
	if (known === undefined) {
		if (!systemFields.includes(field)) throw unknownKey(path, model.name)
		return
	}
	if (known.kind !== 'scalar') return
	if (known.type !== 'json' && !known.list && known.codec === undefined) {
		return
	}
	const kind =
		known.codec !== undefined
			? `a ${known.codec.plugin} field`
			: known.type === 'json'
				? 'a json field'
				: 'a list'
	throw new InvalidQuery(path, `${path} is ${kind}, which cannot be sorted.`)
}

/** The sort keys of one object of `orderBy`, in its keys' order. */
function keys(
	models: Models,
	model: ModelInfo,
	part: unknown,
	at: string,
	scope: Scope | undefined,
	through: readonly Step[],
): Order[] {
	const order: Order[] = []
	const path = through.length === 0 ? {} : { through }
	for (const [field, value] of entries(part, at)) {
		const where = `${at}.${field}`
		sortable(model, field, where)
		scope?.check(model, field, where, 'sorts')
		const known = model.fields.get(field)
		if (known === undefined || known.kind === 'scalar') {
			order.push({ field, direction: direction(value, where), ...path })
			continue
		}
		const target = models.get(known.target)
		if (target === undefined) throw new Error(`Unknown model ${known.target}.`)
		const readable = scope?.readable(target.name)
		if (known.kind === 'one') {
			const step = { relation: field, ...(readable && { where: readable }) }
			const next = [...through, step]
			order.push(...keys(models, target, value, where, scope, next))
			continue
		}
		const [only, ...rest] = isObject(value) ? Object.entries(value) : []
		if (only?.[0] !== '_count' || rest.length > 0) {
			throw new InvalidQuery(
				where,
				`${where} is a many relation, sorted by { _count: 'asc' | 'desc' }.`,
			)
		}
		const sorted = direction(only[1], `${where}._count`)
		order.push({ field, direction: sorted, ...path, count: readable ?? {} })
	}
	return order
}

/** A read's sort keys, ending with `id` so the order is total. */
export function orderBy(
	models: Models,
	model: ModelInfo,
	value: unknown,
	path: string,
	scope: Scope | undefined,
): Order[] {
	const parts = Array.isArray(value) ? value : [value]
	const order = parts.flatMap((part: unknown, index) => {
		const at = Array.isArray(value) ? `${path}.${index}` : path
		return keys(models, model, part, at, scope, [])
	})
	// The order is total, so a cursor and a page are exact.
	const total = order.some(
		(each) =>
			each.field === 'id' &&
			each.through === undefined &&
			each.count === undefined,
	)
	if (!total) order.push({ field: 'id', direction: 'asc' })
	return order
}
