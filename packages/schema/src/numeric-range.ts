import { immutableRecord } from '@ultimabase/shared'

export type NumericRangeBoundary = 'min' | 'max'

export type NumericRangeValue = bigint | number

/**
 * Defines the common shape used by length and numeric value ranges.
 */
export interface NumericRange<TValue extends NumericRangeValue = number> {
	readonly min?: TValue
	readonly max?: TValue
}

/**
 * Validates, orders, and freezes a numeric range without deciding boundary semantics.
 */
export const normalizeNumericRange = <
	TValue extends NumericRangeValue,
	const TRange extends NumericRange<TValue>,
>(
	range: TRange,
	path: string,
	assertValidBoundary: (
		name: NumericRangeBoundary,
		value: TValue | undefined,
	) => void,
): Readonly<TRange> => {
	assertValidBoundary('min', range.min)
	assertValidBoundary('max', range.max)

	if (
		range.min !== undefined &&
		range.max !== undefined &&
		range.min > range.max
	) {
		throw new RangeError(`${path}.min cannot be greater than ${path}.max`)
	}

	return immutableRecord(range)
}
