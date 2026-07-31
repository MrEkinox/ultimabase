import { immutableRecord } from '@ultimabase/shared'

import type { FieldValidationOptions } from './field.js'
import {
	normalizeNumericRange,
	type NumericRange,
	type NumericRangeBoundary,
} from './numeric-range.js'

/**
 * Provides the common range contract reused by exact numeric field kinds.
 */
export type NumericValidationOptions = FieldValidationOptions & {
	readonly range?: NumericRange
}

type NumericBoundaryValidator = (value: number) => boolean

/**
 * Copies numeric validation metadata while enforcing one field kind's precision.
 */
export const normalizeNumericValidation = <
	const TValidation extends NumericValidationOptions,
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
		value: number | undefined,
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
