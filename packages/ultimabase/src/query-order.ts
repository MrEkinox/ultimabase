// A read's `orderBy` (D-20): the row's fields, a field reached through
// `one` relations, or the number of a `many` relation's rows (D-134), or
// how well the row matches the read's `_search` (D-148).
import type { Order, Sort, Step } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { ModelInfo } from './schema.ts'
import { searchedFields } from './query-search.ts'
import type { Models, Scope } from './query-where.ts'
import {
	entries,
	isObject,
	modelOf,
	systemFields,
	unknownKey,
} from './query-where.ts'

export function direction(value: unknown, path: string): 'asc' | 'desc' {
	if (value !== 'asc' && value !== 'desc') {
		throw new InvalidQuery(path, `${path} must be 'asc' or 'desc'.`)
	}
	return value
}

/**
 * A sort key's value: a direction, or on an optional field `{ sort, nulls }`
 * (D-149).
 */
export function sortOf(value: unknown, path: string, optional: boolean): Sort {
	if (!isObject(value)) return { direction: direction(value, path) }
	if (!optional) {
		throw new InvalidQuery(
			path,
			`${path} is required: it sorts by 'asc' or 'desc'.`,
		)
	}
	const { sort, nulls, ...rest } = value
	const [extra] = Object.keys(rest)
	if (extra !== undefined) {
		throw new InvalidQuery(
			`${path}.${extra}`,
			`${path} takes sort and nulls only.`,
		)
	}
	const sorted = direction(sort, `${path}.sort`)
	if (nulls === undefined) return { direction: sorted }
	if (nulls !== 'first' && nulls !== 'last') {
		const at = `${path}.nulls`
		throw new InvalidQuery(at, `${at} must be 'first' or 'last'.`)
	}
	return { direction: sorted, nulls }
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
	search: string | undefined,
): Order[] {
	const order: Order[] = []
	const path = through.length === 0 ? {} : { through }
	const searched = searchedFields(model.fields.values()).length > 0
	for (const [field, value] of entries(part, at)) {
		const where = `${at}.${field}`
		if (field === '_relevance' && through.length === 0 && searched) {
			if (search === undefined) {
				throw new InvalidQuery(
					where,
					`${where} sorts by the _search at the top of the read's where, which has none.`,
				)
			}
			order.push({
				field,
				direction: direction(value, where),
				relevance: search,
			})
			continue
		}
		sortable(model, field, where)
		scope?.check(model, field, where, 'sorts')
		const known = model.fields.get(field)
		if (known === undefined || known.kind === 'scalar') {
			const optional = known?.optional === true
			order.push({ field, ...sortOf(value, where, optional), ...path })
			continue
		}
		const target = modelOf(models, known.target)
		if (known.kind === 'one') {
			const readable = scope?.readable(target.name)
			const step = { relation: field, ...(readable && { where: readable }) }
			const next = [...through, step]
			order.push(...keys(models, target, value, where, scope, next, search))
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
		const count = scope?.related(model, known) ?? {}
		order.push({ field, direction: sorted, ...path, count })
	}
	return order
}

/**
 * A read's sort keys, ending with `id` so the order is total; `search` is
 * the text of its where's `_search`.
 */
export function orderBy(
	models: Models,
	model: ModelInfo,
	value: unknown,
	path: string,
	scope: Scope | undefined,
	search?: string,
): Order[] {
	const parts = Array.isArray(value) ? value : [value]
	const order = parts.flatMap((part: unknown, index) => {
		const at = Array.isArray(value) ? `${path}.${index}` : path
		return keys(models, model, part, at, scope, [], search)
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
