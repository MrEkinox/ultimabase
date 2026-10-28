// A caller's `where`, checked and normalized for the adapter (D-20, D-73):
// shorthands become `{ equals }`, `undefined` goes (D-84), and an unknown
// key fails with its path.
import type { Condition, Filter, ScalarType } from './adapter.ts'
import { storedValue } from './decimal.ts'
import { InvalidQuery } from './errors.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import { listCondition } from './query-conditions.ts'
import { searchedFields } from './query-search.ts'
import {
	clean,
	cleanText,
	entries,
	isObject,
	misfit,
	storedDate,
	unknownKey,
} from './query-values.ts'

export type { Scalar, ScalarCheck } from './query-values.ts'
export {
	clean,
	entries,
	integerRange,
	isInteger,
	isJson,
	isObject,
	misfit,
	storedDate,
	unknownKey,
} from './query-values.ts'

export type Models = ReadonlyMap<string, ModelInfo>

/** The model, or the table, of `name`; another name is a kernel bug. */
export function modelOf<T>(models: ReadonlyMap<string, T>, name: string): T {
	const model = models.get(name)
	if (model === undefined) throw new Error(`Unknown model ${name}.`)
	return model
}

export const byId = (id: string): Filter => ({ id: { equals: id } })
export const byIds = (ids: readonly string[]): Filter => ({ id: { in: ids } })

/** What a query does with a field: a read rule refuses each (D-44, D-143, D-147). */
export type Verb = 'filters' | 'sorts' | 'aggregates' | 'compares'

/** What a caller other than Master may filter on and see (D-86). */
export type Scope = {
	/** Fails on a field with a read rule (D-44). */
	readonly check: (
		model: ModelInfo,
		field: string,
		path: string,
		verb: Verb,
	) => void
	/** Whether the caller runs a field read rule on it (D-44). */
	readonly ruled: (model: ModelInfo, field: string) => boolean
	/** A model's read filter; `undefined` when every row passes. */
	readonly readable: (model: string) => Filter | undefined
}

/** `id`, `createdAt` and `updatedAt`, which every model has (D-22). */
const system: ReadonlyMap<string, ScalarType | 'id'> = new Map([
	['id', 'id'],
	['createdAt', 'date'],
	['updatedAt', 'date'],
])
export const systemFields: readonly string[] = [...system.keys()]

type Single = ScalarType | 'id'

function typeOf(model: ModelInfo, name: string): ScalarType | 'id' | undefined {
	const field = model.fields.get(name)
	return field?.kind === 'scalar' ? field.type : system.get(name)
}

/** Whether `value` fits a field, or a system field, which has no info (D-22). */
const fits = (type: Single, value: unknown, field: FieldInfo | undefined) =>
	field?.kind === 'scalar'
		? misfit(value, field) === undefined
		: type === 'date'
			? storedDate(value)
			: typeof value === 'string' && clean(value)

const base = new Set(['equals', 'not', 'in', 'notIn'])
const ordered = new Set(['lt', 'lte', 'gt', 'gte'])
const text = new Set(['contains', 'startsWith', 'endsWith'])

function operators(type: Single): ReadonlySet<string> {
	if (type === 'number' || type === 'decimal' || type === 'date')
		return new Set([...base, ...ordered])
	if (type === 'string') return new Set([...base, ...text, 'mode'])
	if (type === 'id' || type === 'enum') return new Set([...base, ...text])
	return base
}

function scalarCondition(
	model: ModelInfo,
	name: string,
	type: Single,
	value: unknown,
	path: string,
): Condition | undefined {
	const field = model.fields.get(name)
	const check = (item: unknown, at: string, nullable: boolean): unknown => {
		if (item === null && nullable) return null
		if (!fits(type, item, field)) {
			throw new InvalidQuery(at, `${at} does not fit ${model.name}.${name}.`)
		}
		return field?.kind === 'scalar' ? storedValue(item, field) : item
	}
	// A primitive, a `Date` or a list is `equals`; an object is a filter, on
	// `json` too, which compares whole values with `equals` as in Prisma.
	if (value === null || !isObject(value)) {
		return { equals: check(value, path, true) }
	}
	const allowed = operators(type)
	const condition: { [operator: string]: unknown } = {}
	let insensitive = false
	for (const [operator, operand] of entries(value, path)) {
		const at = `${path}.${operator}`
		if (!allowed.has(operator)) throw unknownKey(at, model.name)
		if (operator === 'in' || operator === 'notIn') {
			if (!Array.isArray(operand)) {
				throw new InvalidQuery(at, `${at} must be a list.`)
			}
			condition[operator] = operand.map((item: unknown, index) =>
				check(item, `${at}.${index}`, false),
			)
		} else if (operator === 'mode') {
			if (operand !== 'insensitive') {
				throw new InvalidQuery(at, `${at} must be 'insensitive'.`)
			}
			insensitive = true
		} else if (text.has(operator)) {
			condition[operator] = cleanText(operand, at)
		} else {
			condition[operator] = check(operand, at, base.has(operator))
		}
	}
	// `mode` alone filters nothing, as in Prisma (D-140).
	if (Object.keys(condition).length === 0) return undefined
	return insensitive ? { ...condition, mode: 'insensitive' } : condition
}

