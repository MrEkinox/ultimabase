import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
	ValidatedFieldOptions,
} from './field.js'

type EmptyDateFieldOptions = Readonly<Record<PropertyKey, never>>

/**
 * Defines declarative server-side Date boundaries.
 */
export interface DateRangeValidationOptions {
	readonly min?: Date
	readonly max?: Date
}

/**
 * Groups presence and Date constraints under one validation boundary.
 */
export type DateValidationOptions = FieldValidationOptions & {
	readonly range?: DateRangeValidationOptions
}

/**
 * Describes Date metadata without introducing transport serialization.
 */
export type DateFieldOptions = FieldOptions<Date, DateValidationOptions>

/**
 * Carries the server-side Date type and exact options through schema inference.
 */
export type DateField<TOptions extends DateFieldOptions = DateFieldOptions> =
	FieldDefinition<'date', Date, TOptions>

const emptyDateFieldOptions: EmptyDateFieldOptions = immutableRecord({})

const snapshotDate = (value: unknown, path: string): Date => {
	if (!(value instanceof Date)) {
		throw new TypeError(`${path} must be a Date`)
	}

	const timestamp = value.getTime()

	if (!Number.isFinite(timestamp)) {
		throw new RangeError(`${path} must be a valid Date`)
	}

	// A snapshot prevents later mutations of the caller-owned Date from changing metadata.
	return Object.freeze(new Date(timestamp))
}

const normalizeDateRange = (
	range: DateRangeValidationOptions,
): Readonly<DateRangeValidationOptions> => {
	const min =
		range.min === undefined
			? undefined
			: snapshotDate(range.min, 'validation.range.min')
	const max =
		range.max === undefined
			? undefined
			: snapshotDate(range.max, 'validation.range.max')

	if (min !== undefined && max !== undefined && min.getTime() > max.getTime()) {
		throw new RangeError(
			'validation.range.min cannot be greater than validation.range.max',
		)
	}

	// Conditional spreads retain absent boundaries while replacing supplied Dates.
	return immutableRecord({
		...range,
		...(min === undefined ? {} : { min }),
		...(max === undefined ? {} : { max }),
	})
}

const normalizeDateValidation = (
	validation: DateValidationOptions,
): Readonly<DateValidationOptions> =>
	validation.range === undefined
		? immutableRecord(validation)
		: immutableRecord({
				...validation,
				range: normalizeDateRange(validation.range),
			})

const normalizeDateFieldOptions = (
	options: DateFieldOptions,
): Readonly<DateFieldOptions> =>
	normalizeFieldOptions(options, normalizeDateValidation, snapshotDate)

/**
 * Creates an optional, non-null Date field with no additional metadata.
 */
export function dateField(): DateField<EmptyDateFieldOptions>

/**
 * Creates immutable Date metadata while preserving every option literal.
 */
export function dateField<const TOptions extends DateFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, Date> extends never
			? never
			: unknown),
): DateField<TOptions>

export function dateField(
	options: DateFieldOptions = emptyDateFieldOptions,
): DateField {
	return immutableRecord({
		kind: 'date',
		options: normalizeDateFieldOptions(options),
	})
}
