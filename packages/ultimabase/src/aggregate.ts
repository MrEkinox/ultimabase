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
type Key = keyof typeof operations
const keys: readonly Key[] = ['_count', '_sum', '_avg', '_min', '_max']

/** The types each aggregate takes; `_count` takes every scalar. */
const takes: { readonly [K in Key]?: readonly string[] } = {
	_sum: ['number'],
	_avg: ['number'],
	_min: ['number', 'string', 'enum', 'date'],
	_max: ['number', 'string', 'enum', 'date'],
}

function refuse(path: string, kind: string): never {
	throw new InvalidQuery(
		path,
		`${path} is ${kind}, which cannot be aggregated.`,
	)
}

/** The field's type, which fails on a field an aggregate cannot take. */
function typeOf(model: ModelInfo, field: string, path: string): string {
	const known = model.fields.get(field)
	if (known === undefined) {
		if (!systemFields.includes(field)) throw unknownKey(path, model.name)
		return field === 'id' ? 'string' : 'date'
	}
	if (known.kind !== 'scalar') return refuse(path, 'a relation')
	if (known.list) return refuse(path, 'a list')
	if (known.type === 'json') return refuse(path, 'json')
	if (known.codec !== undefined) return refuse(path, 'a plugin field')
	return known.type
}

type Asked = { readonly key: Key; readonly field: string | undefined }

/** The aggregates `key` asks for, each checked. */
function asked(context: Context, key: Key, value: unknown): readonly Asked[] {
	const { model, scope } = context
	if (key === '_count' && value === true) return [{ key, field: undefined }]
	return entries(value, key).map(([field, flag]): Asked => {
		const path = `${key}.${field}`
		if (flag !== true) {
			throw new InvalidQuery(path, `${path} must be true.`)
		}
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
	})
}

export async function aggregate(
	context: Context,
	store: Store,
	args: unknown,
): Promise<unknown> {
	const { model } = context
	const found = given(args, model.name, ['where', ...keys], [])
	const wanted = keys.flatMap((key) =>
		found.has(key) ? asked(context, key, found.get(key)) : [],
	)
	const where = await filtered(context, found, 'read')
	const aggregates = wanted.map(({ key, field }): Aggregate => ({
		operation: operations[key],
		...(field !== undefined && { field }),
	}))
	const values = await store.aggregate({
		model: model.name,
		...(where && { where }),
		aggregates,
	})
	const result: { [key: string]: unknown } = {}
	for (const [index, { key, field }] of wanted.entries()) {
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
