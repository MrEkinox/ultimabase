// The values a query or a write may hold, checked against a field (D-94,
// D-139): what PostgreSQL stores as written, in each scalar type.
import type { ScalarType } from './adapter.ts'
import { decimalIssue } from './decimal.ts'
import { InvalidQuery } from './errors.ts'
import type { FieldInfo } from './schema.ts'

export type Scalar = Extract<FieldInfo, { readonly kind: 'scalar' }>

/** What a scalar value is checked against (D-139). */
export type ScalarCheck = Pick<
	Scalar,
	'type' | 'list' | 'integer' | 'values' | 'precision' | 'scale'
>

/** An integer field's values (D-132). */
export const isInteger = (value: unknown): boolean =>
	Number.isInteger(value) &&
	Number(value) >= -2_147_483_648 &&
	Number(value) <= 2_147_483_647

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

export const cleanText = (value: unknown, at: string): string => {
	if (typeof value === 'string' && clean(value)) return value
	throw new InvalidQuery(at, `${at} must be a clean string.`)
}

/** A date of years 1 to 9999 in UTC, which PostgreSQL reads back (D-94). */
export const storedDate = (value: unknown): value is Date => {
	const year = value instanceof Date ? value.getUTCFullYear() : Number.NaN
	return year >= 1 && year <= 9999
}

/** A real day of years 1 to 9999, written `'2026-07-31'` (D-150). */
export function isDay(value: unknown): boolean {
	const match =
		typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
	if (!match) return false
	const [year = 0, month = 0, day = 0] = match.slice(1).map(Number)
	const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
	const days =
		month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31
	return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days
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

export const integerRange = 'from -2,147,483,648 to 2,147,483,647'

/** Each scalar type's check, and its message when a value does not fit. */
const misfits: {
	readonly [T in ScalarType]: (
		value: unknown,
		field: ScalarCheck,
	) => string | undefined
} = {
	string: (value) => {
		if (typeof value !== 'string') return 'Expected a string.'
		return clean(value)
			? undefined
			: 'Expected a string without a NUL or a lone surrogate.'
	},
	number: (value, field) => {
		if (field.integer !== true) {
			return typeof value === 'number' && Number.isFinite(value)
				? undefined
				: 'Expected a finite number.'
		}
		return isInteger(value)
			? undefined
			: `Expected a whole number ${integerRange}.`
	},
	decimal: decimalIssue,
	boolean: (value) =>
		typeof value === 'boolean' ? undefined : 'Expected a boolean.',
	dateTime: (value) =>
		storedDate(value) ? undefined : 'Expected a Date of years 1 to 9999.',
	date: (value) =>
		isDay(value) ? undefined : "Expected a day written '2026-07-31'.",
	json: (value) =>
		isJson(value)
			? undefined
			: 'Expected JSON data, its strings without a NUL or a lone surrogate.',
	enum: (value, field) =>
		typeof value === 'string' && (field.values ?? []).includes(value)
			? undefined
			: `Expected one of ${(field.values ?? []).join(', ')}.`,
}

/** The message of a value that does not fit `field`, if it does not. */
export const misfit = (
	value: unknown,
	field: ScalarCheck,
): string | undefined => misfits[field.type](value, field)
