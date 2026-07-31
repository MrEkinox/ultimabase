import { assertOptionalBoolean, immutableRecord } from '@ultimabase/shared'

import type { FieldValidationOptions } from '../base/contract.js'
import {
	normalizeOrderedRange,
	type OrderedRange,
	type RangeValueComparator,
} from './range.js'

/**
 * Defines ordered string boundaries shared by temporal field kinds.
 */
export type TemporalRangeValidationOptions = OrderedRange<string>

/**
 * Groups presence rules with an optional ordered temporal range.
 */
export type TemporalValidationOptions = FieldValidationOptions & {
	readonly range?: TemporalRangeValidationOptions
}

export type TemporalValueNormalizer = (value: unknown, path: string) => string
export type TemporalValueComparator = RangeValueComparator<string>

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

	return immutableRecord({
		...validation,
		range: normalizeOrderedRange(
			range,
			'validation.range',
			normalizeValue,
			compareValues,
		),
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
	assertOptionalBoolean(timezone, 'timezone')

	return timezone ?? defaultValue
}
