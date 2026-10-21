// A caller's `where`, checked and normalized for the adapter (D-20, D-73):
// shorthands become `{ equals }`, `undefined` goes (D-84), and an unknown
// key fails with its path.
import type { Condition, Filter, ScalarType } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'

export type Models = ReadonlyMap<string, ModelInfo>

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

export function unknownKey(path: string, model: string): InvalidQuery {
	return new InvalidQuery(path, `Unknown key '${path}' on ${model}.`)
}

function typeOf(model: ModelInfo, name: string): ScalarType | 'id' | undefined {
	const field = model.fields.get(name)
	return field?.kind === 'scalar' ? field.type : system.get(name)
}

const fits: {
	readonly [T in ScalarType | 'id']: (
		value: unknown,
		field: FieldInfo | undefined,
	) => boolean
} = {
	id: (value) => typeof value === 'string',
	string: (value) => typeof value === 'string',
	enum: (value, field) =>
		typeof value === 'string' &&
		field?.kind === 'scalar' &&
		(field.values ?? []).includes(value),
	number: (value) => typeof value === 'number' && Number.isFinite(value),
	boolean: (value) => typeof value === 'boolean',
	date: (value) => value instanceof Date && !Number.isNaN(value.getTime()),
	json: () => true,
}

const base = new Set(['equals', 'not', 'in', 'notIn'])
const ordered = new Set(['lt', 'lte', 'gt', 'gte'])
const text = new Set(['contains', 'startsWith', 'endsWith'])

function operators(type: ScalarType | 'id'): ReadonlySet<string> {
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
	type: ScalarType | 'id',
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
			if (typeof operand !== 'string') {
				throw new InvalidQuery(at, `${at} must be a string.`)
			}
			condition[operator] = operand
		} else {
			condition[operator] = check(operand, at, base.has(operator))
		}
	}
	return Object.keys(condition).length === 0 ? undefined : condition
}

function relationCondition(
	models: Models,
	model: ModelInfo,
	field: Extract<FieldInfo, { readonly kind: 'one' | 'many' }>,
	value: unknown,
	path: string,
): Condition | undefined {
	const target = models.get(field.target)
	if (target === undefined) throw new Error(`Unknown model ${field.target}.`)
	const allowed =
		field.kind === 'one' ? ['is', 'isNot'] : ['some', 'every', 'none']
	const condition: { [operator: string]: Filter | null } = {}
	for (const [operator, operand] of entries(value, path)) {
		const at = `${path}.${operator}`
		if (!allowed.includes(operator)) throw unknownKey(at, model.name)
		condition[operator] =
			operand === null && field.kind === 'one'
				? null
				: normalizeWhere(models, target, operand, at)
	}
	return Object.keys(condition).length === 0 ? undefined : condition
}

function list(
	models: Models,
	model: ModelInfo,
	value: unknown,
	path: string,
	single: boolean,
): Filter[] {
	if (Array.isArray(value)) {
		return value.map((item: unknown, index) =>
			normalizeWhere(models, model, item, `${path}.${index}`),
		)
	}
	if (single) return [normalizeWhere(models, model, value, path)]
	throw new InvalidQuery(path, `${path} must be a list.`)
}

/** A `where` of `model`, normalized; `path` names it in errors. */
export function normalizeWhere(
	models: Models,
	model: ModelInfo,
	where: unknown,
	path: string,
): Filter {
	const filter: { [key: string]: Condition | Filter[] } = {}
	for (const [key, value] of entries(where, path)) {
		const at = `${path}.${key}`
		if (key === 'AND' || key === 'NOT') {
			filter[key] = list(models, model, value, at, true)
			continue
		}
		if (key === 'OR') {
			filter[key] = list(models, model, value, at, false)
			continue
		}
		const field = model.fields.get(key)
		const type = typeOf(model, key)
		const condition =
			field !== undefined && field.kind !== 'scalar'
				? relationCondition(models, model, field, value, at)
				: type === undefined
					? undefined
					: scalarCondition(model, key, type, value, at)
		if (field === undefined && type === undefined) {
			throw unknownKey(at, model.name)
		}
		if (condition !== undefined) filter[key] = condition
	}
	return filter
}
