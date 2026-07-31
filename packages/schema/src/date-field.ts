import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	ValidatedFieldOptions,
} from './field.js'
import {
	compareCanonicalTemporalValues,
	normalizeTemporalValidation,
	type TemporalRangeValidationOptions,
	type TemporalValidationOptions,
} from './temporal-field.js'

type EmptyDateFieldOptions = Readonly<Record<PropertyKey, never>>

/**
 * Defines declarative calendar-day boundaries.
 */
export type DateRangeValidationOptions = TemporalRangeValidationOptions

/**
 * Groups presence and calendar-day constraints under one validation boundary.
 */
export type DateValidationOptions = TemporalValidationOptions

/**
 * Describes a calendar day using its canonical ISO date representation.
 */
export type DateFieldOptions = FieldOptions<string, DateValidationOptions>

/**
 * Carries a calendar-day string and exact options through schema inference.
 */
export type DateField<TOptions extends DateFieldOptions = DateFieldOptions> =
	FieldDefinition<'date', string, TOptions>

const emptyDateFieldOptions: EmptyDateFieldOptions = immutableRecord({})

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/u

const normalizeCalendarDate = (value: unknown, path: string): string => {
	if (typeof value !== 'string') {
		throw new TypeError(`${path} must be a calendar date string`)
	}

	if (path === 'default' && value === 'today') {
		return value
	}

	const timestamp = Date.parse(`${value}T00:00:00.000Z`)
	if (
		!calendarDatePattern.test(value) ||
		!Number.isFinite(timestamp) ||
		new Date(timestamp).toISOString().slice(0, 10) !== value
	) {
		throw new RangeError(`${path} must be a valid calendar date string`)
	}

	return value
}

const normalizeDateValidation = (
	validation: DateValidationOptions,
): Readonly<DateValidationOptions> =>
	normalizeTemporalValidation(
		validation,
		normalizeCalendarDate,
		compareCanonicalTemporalValues,
	)

const normalizeDateFieldOptions = (
	options: DateFieldOptions,
): Readonly<DateFieldOptions> =>
	normalizeFieldOptions(options, normalizeDateValidation, normalizeCalendarDate)

/**
 * Creates an optional calendar-day field with no additional metadata.
 */
export function dateField(): DateField<EmptyDateFieldOptions>

/**
 * Creates immutable calendar-day metadata while preserving every option literal.
 */
export function dateField<const TOptions extends DateFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, string> extends never
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
