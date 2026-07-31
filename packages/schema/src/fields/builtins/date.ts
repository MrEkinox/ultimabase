import { normalizeFieldOptions } from '../base/options.js'
import type { FieldDefinition, FieldOptions } from '../base/contract.js'
import {
	createScalarFieldFactory,
	type ScalarFieldFactory,
} from '../base/factory.js'
import {
	compareCanonicalTemporalValues,
	normalizeTemporalValidation,
	type TemporalRangeValidationOptions,
	type TemporalValidationOptions,
} from '../constraints/temporal.js'

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

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/u

/**
 * Normalizes canonical date defaults and boundaries for direct and structured fields.
 */
export const normalizeCalendarDate = (value: unknown, path: string): string => {
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

const normalizeDateFieldOptions = <const TOptions extends DateFieldOptions>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(options, normalizeDateValidation, normalizeCalendarDate)

/** Creates immutable calendar-day metadata with canonical value snapshots. */
export const dateField: ScalarFieldFactory<'date', string, DateFieldOptions> =
	createScalarFieldFactory(
		'date',
		normalizeDateFieldOptions,
		normalizeCalendarDate,
	)
