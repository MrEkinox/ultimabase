import { immutableRecord } from '@ultimabase/shared'

import type { FieldValidationOptions } from './field.js'

/**
 * Defines ordered string boundaries shared by temporal field kinds.
 */
export interface TemporalRangeValidationOptions {
	readonly min?: string
	readonly max?: string
}

/**
 * Groups presence rules with an optional ordered temporal range.
 */
export type TemporalValidationOptions = FieldValidationOptions & {
	readonly range?: TemporalRangeValidationOptions
}

export type TemporalValueNormalizer = (value: unknown, path: string) => string
export type TemporalValueComparator = (left: string, right: string) => number

/**
 * Copies temporal validation metadata while validating and ordering its boundaries.
 */
export const normalizeTemporalValidation = <
	const TValidation extends TemporalValidationOptions,
>(
	validation: TValidation,
	normalizeValue: TemporalValueNormalizer,
	compareValues: TemporalValueComparator,
): Readonly<TValidation> => {
	const { range } = validation

	if (range === undefined) {
		return immutableRecord(validation)
	}

	const min =
		range.min === undefined
			? undefined
			: normalizeValue(range.min, 'validation.range.min')
	const max =
		range.max === undefined
			? undefined
			: normalizeValue(range.max, 'validation.range.max')

	if (min !== undefined && max !== undefined && compareValues(min, max) > 0) {
		throw new RangeError(
			'validation.range.min cannot be greater than validation.range.max',
		)
	}

	// Conditional spreads preserve omitted boundaries in the normalized contract.
	return immutableRecord({
		...validation,
		range: immutableRecord({
			...range,
			...(min === undefined ? {} : { min }),
			...(max === undefined ? {} : { max }),
		}),
	})
}

/**
 * Compares fixed-width canonical temporal strings in chronological order.
 */
export const compareCanonicalTemporalValues: TemporalValueComparator = (
	left,
	right,
) => left.localeCompare(right)

/**
 * Resolves a timezone flag while protecting factories called from untyped code.
 */
export const readTemporalTimezone = (
	timezone: unknown,
	defaultValue: boolean,
): boolean => {
	if (timezone !== undefined && typeof timezone !== 'boolean') {
		throw new TypeError('timezone must be a boolean')
	}

	return timezone ?? defaultValue
}
