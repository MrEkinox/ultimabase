// A read's arguments: `select`, `include`, `orderBy`, `take`, `skip` and
// `cursor` checked (D-20), as the adapter's read and the shape of the result.
import type { Filter, Nested, Order } from './adapter.ts'
import { and } from './access.ts'
import { InvalidQuery } from './errors.ts'
import type { ModelInfo } from './schema.ts'
import type { Models, Scope } from './query-where.ts'
import { entries, isObject, normalizeWhere, unknownKey } from './query-where.ts'

/** What a query returns of each row, and of each relation it reads. */
export type Shape = {
	readonly model: ModelInfo
	readonly fields: readonly string[]
	readonly relations: ReadonlyMap<string, Shape>
}

export type Plan = { readonly read: Nested; readonly shape: Shape }

const systemFields = ['id', 'createdAt', 'updatedAt']

function target(models: Models, name: string): ModelInfo {
	const model = models.get(name)
	if (model === undefined) throw new Error(`Unknown model ${name}.`)
	return model
}

/** Without `select`, scalar fields return and relations do not (D-20). */
function scalars(model: ModelInfo): string[] {
	return [
		...systemFields,
		...[...model.fields.values()]
			.filter((field) => field.kind === 'scalar')
			.map((field) => field.name),
	]
}

function integer(value: unknown, path: string, least?: number): number {
	if (
		typeof value !== 'number' ||
		!Number.isInteger(value) ||
		(least !== undefined && value < least)
	) {
		const range = least === undefined ? '' : ` of at least ${least}`
		throw new InvalidQuery(path, `${path} must be an integer${range}.`)
	}
	return value
}

function orderBy(
	model: ModelInfo,
	value: unknown,
	path: string,
	scope: Scope | undefined,
): Order[] {
	const parts = Array.isArray(value) ? value : [value]
	const order: Order[] = []
	parts.forEach((part: unknown, index) => {
		const at = Array.isArray(value) ? `${path}.${index}` : path
		for (const [field, direction] of entries(part, at)) {
			const known = model.fields.get(field)
			if (
				known === undefined
					? !systemFields.includes(field)
					: known.kind !== 'scalar'
			) {
				throw unknownKey(`${at}.${field}`, model.name)
			}
			scope?.check(model, field, `${at}.${field}`, 'sorts')
			if (direction !== 'asc' && direction !== 'desc') {
				throw new InvalidQuery(
					`${at}.${field}`,
					`${at}.${field} must be 'asc' or 'desc'.`,
				)
			}
			order.push({ field, direction })
		}
	})
	// The order is total, so a cursor and a page are exact.
	if (!order.some((each) => each.field === 'id')) {
		order.push({ field: 'id', direction: 'asc' })
	}
	return order
}

/** A unique target (D-52): exactly `id`, a unique field or a unique index. */
export function uniqueWhere(
	models: Models,
	model: ModelInfo,
	where: unknown,
	path: string,
	scope?: Scope,
): Filter {
	const given = entries(where, path)
	const keys = given.map(([key]) => key).toSorted()
	const matched = model.uniques.some(
		(fields) =>
			fields.length === keys.length &&
			fields.toSorted().every((field, index) => field === keys[index]),
	)
	if (!matched) {
		throw new InvalidQuery(
			path,
			`${path} must name exactly id, a unique field or a unique index of ${model.name}.`,
		)
	}
	const filter: { [field: string]: unknown } = {}
	for (const [key, value] of given) {
		const at = `${path}.${key}`
		if (value === null || isObject(value)) {
			throw new InvalidQuery(at, `${at} must be a value.`)
		}
		const field = model.fields.get(key)
		filter[key] = field?.kind === 'one' ? { is: { id: value } } : value
	}
	return normalizeWhere(models, model, filter, path, scope)
}

/** A read narrowed to the rows of a read filter, its cursor too (D-86). */
export function restrict(read: Nested, readable: Filter | undefined): Nested {
	if (readable === undefined) return read
	return {
		...read,
		where: and(read.where, readable),
		...(read.cursor === undefined
			? {}
			: { cursor: and(read.cursor, readable) }),
	}
}

