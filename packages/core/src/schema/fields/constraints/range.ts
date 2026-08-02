import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Describes one optional ordered interval without assigning value semantics. */
export interface OrderedRange<TValue> {
	/**
	 * Accepts values greater than or equal to this inclusive lower boundary.
	 *
	 * @example `min: lowerBoundary`
	 */
	readonly min?: TValue
	/**
	 * Accepts values less than or equal to this inclusive upper boundary.
	 *
	 * @example `max: upperBoundary`
	 */
	readonly max?: TValue
}

export type RangeBoundaryNormalizer<TValue> = (
	value: TValue,
	path: string,
) => TValue

export type RangeValueComparator<TValue> = (
	left: TValue,
	right: TValue,
) => number

/**
 * Validates, orders, copies, and freezes range metadata through one shared
 * boundary while field kinds retain their exact value semantics.
 */
export const normalizeOrderedRange = <
	TValue,
	const TRange extends OrderedRange<TValue>,
>(
	range: TRange,
	path: string,
	normalizeBoundary: RangeBoundaryNormalizer<TValue>,
	compareValues: RangeValueComparator<TValue>,
): Readonly<TRange> => {
	if (!isPlainRecord(range)) {
		throw new TypeError(`${path} must be an object`)
	}

	const { min, max } = range
	const normalizedMin =
		min === undefined ? undefined : normalizeBoundary(min, `${path}.min`)
	const normalizedMax =
		max === undefined ? undefined : normalizeBoundary(max, `${path}.max`)

	if (
		normalizedMin !== undefined &&
		normalizedMax !== undefined &&
		compareValues(normalizedMin, normalizedMax) > 0
	) {
		throw new RangeError(`${path}.min cannot be greater than ${path}.max`)
	}

	// Normalized values replace caller-owned boundaries while omission stays exact.
	return immutableRecord({
		...range,
		...(normalizedMin === undefined ? {} : { min: normalizedMin }),
		...(normalizedMax === undefined ? {} : { max: normalizedMax }),
	})
}
