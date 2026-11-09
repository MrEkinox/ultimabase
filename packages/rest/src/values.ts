// Values as GraphQL's JSON (D-129): a date is ISO 8601 text, read back to a
// `Date` from its field's type, in filters and in data, as `DateTime` is.
import type { ServedOneOf } from '@ultimabase/http/internal'
import { oneOfsOf } from '@ultimabase/http/internal'
import type { SchemaField } from 'ultimabase'
import { InvalidQuery } from 'ultimabase'
import { maxFilterDepth, maxWriteDepth } from 'ultimabase/internal'
import type { Api, Args } from './entries.ts'
import { entryOf } from './entries.ts'

const iso =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

export const unknownKey = (path: string, model: string): InvalidQuery =>
	new InvalidQuery(path, `Unknown key '${path}' on ${model}.`)

export const isArgs = (value: unknown): value is Args =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** A string as a `Date`; any other value left for the kernel to check. */
function date(value: unknown, path: string): unknown {
	if (typeof value !== 'string') return value
	const parsed = iso.test(value) ? new Date(value) : undefined
	if (parsed !== undefined && !Number.isNaN(parsed.getTime())) return parsed
	throw new InvalidQuery(
		path,
		`${path} must be an ISO 8601 DateTime, such as 2026-01-31T12:00:00.000Z.`,
	)
}

const isDate = (field: SchemaField | undefined, key: string): boolean =>
	key === 'createdAt' ||
	key === 'updatedAt' ||
	(field?.kind === 'scalar' && field.type === 'dateTime')

/** A date field's filter: a value, or operators whose values are dates. */
function dateFilter(value: unknown, path: string): unknown {
	if (!isArgs(value)) return date(value, path)
	const filter: [string, unknown][] = []
	for (const [operator, operand] of Object.entries(value)) {
		const at = `${path}.${operator}`
		filter.push([
			operator,
			Array.isArray(operand)
				? operand.map((item: unknown, index) => date(item, `${at}.${index}`))
				: date(operand, at),
		])
	}
	return Object.fromEntries(filter)
}

const each = (
	value: unknown,
	path: string,
	map: (item: Args, at: string) => Args,
): unknown =>
	Array.isArray(value)
		? value.map((item: unknown, index) =>
				isArgs(item) ? map(item, `${path}.${index}`) : item,
			)
		: isArgs(value)
			? map(value, path)
			: value

/**
 * A filter with its dates read, through `AND`, `OR`, `NOT` and relations.
 * Past the deepest level, it is left as is, for the kernel to refuse
 * (D-228).
 */
export function whereOf(
	api: Api,
	model: string,
	where: Args,
	path: string,
	depth = 1,
): Args {
	if (depth > maxFilterDepth) return where
	const fields = entryOf(api, model).model.fields
	const oneOfs = oneOfsOf(entryOf(api, model).model)
	// Built from its entries: a `__proto__` key stays a key, which the kernel
	// refuses, instead of a prototype that loses the filter.
	const read: [string, unknown][] = []
	for (const [key, value] of Object.entries(where)) {
		const at = `${path}.${key}`
		const field = fields.find((candidate) => candidate.name === key)
		if (key === 'AND' || key === 'OR' || key === 'NOT') {
			read.push([
				key,
				each(value, at, (inner, to) =>
					whereOf(api, model, inner, to, depth + 1),
				),
			])
		} else if (isDate(field, key)) read.push([key, dateFilter(value, at)])
		else if (field !== undefined && field.kind !== 'scalar' && isArgs(value)) {
			read.push([key, related(api, field.target, value, at, depth)])
		} else {
			const oneOf = oneOfs.find((candidate) => candidate.name === key)
			read.push([
				key,
				oneOf !== undefined && isArgs(value)
					? oneOfWhere(api, oneOf, value, at, depth)
					: value,
			])
		}
	}
	return Object.fromEntries(read)
}

/** `is`, `some` and the others, each the target's filter. */
function related(
	api: Api,
	target: string,
	value: Args,
	path: string,
	depth: number,
): Args {
	const operators = Object.entries(value).map(
		([operator, inner]): [string, unknown] => [
			operator,
			isArgs(inner)
				? whereOf(api, target, inner, `${path}.${operator}`, depth + 1)
				: inner,
		],
	)
	return Object.fromEntries(operators)
}

/**
 * A `oneOf`'s filter (D-247): each kind's a relation's, `is` and `isNot`
 * the shared fields', whose dates are any kind's.
 */
