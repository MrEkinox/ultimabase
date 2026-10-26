// Values as GraphQL's JSON (D-129): a date is ISO 8601 text, read back to a
// `Date` from its field's type, in filters and in data, as `DateTime` is.
import type { SchemaField } from 'ultimabase'
import { InvalidQuery } from 'ultimabase'
import type { Api, Args } from './entries.ts'
import { entryOf } from './entries.ts'

const iso =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

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
	(field?.kind === 'scalar' && field.type === 'date')

/** A date field's filter: a value, or operators whose values are dates. */
function dateFilter(value: unknown, path: string): unknown {
	if (!isArgs(value)) return date(value, path)
	const filter: { [operator: string]: unknown } = {}
	for (const [operator, operand] of Object.entries(value)) {
		const at = `${path}.${operator}`
		filter[operator] = Array.isArray(operand)
			? operand.map((item: unknown, index) => date(item, `${at}.${index}`))
			: date(operand, at)
	}
	return filter
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

/** A filter with its dates read, through `AND`, `OR`, `NOT` and relations. */
export function whereOf(
	api: Api,
	model: string,
	where: Args,
	path: string,
): Args {
	const fields = entryOf(api, model).model.fields
	const read: { [key: string]: unknown } = {}
	for (const [key, value] of Object.entries(where)) {
		const at = `${path}.${key}`
		const field = fields.find((candidate) => candidate.name === key)
		if (key === 'AND' || key === 'OR' || key === 'NOT') {
			read[key] = each(value, at, (inner, to) => whereOf(api, model, inner, to))
		} else if (isDate(field, key)) read[key] = dateFilter(value, at)
		else if (field !== undefined && field.kind !== 'scalar' && isArgs(value)) {
			// `is`, `some` and the others each take the target's filter.
			const { target } = field
			read[key] = Object.fromEntries(
				Object.entries(value).map(([operator, inner]) => [
					operator,
					isArgs(inner)
						? whereOf(api, target, inner, `${at}.${operator}`)
						: inner,
				]),
			)
		} else read[key] = value
	}
	return read
}

/**
 * Data with its dates read, in the rows it creates too (D-128). A hidden
 * model is connected, never created, as over GraphQL.
 */
export function dataOf(
	api: Api,
	model: string,
	data: Args,
	path: string,
): Args {
	const read: { [field: string]: unknown } = { ...data }
	for (const field of entryOf(api, model).model.fields) {
		const value = data[field.name]
		const at = `${path}.${field.name}`
		if (field.kind === 'scalar') {
			if (field.type === 'date' && value !== undefined) {
				read[field.name] = date(value, at)
			}
			continue
		}
		if (!isArgs(value) || !Object.hasOwn(value, 'create')) continue
		const target = entryOf(api, field.target)
		if (!target.visible) {
			throw new InvalidQuery(
				`${at}.create`,
				`Unknown key '${at}.create' on ${model}.`,
			)
		}
		const create = each(value['create'], `${at}.create`, (row, to) =>
			dataOf(api, field.target, row, to),
		)
		read[field.name] = { ...value, create }
	}
	return read
}
