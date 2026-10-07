/** Numeric scalar representations supported by built-in arithmetic updates. */
type NumericUpdateOperand = bigint | number | string

type NumericUpdateKind = 'decrement' | 'increment'

/**
 * Carries an arithmetic update without confusing similarly shaped field data
 * for an operation. The class stays private so values can only come from the
 * public factories.
 */
class NumericUpdateValue<TKind extends NumericUpdateKind, TValue> {
	readonly #brand = true

	readonly kind: TKind
	readonly value: TValue

	constructor(kind: TKind, value: TValue) {
		this.kind = kind
		this.value = value
		Object.freeze(this)
	}

	static is(value: unknown): value is NumericUpdateOperationValue {
		return value instanceof NumericUpdateValue && value.#brand
	}
}

/** An immutable value returned by {@link increment}. */
export type IncrementUpdateValue<TValue> = NumericUpdateValue<
	'increment',
	TValue
>

/** An immutable value returned by {@link decrement}. */
export type DecrementUpdateValue<TValue> = NumericUpdateValue<
	'decrement',
	TValue
>

export type NumericUpdateOperationValue =
	| IncrementUpdateValue<NumericUpdateOperand>
	| DecrementUpdateValue<NumericUpdateOperand>

/**
 * Adds a delta to a scalar numeric field.
 *
 * @example
 * ```ts
 * data: { views: increment(2) }
 * ```
 */
export const increment = <const TValue extends NumericUpdateOperand>(
	value: TValue,
): IncrementUpdateValue<TValue> => new NumericUpdateValue('increment', value)

/**
 * Subtracts a delta from a scalar numeric field.
 *
 * @example
 * ```ts
 * data: { stock: decrement(1) }
 * ```
 */
export const decrement = <const TValue extends NumericUpdateOperand>(
	value: TValue,
): DecrementUpdateValue<TValue> => new NumericUpdateValue('decrement', value)

/**
 * Explicitly clears an optional field. This is exactly equivalent to `null`.
 *
 * @example
 * ```ts
 * data: { summary: unset() }
 * ```
 */
export const unset = (): null => null

/** Protects object-valued fields from shape-based operation detection. */
export const isNumericUpdateOperationValue = (
	value: unknown,
): value is NumericUpdateOperationValue => NumericUpdateValue.is(value)
