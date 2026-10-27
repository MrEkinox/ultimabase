// How `memory()` compares and copies values, as PostgreSQL would (D-94).
import type { Order } from './adapter.ts'
import { isObject } from './query-where.ts'

/** Equality as PostgreSQL's: `-0` is `0`, json keys come in any order. */
export function same(a: unknown, b: unknown): boolean {
	if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
	if (Array.isArray(a) && Array.isArray(b))
		return (
			a.length === b.length && a.every((item, index) => same(item, b[index]))
		)
	if (isObject(a) && isObject(b)) {
		const keys = Object.keys(a)
		return (
			keys.length === Object.keys(b).length &&
			keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]))
		)
	}
	return a === b
}

/** A surrogate sorts above U+FFFF, as the code point it is part of. */
const weight = (unit: number): number => {
	if (unit >= 0xd8_00 && unit <= 0xdf_ff) return unit + 0x20_00
	return unit >= 0xe0_00 ? unit - 0x8_00 : unit
}

/**
 * Strings compare by code point, as PostgreSQL's `C` collation (D-94);
 * dates, numbers and booleans by their number. Json values are not sorted.
 */
export function compareValues(a: unknown, b: unknown): number {
	if (typeof a === 'string' && typeof b === 'string') {
		for (let index = 0; index < Math.min(a.length, b.length); index++) {
			const order = weight(a.charCodeAt(index)) - weight(b.charCodeAt(index))
			if (order !== 0) return order
		}
		return a.length - b.length
	}
	return Number(a) - Number(b)
}

/** `null` sorts last ascending and first descending, as in PostgreSQL. */
export function compareKeys(
	a: readonly unknown[],
	b: readonly unknown[],
	order: readonly Order[],
): number {
	for (const [at, { direction }] of order.entries()) {
		const left = a[at] ?? null
		const right = b[at] ?? null
		let result = 0
		if (left === null || right === null) {
			result = left === right ? 0 : left === null ? 1 : -1
		} else {
			result = compareValues(left, right)
		}
		if (result !== 0) return direction === 'asc' ? result : -result
	}
	return 0
}

/** A stored value the caller may change without changing the store. */
export function copy(value: unknown): unknown {
	if (value instanceof Date) return new Date(value.getTime())
	return typeof value === 'object' && value !== null
		? structuredClone(value)
		: value
}
