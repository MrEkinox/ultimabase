import type {
	DatabaseLogicalRecord,
	QueryExpressionNode,
	QueryOrderNode,
} from '@ultimabase/core'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

// Evaluates the portable filter AST over plain rows for MemoryTestDatabase.

const unsupported = (feature: string): TypeError =>
	new TypeError(`MemoryTestDatabase does not support ${feature}`)

/** Compares logical values by content: dates and ISO strings meet in JSON. */
const sameValue = (left: unknown, right: unknown): boolean =>
	Object.is(left, right) ||
	(typeof left === 'object' &&
		left !== null &&
		typeof right === 'object' &&
		right !== null &&
		JSON.stringify(left) === JSON.stringify(right)) ||
	(left instanceof Date && JSON.stringify(left) === JSON.stringify(right)) ||
	(right instanceof Date && JSON.stringify(left) === JSON.stringify(right))

const comparable = (value: unknown): bigint | number | string => {
	if (value instanceof Date) return value.toISOString()
	if (
		typeof value === 'bigint' ||
		typeof value === 'number' ||
		typeof value === 'string'
	) {
		return value
	}
	throw unsupported(`ordering ${typeof value} values`)
}

/** Orders two present values; `null` and missing values sort first. */
const compare = (left: unknown, right: unknown): number => {
	if (left === undefined || left === null) {
		return right === undefined || right === null ? 0 : -1
	}
	if (right === undefined || right === null) return 1
	const a = comparable(left)
	const b = comparable(right)
	return a < b ? -1 : a > b ? 1 : 0
}

const listOf = (value: unknown): readonly unknown[] =>
	isUnknownArray(value) ? value : []

const matchesLeaf = (
	node: Readonly<Record<string, unknown>>,
	row: DatabaseLogicalRecord,
): boolean => {
	if (node.path !== undefined) throw unsupported('nested filter paths')
	if (typeof node.field !== 'string') {
		throw unsupported(`filter ${String(node.kind)}`)
	}
	const value = row[node.field]
	const operand = node.value
	switch (node.kind) {
		case 'equal':
			return sameValue(value ?? null, operand)
		case 'not-equal':
			return !sameValue(value ?? null, operand)
		case 'in':
			return listOf(node.values).some((item) => sameValue(value, item))
		case 'not-in':
			return !listOf(node.values).some((item) => sameValue(value, item))
		case 'null':
			return (value === undefined || value === null) === node.isNull
		case 'greater-than':
			return value != null && compare(value, operand) > 0
		case 'greater-than-or-equal':
			return value != null && compare(value, operand) >= 0
		case 'less-than':
			return value != null && compare(value, operand) < 0
		case 'less-than-or-equal':
			return value != null && compare(value, operand) <= 0
		case 'between':
		case 'not-between': {
			const inside =
				value != null &&
				compare(value, node.lower) >= 0 &&
				compare(value, node.upper) <= 0
			return node.kind === 'between' ? inside : value != null && !inside
		}
		case 'contains':
			if (typeof value !== 'string' || typeof operand !== 'string') {
				throw unsupported('structural containment')
			}
			return value.includes(operand)
		case 'starts-with':
			return typeof value === 'string' && value.startsWith(String(operand))
		case 'ends-with':
			return typeof value === 'string' && value.endsWith(String(operand))
		case 'list-has':
			return listOf(value).some((item) => sameValue(item, operand))
		case 'list-has-some':
			return listOf(node.values).some((wanted) =>
				listOf(value).some((item) => sameValue(item, wanted)),
			)
		case 'list-has-every':
			return listOf(node.values).every((wanted) =>
				listOf(value).some((item) => sameValue(item, wanted)),
			)
		case 'list-empty':
			return listOf(value).length === 0
		default:
			throw unsupported(`filter ${String(node.kind)}`)
	}
}

/** Evaluates one logical or scalar filter expression against one row. */
export const matchesMemoryFilter = (
	expression: QueryExpressionNode,
	row: DatabaseLogicalRecord,
): boolean => {
	if (!isPlainRecord(expression)) throw unsupported('non-plain filter nodes')
	const nested = (value: unknown): boolean => {
		if (!isPlainRecord(value) || typeof value.kind !== 'string') {
			throw unsupported('malformed filter nodes')
		}
		return matchesMemoryFilter({ ...value, kind: value.kind }, row)
	}
	switch (expression.kind) {
		case 'constant':
			return expression.value === true
		case 'and':
			return listOf(expression.expressions).every(nested)
		case 'or':
			return listOf(expression.expressions).some(nested)
		case 'not':
			return !nested(expression.expression)
		default:
			return matchesLeaf(expression, row)
	}
}

/** Sorts rows by successive order terms without mutating the input. */
export const sortMemoryRows = (
	rows: readonly DatabaseLogicalRecord[],
	orders: readonly QueryOrderNode[],
): readonly DatabaseLogicalRecord[] =>
	orders.length === 0
		? rows
		: [...rows].sort((left, right) => {
				for (const { direction, field } of orders) {
					const order = compare(left[field], right[field])
					if (order !== 0) return direction === 'ascending' ? order : -order
				}
				return 0
			})
