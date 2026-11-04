// A read's arguments: `select`, `include`, `orderBy`, `take`, `skip` and
// `cursor` checked (D-20), as the adapter's read and the shape of the result.
import type { Filter, Nested } from './adapter.ts'
import { and } from './access.ts'
import { InvalidQuery } from './errors.ts'
import { oneOfArgs } from './one-of-read.ts'
import type { ModelInfo } from './schema.ts'
import type { VirtualInfo } from './schema-virtuals.ts'
import { counted } from './query-counted.ts'
import { orderBy } from './query-order.ts'
import type { Models, Scope } from './query-where.ts'
import {
	entries,
	isObject,
	modelOf,
	normalizeWhere,
	systemFields,
	unknownKey,
} from './query-where.ts'

/** What a query returns of each row, and of each relation it reads. */
export type Shape = {
	readonly model: ModelInfo
	readonly fields: readonly string[]
	readonly relations: ReadonlyMap<string, Shape>
	/** The `many` relations `_count` returns (D-134). */
	readonly counts: readonly string[]
	readonly virtuals: ReadonlyMap<string, VirtualRead>
	/** Each `oneOf` it reads, and the kinds it shows (D-247). */
	readonly oneOfs: ReadonlyMap<string, ReadonlySet<string>>
}

/** A virtual a read computes (D-151): its input, and a model's rows. */
export type VirtualRead = {
	readonly info: VirtualInfo
	readonly input: { readonly [key: string]: unknown }
	readonly path: string
	readonly plan: Plan | undefined
}

export type Plan = { readonly read: Nested; readonly shape: Shape }

/** Without `select`, scalar fields return and relations do not (D-20). */
function scalars(model: ModelInfo): string[] {
	return [
		...systemFields,
		...[...model.fields.values()]
			.filter((field) => field.kind === 'scalar')
			.map((field) => field.name),
	]
}

