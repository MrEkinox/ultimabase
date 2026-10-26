// A caller's `where`, checked and normalized for the adapter (D-20, D-73):
// shorthands become `{ equals }`, `undefined` goes (D-84), and an unknown
// key fails with its path.
import type { Condition, Filter, ScalarType } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'

export type Models = ReadonlyMap<string, ModelInfo>

/** What a caller other than Master may filter on and see (D-86). */
export type Scope = {
	/** Fails on a field with a read rule (D-44). */
	readonly check: (
		model: ModelInfo,
		field: string,
		path: string,
		verb: 'filters' | 'sorts',
	) => void
	/** A model's read filter; `undefined` when every row passes. */
	readonly readable: (model: string) => Filter | undefined
}

/** `id`, `createdAt` and `updatedAt`, which every model has (D-22). */
const system: ReadonlyMap<string, ScalarType | 'id'> = new Map([
	['id', 'id'],
	['createdAt', 'date'],
	['updatedAt', 'date'],
])

export function isObject(
	value: unknown,
): value is { readonly [key: string]: unknown } {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		!(value instanceof Date)
	)
}

/** The entries of an argument object, without `undefined` (D-84). */
export function entries(value: unknown, path: string): [string, unknown][] {
	if (!isObject(value))
		throw new InvalidQuery(path, `${path} must be an object.`)
	return Object.entries(value).filter(([, item]) => item !== undefined)
}

/** A string PostgreSQL stores as written: no NUL, no lone surrogate (D-94). */
export const clean = (value: string): boolean =>
	value.isWellFormed() && !value.includes('\0')

/** An element of a list: a clean, non-empty string (D-120). */
export const listItem = (value: unknown): value is string =>
	typeof value === 'string' && value !== '' && clean(value)

/** A date of years 1 to 9999 in UTC, which PostgreSQL reads back (D-94). */
export const storedDate = (value: unknown): value is Date => {
	const year = value instanceof Date ? value.getUTCFullYear() : Number.NaN
	return year >= 1 && year <= 9999
}

/** JSON data whose strings and keys are clean (D-94). */
export function isJson(value: unknown): boolean {
	if (value === null || typeof value === 'boolean') return true
	if (typeof value === 'string') return clean(value)
	if (typeof value === 'number') return Number.isFinite(value)
	if (Array.isArray(value)) return value.every(isJson)
	if (!isObject(value) || Object.getPrototypeOf(value) !== Object.prototype) {
		return false
	}
	return Object.entries(value).every(
		([key, item]) => clean(key) && isJson(item),
	)
}

export function unknownKey(path: string, model: string): InvalidQuery {
	return new InvalidQuery(path, `Unknown key '${path}' on ${model}.`)
}

type Single = Exclude<ScalarType, 'stringList'> | 'id'

function typeOf(model: ModelInfo, name: string): ScalarType | 'id' | undefined {
	const field = model.fields.get(name)
	return field?.kind === 'scalar' ? field.type : system.get(name)
}

const fits: {
	readonly [T in Single]: (
		value: unknown,
		field: FieldInfo | undefined,
	) => boolean
} = {
	id: (value) => typeof value === 'string' && clean(value),
	string: (value) => typeof value === 'string' && clean(value),
	enum: (value, field) =>
		typeof value === 'string' &&
		field?.kind === 'scalar' &&
		(field.values ?? []).includes(value),
	number: (value) => typeof value === 'number' && Number.isFinite(value),
	boolean: (value) => typeof value === 'boolean',
	date: storedDate,
	json: isJson,
}

const base = new Set(['equals', 'not', 'in', 'notIn'])
const ordered = new Set(['lt', 'lte', 'gt', 'gte'])
const text = new Set(['contains', 'startsWith', 'endsWith'])

function operators(type: Single): ReadonlySet<string> {
	if (type === 'number' || type === 'date')
		return new Set([...base, ...ordered])
	if (type === 'string' || type === 'id' || type === 'enum') {
		return new Set([...base, ...text])
	}
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
		if (!fits[type](item, field)) {
			throw new InvalidQuery(at, `${at} does not fit ${model.name}.${name}.`)
		}
		return item
	}
	// A primitive, a `Date` or a list is `equals`; an object is a filter, on
	// `json` too, which compares whole values with `equals` as in Prisma.
	if (value === null || !isObject(value)) {
		return { equals: check(value, path, true) }
	}
	const allowed = operators(type)
	const condition: { [operator: string]: unknown } = {}
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
		} else if (text.has(operator)) {
			if (typeof operand !== 'string' || !clean(operand)) {
				throw new InvalidQuery(at, `${at} must be a clean string.`)
			}
			condition[operator] = operand
		} else {
			condition[operator] = check(operand, at, base.has(operator))
		}
	}
	return Object.keys(condition).length === 0 ? undefined : condition
}

/** An element a list filter names (D-120). */
function element(value: unknown, at: string): string {
	if (!listItem(value)) {
		throw new InvalidQuery(at, `${at} must be a non-empty clean string.`)
	}
	return value
}

/** A list's `has` and `hasSome`; it has no shorthand (D-120). */
function listCondition(
	model: ModelInfo,
	value: unknown,
	path: string,
): Condition | undefined {
	const condition: { has?: string; hasSome?: readonly string[] } = {}
	for (const [operator, operand] of entries(value, path)) {
		const at = `${path}.${operator}`
		if (operator === 'has') condition.has = element(operand, at)
		else if (operator !== 'hasSome') throw unknownKey(at, model.name)
		else if (!Array.isArray(operand)) {
			throw new InvalidQuery(at, `${at} must be a list.`)
		} else {
			condition.hasSome = operand.map((each: unknown, index) =>
				element(each, `${at}.${index}`),
			)
		}
	}
	return Object.keys(condition).length === 0 ? undefined : condition
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
	const target = models.get(field.target)
	if (target === undefined) throw new Error(`Unknown model ${field.target}.`)
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
): Filter[] {
	if (Array.isArray(value)) {
		return value.map((item: unknown, index) =>
			normalizeWhere(models, model, item, `${path}.${index}`, scope),
		)
	}
	if (single) return [normalizeWhere(models, model, value, path, scope)]
	throw new InvalidQuery(path, `${path} must be a list.`)
}

/**
 * A `where` of `model`, normalized; `path` names it in errors. With a
 * `scope`, relation filters see readable rows only (D-86).
 */
export function normalizeWhere(
	models: Models,
	model: ModelInfo,
	where: unknown,
	path: string,
	scope?: Scope,
): Filter {
	const filter: { [key: string]: Condition | Filter[] } = {}
	const relations: Filter[] = []
	for (const [key, value] of entries(where, path)) {
		const at = `${path}.${key}`
		if (key === 'AND' || key === 'NOT' || key === 'OR') {
			filter[key] = list(models, model, value, at, key !== 'OR', scope)
			continue
		}
		const field = model.fields.get(key)
		const type = typeOf(model, key)
		if (field === undefined && type === undefined) {
			throw unknownKey(at, model.name)
		}
		scope?.check(model, key, at, 'filters')
		if (field !== undefined && field.kind !== 'scalar') {
			relations.push(...relationFilters(models, model, field, value, at, scope))
			continue
		}
		const condition =
			type === undefined
				? undefined
				: type === 'stringList'
					? listCondition(model, value, at)
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
