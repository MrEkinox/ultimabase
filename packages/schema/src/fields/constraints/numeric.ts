import { immutableRecord } from '@ultimabase/shared'

import type { FieldValidationOptions } from '../base/contract.js'
export type NumericRangeBoundary = 'min' | 'max'

export type NumericRangeValue = bigint | number

/** Defines the common shape used by length and numeric value ranges. */
export interface NumericRange<TValue extends NumericRangeValue = number> {
	readonly min?: TValue
	readonly max?: TValue
}

/** Validates, orders, and freezes a range without deciding boundary semantics. */
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

/**
 * Provides the common range contract reused by exact numeric field kinds.
 */
export type NumericValidationOptions<
	TValue extends NumericRangeValue = number,
> = FieldValidationOptions & {
	readonly range?: NumericRange<TValue>
}

type NumericBoundaryValidator = (value: unknown) => boolean

/** Validates sequence metadata shared by exact integer field kinds. */
export const assertAutoIncrementOption = (options: object): void => {
	if (
		'autoIncrement' in options &&
		options.autoIncrement !== undefined &&
		typeof options.autoIncrement !== 'boolean'
	) {
		throw new TypeError('autoIncrement must be a boolean')
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
