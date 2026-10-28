// A json field's path filter (D-149), Prisma's PostgreSQL JSON filter in
// camelCase: `{ meta: { path: ['author', 'name'], equals: 'Ada' } }`.
import type { Condition } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import {
	clean,
	cleanText,
	entries,
	isJson,
	isObject,
	unknownKey,
} from './query-values.ts'

const json = (operand: unknown, at: string): unknown => {
	if (isJson(operand)) return operand
	throw new InvalidQuery(at, `${at} must be a JSON value.`)
}

const operands: {
	readonly [operator: string]: (operand: unknown, at: string) => unknown
} = {
	equals: json,
	not: json,
	...Object.fromEntries(
		['lt', 'lte', 'gt', 'gte'].map((operator) => [
			operator,
			(operand: unknown, at: string) => {
				if (typeof operand === 'string' && clean(operand)) return operand
				if (typeof operand === 'number' && Number.isFinite(operand)) {
					return operand
				}
				throw new InvalidQuery(at, `${at} must be a number or a string.`)
			},
		]),
	),
	...Object.fromEntries(
		['stringContains', 'stringStartsWith', 'stringEndsWith'].map((operator) => [
			operator,
			cleanText,
		]),
	),
	mode: (operand, at) => {
		if (operand === 'insensitive') return operand
		throw new InvalidQuery(at, `${at} must be 'insensitive'.`)
	},
	// A value is a list of one, as in Prisma.
	arrayContains: (operand, at) => {
		const value = json(operand, at)
		if (!Array.isArray(value)) return [value]
		const items: readonly unknown[] = value
		return items
	},
	arrayStartsWith: json,
	arrayEndsWith: json,
}

/** Whether a json field's filter is a path filter, which names `path`. */
export const isPathFilter = (value: unknown): boolean =>
	isObject(value) && value['path'] !== undefined

/**
 * A path filter of `model`'s json field, `undefined` when it has no operator,
 * as `mode` alone (D-140).
 */
export function jsonCondition(
	model: string,
	value: unknown,
	path: string,
): Condition | undefined {
	const condition: { [operator: string]: unknown } = {}
	for (const [operator, operand] of entries(value, path)) {
		const at = `${path}.${operator}`
		if (operator === 'path') {
			if (!Array.isArray(operand)) {
				throw new InvalidQuery(at, `${at} must be a list of keys.`)
			}
			condition['path'] = operand.map((key: unknown, index) =>
				cleanText(key, `${at}.${index}`),
			)
			continue
		}
		const check = operands[operator]
		if (check === undefined) throw unknownKey(at, model)
		condition[operator] = check(operand, at)
	}
	const tested = Object.keys(condition).filter(
		(operator) => operator !== 'path' && operator !== 'mode',
	)
	return tested.length === 0 ? undefined : condition
}