function oneOfWhere(
	api: Api,
	oneOf: ServedOneOf,
	value: Args,
	path: string,
	depth: number,
): Args {
	const [first] = oneOf.kinds
	const read: [string, unknown][] = []
	for (const [key, operand] of Object.entries(value)) {
		const at = `${path}.${key}`
		const kind = oneOf.kinds.find((candidate) => candidate.kind === key)
		if (kind !== undefined && isArgs(operand)) {
			read.push([key, related(api, kind.field.target, operand, at, depth)])
		} else if ((key === 'is' || key === 'isNot') && isArgs(operand)) {
			read.push([key, whereOf(api, first.field.target, operand, at, depth + 1)])
		} else read.push([key, operand])
	}
	return Object.fromEntries(read)
}

type Read = (item: Args, path: string) => Args

/** `item` with its `key` read, when it is an object. */
function within(item: Args, key: string, path: string, read: Read): Args {
	const value = item[key]
	return isArgs(value)
		? { ...item, [key]: read(value, `${path}.${key}`) }
		: item
}

// The operations that create, update or delete a target's row (D-138).
const reaching = new Set(['connectOrCreate', 'create', 'delete', 'update'])

/**
 * A relation write with the dates of its rows and unique targets read
 * (D-128, D-138). A hidden model is connected, disconnected or set, never
 * created, updated or deleted, as over GraphQL.
 */
function relationOf(
	api: Api,
	model: string,
	field: Exclude<SchemaField, { readonly kind: 'scalar' }>,
	value: Args,
	path: string,
	depth: number,
): Args {
	const { target } = field
	const hidden = !entryOf(api, target).visible
	const row: Read = (item, at) => dataOf(api, target, item, at, depth + 1)
	const unique: Read = (item, at) => whereOf(api, target, item, at)
	const read: { [key: string]: unknown } = { ...value }
	for (const [key, operand] of Object.entries(value)) {
		const at = `${path}.${key}`
		if (hidden && reaching.has(key)) {
			throw unknownKey(at, model)
		}
		if (key === 'create') read[key] = each(operand, at, row)
		else if (key === 'connectOrCreate') {
			read[key] = each(operand, at, (item, to) =>
				within(within(item, 'where', to, unique), 'create', to, row),
			)
		} else if (key === 'update' && field.kind === 'many') {
			read[key] = each(operand, at, (item, to) =>
				within(within(item, 'where', to, unique), 'data', to, row),
			)
		} else if (key === 'update') read[key] = each(operand, at, row)
		else if (key === 'delete' && field.kind === 'many') {
			read[key] = each(operand, at, unique)
		}
	}
	return read
}

/**
 * A `oneOf`'s write (D-247): each kind's row of `create` and
 * `connectOrCreate` read as its model's; a hidden kind is only connected.
 */
function oneOfData(
	api: Api,
	model: string,
	oneOf: ServedOneOf,
	value: Args,
	path: string,
	depth: number,
): Args {
	const read: { [key: string]: unknown } = { ...value }
	for (const op of ['create', 'connectOrCreate']) {
		const operand = value[op]
		if (!isArgs(operand)) continue
		const kinds: { [kind: string]: unknown } = { ...operand }
		for (const { kind, field } of oneOf.kinds) {
			const item = operand[kind]
			const at = `${path}.${op}.${kind}`
			if (item === undefined) continue
			if (!entryOf(api, field.target).visible) throw unknownKey(at, model)
			const row: Read = (inner, to) =>
				dataOf(api, field.target, inner, to, depth + 1)
			const unique: Read = (inner, to) => whereOf(api, field.target, inner, to)
			kinds[kind] = !isArgs(item)
				? item
				: op === 'create'
					? row(item, at)
					: within(within(item, 'where', at, unique), 'create', at, row)
		}
		read[op] = kinds
	}
	return read
}

/**
 * Data with its dates read, in the rows its relation writes reach too. Past
 * the deepest level, it is left as is, for the kernel to refuse (D-350).
 */
export function dataOf(
	api: Api,
	model: string,
	data: Args,
	path: string,
	depth = 1,
): Args {
	if (depth > maxWriteDepth) return data
	const read: { [field: string]: unknown } = { ...data }
	for (const field of entryOf(api, model).model.fields) {
		const value = data[field.name]
		const at = `${path}.${field.name}`
		if (field.kind === 'scalar') {
			if (field.type === 'dateTime' && value !== undefined) {
				read[field.name] = date(value, at)
			}
			// Number updates are the server API's only (D-132).
			if (field.type === 'number' && isArgs(value)) {
				throw new InvalidQuery(at, `${at} must be a number.`)
			}
		} else if (isArgs(value)) {
			read[field.name] = relationOf(api, model, field, value, at, depth)
		}
	}
	for (const oneOf of oneOfsOf(entryOf(api, model).model)) {
		const value = data[oneOf.name]
		const at = `${path}.${oneOf.name}`
		if (isArgs(value))
			read[oneOf.name] = oneOfData(api, model, oneOf, value, at, depth)
	}
	return read
}
