import { immutableRecord } from '@ultimabase/shared'

import type { FieldValidationOptions } from '../base/contract.js'
import { normalizeNumericRange, type NumericRange } from './numeric.js'

/**
 * Defines non-negative safe-integer length boundaries.
 */
export type LengthValidationOptions = NumericRange

/**
 * Extends presence rules with an optional length range.
 */
export type LengthConstrainedValidation = FieldValidationOptions & {
	readonly length?: LengthValidationOptions
}

const assertValidLength = (
	name: 'min' | 'max',
	value: number | undefined,
): void => {
	if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
		throw new RangeError(
			`validation.length.${name} must be a non-negative safe integer`,
		)
	}
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
				length: normalizeNumericRange(
					length,
					'validation.length',
					assertValidLength,
				),
			})
}