type Kind = 'many' | 'one'

/**
 * The arguments of a relation read, or of a top-level read when `path` is
 * empty. A `scope` checks them and narrows each included relation (D-86).
 */
export function plan(
	models: Models,
	model: ModelInfo,
	args: unknown,
	path: string,
	kind: Kind,
	keys: ReadonlySet<string>,
	scope?: Scope,
): Plan {
	const given = new Map(args === undefined ? [] : entries(args, path || 'args'))
	const at = (key: string): string => (path === '' ? key : `${path}.${key}`)
	for (const key of given.keys()) {
		if (!keys.has(key)) throw unknownKey(at(key), model.name)
	}
	const select = given.get('select')
	const include = given.get('include')
	if (select !== undefined && include !== undefined) {
		throw new InvalidQuery(
			path,
			`${at('select')} and include cannot be used together.`,
		)
	}
	const read: {
		-readonly [K in keyof Nested]: Nested[K]
	} = {}
	const fields: string[] = select === undefined ? scalars(model) : []
	const relations = new Map<string, Shape>()
	const nested: { [field: string]: Nested } = {}
	const chosen = select ?? include
	if (chosen !== undefined) {
		const base = select === undefined ? 'include' : 'select'
		for (const [name, value] of entries(chosen, at(base))) {
			const where = `${at(base)}.${name}`
			const field = model.fields.get(name)
			const scalar =
				field === undefined
					? systemFields.includes(name)
					: field.kind === 'scalar'
			if ((field === undefined && !scalar) || (base === 'include' && scalar)) {
				throw unknownKey(where, model.name)
			}
			if (value === false) continue
			if (scalar) {
				if (value !== true) {
					throw new InvalidQuery(where, `${where} must be a boolean.`)
				}
				fields.push(name)
				continue
			}
			if (field === undefined || field.kind === 'scalar') continue
			const relation = plan(
				models,
				target(models, field.target),
				value === true ? undefined : value,
				where,
				field.kind,
				field.kind === 'many' ? manyKeys : oneKeys,
				scope,
			)
			nested[name] = restrict(relation.read, scope?.readable(field.target))
			relations.set(name, relation.shape)
		}
	}
	if (Object.keys(nested).length > 0) read.include = nested
	if (given.has('where')) {
		read.where = normalizeWhere(
			models,
			model,
			given.get('where'),
			at('where'),
			scope,
		)
	}
	if (kind === 'many') {
		read.orderBy = orderBy(
			model,
			given.get('orderBy') ?? [],
			at('orderBy'),
			scope,
		)
		if (given.has('take')) read.take = integer(given.get('take'), at('take'))
		if (given.has('skip')) read.skip = integer(given.get('skip'), at('skip'), 0)
		if (given.has('cursor')) {
			read.cursor = uniqueWhere(
				models,
				model,
				given.get('cursor'),
				at('cursor'),
				scope,
			)
		}
	}
	return { read, shape: { model, fields, relations } }
}

const oneKeys = new Set(['select', 'include'])
const manyKeys = new Set([
	...oneKeys,
	'where',
	'orderBy',
	'take',
	'skip',
	'cursor',
])

/** The fields of a row its field read rules hide (D-44). */
export type Hidden = (
	model: ModelInfo,
	row: { readonly [field: string]: unknown },
	fields: Iterable<string>,
) => ReadonlySet<string>

/** A row as the query returns it, through the shape, without hidden fields. */
export function project(row: unknown, shape: Shape, hidden?: Hidden): unknown {
	if (Array.isArray(row)) {
		return row.map((item: unknown) => project(item, shape, hidden))
	}
	if (!isObject(row)) return null
	const names = [...shape.fields, ...shape.relations.keys()]
	const unseen = hidden?.(shape.model, row, names)
	const result: { [field: string]: unknown } = {}
	for (const field of shape.fields) {
		if (!unseen?.has(field)) result[field] = row[field] ?? null
	}
	for (const [name, nested] of shape.relations) {
		if (!unseen?.has(name)) result[name] = project(row[name], nested, hidden)
	}
	return result
}
