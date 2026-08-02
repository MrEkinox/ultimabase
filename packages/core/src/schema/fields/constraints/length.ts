import { immutableRecord } from '@ultimabase/shared'

import type { FieldValidationOptions } from '../base/contract.js'
import type { NumericRange } from './numeric.js'
import { normalizeOrderedRange } from './range.js'

/**
 * Defines non-negative safe-integer length boundaries.
 */
export type LengthValidationOptions = NumericRange

/**
 * Extends presence rules with an optional length range.
 */
export interface LengthConstrainedValidation extends FieldValidationOptions {
	/**
	 * Restricts string characters or binary bytes with inclusive `min` and `max` boundaries.
	 *
	 * @example `length: { min: 2, max: 120 }`
	 */
	readonly length?: LengthValidationOptions
}

const normalizeLength = (value: number, path: string): number => {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`${path} must be a non-negative safe integer`)
	}

	return value
}

/**
 * Normalizes length metadata shared by strings and byte sequences.
 */
export const normalizeLengthValidation = <
	const TValidation extends LengthConstrainedValidation,
>(
	validation: TValidation,
): Readonly<TValidation> => {
	const { length } = validation

	// Nested length metadata is copied before the containing validation object is frozen.
	return length === undefined
		? immutableRecord(validation)
		: immutableRecord({
				...validation,
				length: normalizeOrderedRange(
					length,
					'validation.length',
					normalizeLength,
					(left, right) => left - right,
				),
			})
}
