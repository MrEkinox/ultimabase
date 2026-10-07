declare const brandMarker: unique symbol

/**
 * Distinguishes values with the same runtime representation at typed boundaries.
 *
 * Validation must happen before a value is asserted as a concrete brand.
 */
export type Brand<TValue, TName extends string> = TValue & {
	readonly [brandMarker]: TName
}

/**
 * Allows hooks and factories to support synchronous and asynchronous implementations.
 */
export type MaybePromise<TValue> = TValue | PromiseLike<TValue>

/**
 * Makes a discriminated-union branch fail both type checking and unexpected runtime input.
 */
export const assertNever = (value: never): never => {
	throw new TypeError(`Unexpected value: ${String(value)}`)
}

/**
 * Copies and freezes an array so later caller mutations cannot cross a public boundary.
 */
export const immutableArray = <const TValues extends readonly unknown[]>(
	values: TValues,
): readonly [...TValues] => Object.freeze([...values])

/**
 * Copies and freezes a record while preserving its literal keys and value types.
 */
export const immutableRecord = <const TRecord extends object>(
	value: TRecord,
): Readonly<TRecord> => Object.freeze({ ...value })

export {
	assertNonEmptyString,
	assertOptionalBoolean,
	isPlainRecord,
	isUnknownArray,
} from './runtime-value.js'