/**
 * A relation operator that sees readable targets only (D-86): an unreadable
 * row is absent, so `is: null` holds when the target is unreadable.
 */
function restricted(
	operator: string,
	inner: Filter | null,
	readable: Filter,
): Condition {
	if (inner === null) {
		return operator === 'is' ? { isNot: readable } : { is: readable }
	}
	if (operator === 'every') {
		return { every: { OR: [{ NOT: [readable] }, inner] } }
	}
	return { [operator]: { AND: [readable, inner] } }
}

function relationFilters(
	models: Models,
	model: ModelInfo,
	field: Extract<FieldInfo, { readonly kind: 'one' | 'many' }>,
	value: unknown,
	path: string,
	scope: Scope | undefined,
): Filter[] {
	const target = modelOf(models, field.target)
	const readable = scope?.readable(field.target)
	const allowed =
		field.kind === 'one' ? ['is', 'isNot'] : ['some', 'every', 'none']
	const filters: Filter[] = []
	for (const [operator, operand] of entries(value, path)) {
		const at = `${path}.${operator}`
		if (!allowed.includes(operator)) throw unknownKey(at, model.name)
		const inner =
			operand === null && field.kind === 'one'
				? null
				: normalizeWhere(models, target, operand, at, scope)
		filters.push({
			[field.name]:
				readable === undefined
					? { [operator]: inner }
					: restricted(operator, inner, readable),
		})
	}
	return filters
}

function list(
	models: Models,
	model: ModelInfo,
	value: unknown,
	path: string,
	single: boolean,
	scope: Scope | undefined,
	stored: boolean,
): Filter[] {
	if (Array.isArray(value)) {
		return value.map((item: unknown, index) =>
			normalizeWhere(models, model, item, `${path}.${index}`, scope, stored),
		)
	}
	if (single) return [normalizeWhere(models, model, value, path, scope, stored)]
	throw new InvalidQuery(path, `${path} must be a list.`)
}

/**
 * A `where` of `model`, normalized; `path` names it in errors. With a
 * `scope`, relation filters see readable rows only (D-86). Only a
 * `beforeFind`'s, `stored`, filters a plugin field, in its stored form
 * (D-122).
 */
export function normalizeWhere(
	models: Models,
	model: ModelInfo,
	where: unknown,
	path: string,
	scope?: Scope,
	stored = false,
): Filter {
	const filter: { [key: string]: Condition | Filter[] } = {}
	const relations: Filter[] = []
	for (const [key, value] of entries(where, path)) {
		const at = `${path}.${key}`
		if (key === 'AND' || key === 'NOT' || key === 'OR') {
			filter[key] = list(models, model, value, at, key !== 'OR', scope, stored)
			continue
		}
		if (key === '_search' && searchedFields(model.fields.values()).length > 0) {
			if (value !== undefined) filter[key] = { search: cleanText(value, at) }
			continue
		}
		const field = model.fields.get(key)
		const type = typeOf(model, key)
		if (field === undefined && type === undefined) {
			throw unknownKey(at, model.name)
		}
		const codec = field?.kind === 'scalar' ? field.codec : undefined
		if (codec !== undefined && !stored) {
			throw new InvalidQuery(
				at,
				`${at}: ${model.name}.${key} is a ${codec.plugin} field, which only a beforeFind filters.`,
			)
		}
		scope?.check(model, key, at, 'filters')
		if (field !== undefined && field.kind !== 'scalar') {
			relations.push(...relationFilters(models, model, field, value, at, scope))
			continue
		}
		const condition =
			type === undefined
				? undefined
				: field?.kind === 'scalar' && field.list
					? listCondition(model, field, value, at)
					: scalarCondition(model, key, type, value, at)
		if (condition !== undefined) filter[key] = condition
	}
	const [only, ...others] = relations
	if (only === undefined) return filter
	// One relation filter stays in place; more join `AND`.
	if (others.length === 0 && filter['AND'] === undefined) {
		return { ...filter, ...only }
	}
	const and = filter['AND']
	return {
		...filter,
		AND: [...(Array.isArray(and) ? and : []), ...relations],
	}
}
