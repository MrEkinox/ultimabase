import { assertOptionalBoolean, immutableRecord } from '@ultimabase/shared'

import { normalizeOrderedRange, type OrderedRange } from './range.js'

export type NumericRangeValue = bigint | number

/** Defines the common shape used by length and numeric value ranges. */
export type NumericRange<TValue extends NumericRangeValue = number> =
	OrderedRange<TValue>

/**
 * Provides the common range contract reused by exact numeric field kinds.
 */
export interface NumericValidationOptions<
	TValue extends NumericRangeValue = number,
> {
	/**
	 * Restricts numeric values with inclusive `min` and `max` boundaries.
	 *
	 * @example `range: { min: lowerBoundary, max: upperBoundary }`
	 */
	readonly range?: NumericRange<TValue>
}

type NumericBoundaryValidator = (value: unknown) => boolean

/** Validates sequence metadata shared by exact integer field kinds. */
export const assertAutoIncrementOption = (options: object): void => {
	if ('autoIncrement' in options) {
		assertOptionalBoolean(options.autoIncrement, 'autoIncrement')
	}
}

/**
 * Copies numeric validation metadata while enforcing one field kind's precision.
 */
export const normalizeNumericValidation = <
	TValue extends NumericRangeValue,
	const TValidation extends NumericValidationOptions<TValue>,
>(
	validation: TValidation,
	expectation: string,
	isValidBoundary: NumericBoundaryValidator,
): Readonly<TValidation> => {
	const { range } = validation

	if (range === undefined) {
		return immutableRecord(validation)
	}

	const normalizeBoundary = (value: TValue, path: string): TValue => {
		if (!isValidBoundary(value)) {
			throw new RangeError(`${path} must be ${expectation}`)
		}

		return value
	}

	// Nested ranges are detached before the complete validation record is frozen.
	return immutableRecord({
		...validation,
		range: normalizeOrderedRange(
			range,
			'validation.range',
			normalizeBoundary,
			(left, right) => (left < right ? -1 : left > right ? 1 : 0),
		),
	})
}