export function integer(value: unknown, path: string, least?: number): number {
	if (
		typeof value !== 'number' ||
		!Number.isSafeInteger(value) ||
		(least !== undefined && value < least)
	) {
		const range = least === undefined ? '' : ` of at least ${least}`
		throw new InvalidQuery(path, `${path} must be an integer${range}.`)
	}
	return value
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

/** A virtual's `true` or its input, with a model's `select`, `include`, `omit`. */
function virtualRead(
	models: Models,
	info: VirtualInfo,
	value: unknown,
	path: string,
	scope: Scope | undefined,
): VirtualRead {
	const { output } = info
	const target = output.kind === 'model' ? output.name : undefined
	const shaping: { [key: string]: unknown } = {}
	const input: { [key: string]: unknown } = {}
	for (const [key, given] of value === true ? [] : entries(value, path)) {
		if (target !== undefined && oneKeys.has(key)) shaping[key] = given
		else if (info.input === undefined) {
			throw unknownKey(`${path}.${key}`, info.model)
		} else input[key] = given
	}
	const nested =
		target === undefined
			? undefined
			: plan(
					models,
					modelOf(models, target),
					shaping,
					path,
					'one',
					oneKeys,
					scope,
				)
	return { info, input, path, plan: nested }
}

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
	if (select !== undefined && given.has('omit')) {
		throw new InvalidQuery(
			path,
			`${at('select')} and omit cannot be used together.`,
		)
	}
	const read: {
		-readonly [K in keyof Nested]: Nested[K]
	} = {}
	const fields: string[] = select === undefined ? scalars(model) : []
	const relations = new Map<string, Shape>()
	const virtuals = new Map<string, VirtualRead>()
	for (const info of select === undefined ? model.virtuals.values() : []) {
		if (info.default)
			virtuals.set(info.name, virtualRead(models, info, true, '', scope))
	}
	const nested: { [field: string]: Nested } = {}
	const oneOfs = new Map<string, ReadonlySet<string>>()
	const related = (name: string, value: unknown, where: string): void => {
		const field = model.fields.get(name)
		if (field === undefined || field.kind === 'scalar') return
		const relation = plan(
			models,
			modelOf(models, field.target),
			value,
			where,
			field.kind,
			field.kind === 'many' ? manyKeys : oneKeys,
			scope,
		)
		nested[name] = restrict(relation.read, scope?.related(model, field))
		relations.set(name, relation.shape)
	}
	let count = new Map<string, Filter>()
	const chosen = select ?? include
	if (chosen !== undefined) {
		const base = select === undefined ? 'include' : 'select'
		for (const [name, value] of entries(chosen, at(base))) {
			const where = `${at(base)}.${name}`
			if (name === '_count') {
				if (value === false) continue
				count = counted(models, model, value, where, scope)
				continue
			}
			const virtual = model.virtuals.get(name)
			if (virtual !== undefined) {
				if (value === false) virtuals.delete(name)
				else
					virtuals.set(name, virtualRead(models, virtual, value, where, scope))
				continue
			}
			const oneOf = model.oneOfs.get(name)
			if (oneOf !== undefined) {
				if (value === false) continue
				const kinds = oneOfArgs(model.name, oneOf, value, where)
				for (const [hidden, each] of kinds.args) {
					related(hidden, each.args, each.at)
				}
				oneOfs.set(name, kinds.shown)
				continue
			}
			const field = model.fields.get(name)
			const scalar =
				field === undefined
					? systemFields.includes(name)
					: field.kind === 'scalar'
			// A oneOf's hidden keys are no field of the caller's (D-247).
			const hidden = field?.kind === 'one' && field.of !== undefined
			if (
				(field === undefined && !scalar) ||
				hidden ||
				(base === 'include' && scalar)
			) {
				throw unknownKey(where, model.name)
			}
			if (value === false) continue
			// An exists reads one row's id, whether one is there (D-246).
			const exists = field?.kind === 'many' && field.exists === true
			if (scalar || exists) {
				if (value !== true) {
					throw new InvalidQuery(where, `${where} must be a boolean.`)
				}
			}
			if (scalar) {
				fields.push(name)
				continue
			}
			related(
				name,
				exists
					? { take: 1, select: { id: true } }
					: value === true
						? undefined
						: value,
				where,
			)
		}
	}
	if (Object.keys(nested).length > 0) read.include = nested
	if (count.size > 0) read.count = Object.fromEntries(count)
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
		// `_relevance` ranks by the `_search` at the top of `where` (D-148).
		const search: unknown = read.where?.['_search']
		read.orderBy = orderBy(
			models,
			model,
			given.get('orderBy') ?? [],
			at('orderBy'),
			scope,
			isObject(search) && typeof search['search'] === 'string'
				? search['search']
				: undefined,
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
	const hidden = omitted(model, given.get('omit'), at('omit'))
	const shown = fields.filter((name) => !hidden.has(name))
	for (const name of hidden) virtuals.delete(name)
	const needs = [...virtuals.values()].flatMap(({ info }) => info.needs)
	// A field read rule may read any field of the row (D-136).
	const names = [
		...shown,
		...relations.keys(),
		...oneOfs.keys(),
		...count.keys(),
		...virtuals.keys(),
	]
	if (!names.some((name) => scope?.ruled(model, name) === true)) {
		read.fields = [...new Set(['id', ...shown, ...needs])]
	}
	const counts = [...count.keys()]
	return {
		read,
		shape: {
			model,
			fields: shown,
			relations,
			counts,
			virtuals,
			oneOfs,
		},
	}
}

/** The scalar and system fields `omit` leaves out of the rows (D-135). */
function omitted(model: ModelInfo, omit: unknown, path: string): Set<string> {
	const names = new Set<string>()
	if (omit === undefined) return names
	for (const [name, value] of entries(omit, path)) {
		const where = `${path}.${name}`
		const field = model.fields.get(name)
		const scalar =
			field === undefined
				? systemFields.includes(name) || model.virtuals.get(name)?.default
				: field.kind === 'scalar'
		if (scalar !== true) throw unknownKey(where, model.name)
		if (typeof value !== 'boolean') {
			throw new InvalidQuery(where, `${where} must be a boolean.`)
		}
		if (value) names.add(name)
	}
	return names
}

/** The keys that shape a read's rows. */
export const oneKeys: ReadonlySet<string> = new Set([
	'select',
	'include',
	'omit',
])
const manyKeys = new Set([
	...oneKeys,
	'where',
	'orderBy',
	'take',
	'skip',
	'cursor',
])
