import { immutableRecord } from '@ultimabase/shared'

import type { FieldValidationOptions } from './field.js'
import {
	normalizeNumericRange,
	type NumericRange,
	type NumericRangeBoundary,
	type NumericRangeValue,
} from './numeric-range.js'

/**
 * Provides the common range contract reused by exact numeric field kinds.
 */
export type NumericValidationOptions<
	TValue extends NumericRangeValue = number,
> = FieldValidationOptions & {
	readonly range?: NumericRange<TValue>
}

type NumericBoundaryValidator = (value: unknown) => boolean

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

	const assertValidBoundary = (
		name: NumericRangeBoundary,
		value: TValue | undefined,
	): void => {
		if (value !== undefined && !isValidBoundary(value)) {
			throw new RangeError(`validation.range.${name} must be ${expectation}`)
		}
	}

	// Nested ranges are detached before the complete validation record is frozen.
	return immutableRecord({
		...validation,
		range: normalizeNumericRange(
			range,
			'validation.range',
			assertValidBoundary,
		),
	})
}
