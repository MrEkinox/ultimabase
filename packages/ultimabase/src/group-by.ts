// `groupBy` (D-146): the rows the caller reads in groups of the same `by`
// values, each with the aggregates of `aggregate` (D-143), sorted by its
// keys or its aggregates, then paged.
import type { AggregateRead, GroupKey } from './adapter.ts'
import type { Asked, Key } from './aggregate.ts'
import {
	checked,
	keys,
	shaped,
	toAggregate,
	typeOf,
	wanted,
} from './aggregate.ts'
import { InvalidQuery } from './errors.ts'
import type { Context } from './query-context.ts'
import { filtered, given } from './query-context.ts'
import { integer } from './query-args.ts'
import { direction } from './query-order.ts'
import { entries, isObject } from './query-where.ts'
import type { Store } from './transaction.ts'

type Sort = NonNullable<AggregateRead['orderBy']>[number]

/** The fields of `by`, each checked; a `one` relation the row stores. */
function grouping({ model, scope }: Context, value: unknown): string[] {
	const message = 'by must be a non-empty list of fields.'
	const list: readonly unknown[] = Array.isArray(value) ? value : []
	if (list.length === 0) throw new InvalidQuery('by', message)
	const fields: string[] = []
	for (const [index, field] of list.entries()) {
		const path = `by.${index}`
		if (typeof field !== 'string') throw new InvalidQuery(path, message)
		if (fields.includes(field)) {
			throw new InvalidQuery(path, `${path} repeats ${field}.`)
		}
		const known = model.fields.get(field)
		if (known?.kind !== 'one' || !known.stored) {
			typeOf(model, field, path, 'grouped')
		}
		scope.check(model, field, path, 'aggregates')
		fields.push(field)
	}
	return fields
}

/** Groups by a relation's target id, `null` when the caller cannot read it. */
async function keyOf(context: Context, field: string): Promise<GroupKey> {
	const known = context.model.fields.get(field)
	if (known?.kind !== 'one') return { field }
	const where = await context.scope.filter(known.target, false)
	if (where === undefined) return { field }
	return { field: 'id', through: [{ relation: field, where }] }
}

/**
 * The groups' sort: each key of `orderBy`, then the other fields of `by`.
 * An aggregate the result does not ask for is added to `aggregates`.
 */
function sorts(
	context: Context,
	value: unknown,
	by: readonly string[],
	aggregates: Asked[],
): Sort[] {
	const at = (asked: Asked): number => {
		const index = aggregates.findIndex(
			(each) => each.key === asked.key && each.field === asked.field,
		)
		if (index !== -1) return by.length + index
		aggregates.push(asked)
		return by.length + aggregates.length - 1
	}
	const parts: readonly unknown[] = Array.isArray(value) ? value : [value]
	const sorted: Sort[] = []
	for (const [index, part] of parts.entries()) {
		const base = Array.isArray(value) ? `orderBy.${index}` : 'orderBy'
		for (const [name, order] of entries(part, base)) {
			const path = `${base}.${name}`
			if (by.includes(name)) {
				sorted.push({ at: by.indexOf(name), direction: direction(order, path) })
				continue
			}
			const key = keys.find((each): each is Key => each === name)
			if (key === undefined) {
				throw new InvalidQuery(
					path,
					`${path} must be a field of by or an aggregate.`,
				)
			}
			if (key === '_count' && !isObject(order)) {
				const asked = { key, field: undefined }
				sorted.push({ at: at(asked), direction: direction(order, path) })
				continue
			}
			for (const [field, each] of entries(order, path)) {
				const asked = checked(context, key, field, `${path}.${field}`)
				const sort = direction(each, `${path}.${field}`)
				sorted.push({ at: at(asked), direction: sort })
			}
		}
	}
	for (const [index] of by.entries()) {
		if (!sorted.some((sort) => sort.at === index)) {
			sorted.push({ at: index, direction: 'asc' })
		}
	}
	return sorted
}

export async function groupBy(
	context: Context,
	store: Store,
	args: unknown,
): Promise<unknown> {
	const { model } = context
	const allowed = ['by', 'where', 'orderBy', 'skip', 'take', ...keys]
	const found = given(args, model.name, allowed, ['by'])
	const by = grouping(context, found.get('by'))
	const asked = wanted(context, found)
	const aggregates = [...asked]
	const orderBy = sorts(context, found.get('orderBy') ?? {}, by, aggregates)
	const page: { skip?: number; take?: number } = {}
	if (found.has('skip')) page.skip = integer(found.get('skip'), 'skip', 0)
	if (found.has('take')) page.take = integer(found.get('take'), 'take', 0)
	const where = await filtered(context, found, 'read')
	const groupKeys = await Promise.all(
		by.map(async (field) => keyOf(context, field)),
	)
	const groups = await store.aggregate({
		model: model.name,
		...(where && { where }),
		aggregates: aggregates.map(toAggregate),
		by: groupKeys,
		orderBy,
		...page,
	})
	return groups.map((values) => {
		const row: { [field: string]: unknown } = {}
		for (const [index, field] of by.entries()) {
			const value = values[index] ?? null
			const relation = model.fields.get(field)?.kind === 'one'
			row[field] = relation && value !== null ? { id: value } : value
		}
		return { ...row, ...shaped(found, asked, values.slice(by.length)) }
	})
}
