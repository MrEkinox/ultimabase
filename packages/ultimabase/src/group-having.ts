// `groupBy`'s `having` (D-149), as Prisma's: a field of `by` filters the
// groups by its value, any field by its aggregates, which the result need
// not ask for. The adapter's filter names each value by its position in the
// group's values, as `orderBy` does.
import type { Condition, Filter } from './adapter.ts'
import type { Asked, Key } from './aggregate.ts'
import { checked, keys, typeOf } from './aggregate.ts'
import { decimalPattern, normalized } from './decimal.ts'
import { InvalidQuery } from './errors.ts'
import type { Context } from './query-context.ts'
import type { Operand } from './query-where.ts'
import { entries, fieldCondition, isObject } from './query-where.ts'

/** An aggregate's position in the group's values, added if not asked. */
export type Position = (asked: Asked) => number

const decimal = new RegExp(decimalPattern)

const whole: Operand = {
	type: 'number',
	check: (item, at) => {
		if (!Number.isSafeInteger(item)) {
			throw new InvalidQuery(at, `${at} must be a whole number.`)
		}
		return item
	},
}

const finite: Operand = {
	type: 'number',
	check: (item, at) => {
		if (typeof item !== 'number' || !Number.isFinite(item)) {
			throw new InvalidQuery(at, `${at} must be a finite number.`)
		}
		return item
	},
}

/** A decimal's sum, exact at its field's scale, of any precision (D-145). */
const sum = (scale: number): Operand => ({
	type: 'decimal',
	check: (item, at) => {
		if (typeof item !== 'string' || !decimal.test(item)) {
			throw new InvalidQuery(
				at,
				`${at} must be a decimal string, such as '12.50'.`,
			)
		}
		return normalized(item, scale)
	},
})

/**
 * The operands of aggregate `key` of a field: a count's a whole number, a
 * sum's and an average's a number, a decimal's sum a decimal string, a
 * minimum's and a maximum's the field's own.
 */
function operandOf(
	context: Context,
	key: Key,
	name: string,
): Operand | undefined {
	if (key === '_count') return whole
	if (key === '_min' || key === '_max') return undefined
	const field = context.model.fields.get(name)
	return key === '_sum' && field?.kind === 'scalar' && field.type === 'decimal'
		? sum(field.scale ?? 0)
		: finite
}

type Parts = { [key: string]: Condition | Filter[] }

/** The conditions of field `name`'s value and aggregates, by position. */
function conditions(
	context: Context,
	name: string,
	part: unknown,
	at: string,
	by: readonly string[],
	position: Position,
): Parts {
	const { model, scope } = context
	typeOf(model, name, at, 'used in having')
	const found: Parts = {}
	const own: [string, unknown][] = []
	const listed = isObject(part) ? entries(part, at) : []
	for (const [key, operand] of listed) {
		const aggregate = keys.find((each): each is Key => each === key)
		if (aggregate === undefined) {
			own.push([key, operand])
			continue
		}
		const where = `${at}.${key}`
		const asked = checked(context, aggregate, name, where)
		const of = operandOf(context, aggregate, name)
		const condition = fieldCondition(model, name, operand, where, of)
		if (condition !== undefined) found[String(position(asked))] = condition
	}
	if (isObject(part) && own.length === 0) return found
	if (!by.includes(name)) {
		throw new InvalidQuery(
			at,
			`${at} is not a field of by: only its aggregates filter the groups.`,
		)
	}
	scope.check(model, name, at, 'filters')
	const value = isObject(part) ? Object.fromEntries(own) : part
	const condition = fieldCondition(model, name, value, at)
	if (condition !== undefined) found[String(by.indexOf(name))] = condition
	return found
}

/** The `having` of the groups by `by`, normalized; `path` names it in errors. */
export function having(
	context: Context,
	value: unknown,
	by: readonly string[],
	position: Position,
	path = 'having',
): Filter {
	const filter: Parts = {}
	for (const [name, part] of entries(value, path)) {
		const at = `${path}.${name}`
		if (name !== 'AND' && name !== 'OR' && name !== 'NOT') {
			Object.assign(filter, conditions(context, name, part, at, by, position))
			continue
		}
		if (!Array.isArray(part) && name === 'OR') {
			throw new InvalidQuery(at, `${at} must be a list.`)
		}
		const list: readonly unknown[] = Array.isArray(part) ? part : [part]
		filter[name] = list.map((item, index) =>
			having(
				context,
				item,
				by,
				position,
				Array.isArray(part) ? `${at}.${index}` : at,
			),
		)
	}
	return filter
}
