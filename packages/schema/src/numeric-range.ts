import { immutableRecord } from '@ultimabase/shared'

export type NumericRangeBoundary = 'min' | 'max'

/**
 * Defines the common shape used by length and numeric value ranges.
 */
export interface NumericRange {
	readonly min?: number
	readonly max?: number
}

/**
 * Validates, orders, and freezes a numeric range without deciding boundary semantics.
 */
export const normalizeNumericRange = <const TRange extends NumericRange>(
	range: TRange,
	path: string,
	assertValidBoundary: (
		name: NumericRangeBoundary,
		value: number | undefined,
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
