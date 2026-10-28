// `aggregate` (D-143): counts, sums, averages, minimums and maximums of the
// rows the caller reads, on scalar fields it may filter on.
import type { Aggregate } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { Context } from './query-context.ts'
import { filtered, given } from './query-context.ts'
import { entries, systemFields, unknownKey } from './query-where.ts'
import type { ModelInfo } from './schema.ts'
import type { Store } from './transaction.ts'

const operations = {
	_count: 'count',
	_sum: 'sum',
	_avg: 'avg',
	_min: 'min',
	_max: 'max',
} as const
export type Key = keyof typeof operations
export const keys: readonly Key[] = ['_count', '_sum', '_avg', '_min', '_max']

/** The types each aggregate takes; `_count` takes every scalar. */
const takes: { readonly [K in Key]?: readonly string[] } = {
	_sum: ['number', 'decimal'],
	_avg: ['number', 'decimal'],
	_min: ['number', 'decimal', 'string', 'enum', 'dateTime'],
	_max: ['number', 'decimal', 'string', 'enum', 'dateTime'],
}

/** The field's type, which fails on a field an aggregate cannot take. */
export function typeOf(
	model: ModelInfo,
	field: string,
	path: string,
	verb = 'aggregated',
): string {
	const refuse = (kind: string): never => {
		throw new InvalidQuery(path, `${path} is ${kind}, which cannot be ${verb}.`)
	}
	const known = model.fields.get(field)
	if (known === undefined) {
		if (!systemFields.includes(field)) throw unknownKey(path, model.name)
		return field === 'id' ? 'string' : 'dateTime'
	}
	if (known.kind !== 'scalar') return refuse('a relation')
	if (known.list) return refuse('a list')
	if (known.type === 'json') return refuse('json')
	if (known.codec !== undefined) return refuse('a plugin field')
	return known.type
}

export type Asked = { readonly key: Key; readonly field: string | undefined }

/** Aggregate `key` of `field`, checked; `_all` counts the rows. */
export function checked(
	{ model, scope }: Context,
	key: Key,
	field: string,
	path: string,
): Asked {
	if (key === '_count' && field === '_all') return { key, field: undefined }
	const type = typeOf(model, field, path)
	const types = takes[key]
	if (types !== undefined && !types.includes(type)) {
		throw new InvalidQuery(
			path,
			`${path} is a ${type} field; ${key} takes ${types.join(', ')} fields.`,
		)
	}
	scope.check(model, field, path, 'aggregates')
	return { key, field }
}

/** The aggregates `key` asks for, each checked. */
function asked(context: Context, key: Key, value: unknown): readonly Asked[] {
	if (key === '_count' && value === true) return [{ key, field: undefined }]
	return entries(value, key).map(([field, flag]): Asked => {
		const path = `${key}.${field}`
		if (flag !== true) {
			throw new InvalidQuery(path, `${path} must be true.`)
		}
		return checked(context, key, field, path)
	})
}

/** The aggregates the arguments ask for, in the order of `keys`. */
export const wanted = (
	context: Context,
	found: ReadonlyMap<string, unknown>,
): readonly Asked[] =>
	keys.flatMap((key) =>
		found.has(key) ? asked(context, key, found.get(key)) : [],
	)

export const toAggregate = ({ key, field }: Asked): Aggregate => ({
	operation: operations[key],
	...(field !== undefined && { field }),
})

/** The aggregates' values under the keys the arguments ask for. */
export function shaped(
	found: ReadonlyMap<string, unknown>,
	list: readonly Asked[],
	values: readonly unknown[],
): { [key: string]: unknown } {
	const result: { [key: string]: unknown } = {}
	for (const [index, { key, field }] of list.entries()) {
		const value = values[index]
		if (key === '_count' && found.get(key) === true) {
			result[key] = value
			continue
		}
		const fields = result[key] ?? {}
		result[key] = { ...fields, [field ?? '_all']: value }
	}
	for (const key of keys) {
		if (found.has(key)) result[key] ??= {}
	}
	return result
}

export async function aggregate(
	context: Context,
	store: Store,
	args: unknown,
): Promise<unknown> {
	const { model } = context
	const found = given(args, model.name, ['where', ...keys], [])
	const list = wanted(context, found)
	const where = await filtered(context, found, 'read')
	const [values = []] = await store.aggregate({
		model: model.name,
		...(where && { where }),
		aggregates: list.map(toAggregate),
	})
	return shaped(found, list, values)
}
