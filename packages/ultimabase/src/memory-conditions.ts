// How `memory()` tests a condition, with SQL's three-valued logic: `null` is
// unknown, as PostgreSQL compares it (D-94).
import type { Condition, Filter } from './adapter.ts'
import { jsonPath } from './memory-json.ts'
import { compareValues, lower, same, text } from './memory-values.ts'

export type Truth = boolean | null

export function and(truths: readonly Truth[]): Truth {
	if (truths.includes(false)) return false
	return truths.includes(null) ? null : true
}

export function or(truths: readonly Truth[]): Truth {
	if (truths.includes(true)) return true
	return truths.includes(null) ? null : false
}

export function not(truth: Truth): Truth {
	return truth === null ? null : !truth
}

export function isFilters(
	value: Condition | readonly Filter[],
): value is readonly Filter[] {
	return Array.isArray(value)
}

export function scalar(
	stored: unknown,
	condition: Condition,
	sorted: (value: unknown) => unknown,
): Truth {
	if (condition.path !== undefined) return jsonPath(stored, condition)
	const truths: Truth[] = []
	const known = stored !== null
	const fold =
		condition.mode === 'insensitive' ? lower : (item: unknown) => item
	const value = fold(stored)
	for (const [operator, raw] of Object.entries(condition)) {
		if (raw === undefined || operator === 'mode') continue
		const operand: unknown = Array.isArray(raw)
			? raw.map((item: unknown) => fold(item))
			: fold(raw)
		if (operator === 'equals' || operator === 'not') {
			const equal =
				operand === null ? !known : known ? same(value, operand) : null
			truths.push(operator === 'equals' ? equal : not(equal))
		} else if (operator === 'in' || operator === 'notIn') {
			const list: readonly unknown[] = Array.isArray(operand) ? operand : []
			const found =
				list.length === 0
					? false
					: known
						? list.some((item) => same(value, item))
						: null
			truths.push(operator === 'in' ? found : not(found))
		} else if (!known) {
			truths.push(null)
		} else if (operator.startsWith('has') || operator === 'isEmpty') {
			const items: readonly unknown[] = Array.isArray(value) ? value : []
			const wanted: readonly unknown[] = Array.isArray(operand)
				? operand
				: [operand]
			const holds = (item: unknown): boolean => items.includes(item)
			truths.push(
				operator === 'isEmpty'
					? (items.length === 0) === operand
					: operator === 'hasEvery'
						? wanted.every(holds)
						: wanted.some(holds),
			)
		} else if (operator === 'contains') {
			truths.push(text(value, operand, (a, b) => a.includes(b)))
		} else if (operator === 'startsWith') {
			truths.push(text(value, operand, (a, b) => a.startsWith(b)))
		} else if (operator === 'endsWith') {
			truths.push(text(value, operand, (a, b) => a.endsWith(b)))
		} else {
			const order = compareValues(sorted(value), sorted(operand))
			if (operator === 'lt') truths.push(order < 0)
			else if (operator === 'lte') truths.push(order <= 0)
			else if (operator === 'gt') truths.push(order > 0)
			else truths.push(order >= 0)
		}
	}
	return and(truths)
}
