// How `memory()` tests a json value at a path (D-149), as PostgreSQL's
// `#>`, `@>` and jsonb comparisons do (D-94).
import type { Condition } from './adapter.ts'
import { compareValues, lower, same, text } from './memory-values.ts'
import { isObject } from './query-where.ts'

type Truth = boolean | null

/** An array's index as PostgreSQL's `strtoint` reads it; `undefined` when not one. */
function indexOf(key: string, length: number): number | undefined {
	if (!/^[\t\n\v\f\r ]*[+-]?\d+$/.test(key)) return undefined
	const index = Number(key)
	if (index < -2_147_483_647 || index > 2_147_483_647) return undefined
	return index < 0 ? length + index : index
}

/** The value at `path`, `undefined` where the value lacks it. */
function at(value: unknown, path: readonly string[]): unknown {
	let current = value
	for (const key of path) {
		if (Array.isArray(current)) {
			const index = indexOf(key, current.length)
			current = index === undefined || index < 0 ? undefined : current[index]
		} else if (isObject(current) && Object.hasOwn(current, key)) {
			current = current[key]
		} else return undefined
	}
	return current
}

/** `@>`: a nested value is held only by a value of its own JSON type. */
function holds(container: unknown, item: unknown): boolean {
	if (Array.isArray(container) && Array.isArray(item)) {
		return item.every((each) => container.some((one) => holds(one, each)))
	}
	if (isObject(container) && isObject(item)) {
		return Object.entries(item).every(
			([key, each]) =>
				Object.hasOwn(container, key) && holds(container[key], each),
		)
	}
	return (
		!Array.isArray(container) && !isObject(container) && same(container, item)
	)
}

const typeOf = (value: unknown): string =>
	Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value

/** A json condition with `path`: unknown where the value lacks the path. */
export function jsonPath(stored: unknown, condition: Condition): Truth {
	const value = stored === null ? undefined : at(stored, condition.path ?? [])
	if (value === undefined) return null
	const fold =
		condition.mode === 'insensitive' ? lower : (item: unknown) => item
	const strings = (test: (a: string, b: string) => boolean, operand: unknown) =>
		text(fold(value), fold(operand), test)
	const items: readonly unknown[] = Array.isArray(value) ? value : []
	const truths: boolean[] = []
	for (const [operator, operand] of Object.entries(condition)) {
		if (operand === undefined || operator === 'mode' || operator === 'path')
			continue
		if (operator === 'equals') truths.push(same(value, operand))
		else if (operator === 'not') truths.push(!same(value, operand))
		else if (operator === 'stringContains') {
			truths.push(strings((a, b) => a.includes(b), operand))
		} else if (operator === 'stringStartsWith') {
			truths.push(strings((a, b) => a.startsWith(b), operand))
		} else if (operator === 'stringEndsWith') {
			truths.push(strings((a, b) => a.endsWith(b), operand))
		} else if (operator === 'arrayContains') {
			truths.push(Array.isArray(value) && holds(value, operand))
		} else if (operator === 'arrayStartsWith') {
			truths.push(items.length > 0 && same(items[0], operand))
		} else if (operator === 'arrayEndsWith') {
			truths.push(items.length > 0 && same(items.at(-1), operand))
		} else {
			const order = compareValues(value, operand)
			const kept =
				operator === 'lt'
					? order < 0
					: operator === 'lte'
						? order <= 0
						: operator === 'gt'
							? order > 0
							: order >= 0
			truths.push(typeOf(value) === typeOf(operand) && kept)
		}
	}
	return !truths.includes(false)
}
