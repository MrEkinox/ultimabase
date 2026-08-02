import { normalizeFieldOptions } from '../base/options.js'
import type {
	FieldDefinition,
	FieldInferenceState,
	FieldListOption,
	InvalidOptionsArguments,
} from '../base/contract.js'
import {
	type CompactScalarFieldDefinition,
	type CompatibleGeneratedScalarOptions,
	createGeneratedCompactScalarFieldFactory,
	type DefaultedCompactScalarFieldOptions,
	type GeneratedScalarOption,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import {
	compareCanonicalTemporalValues,
	normalizeTemporalValidation,
	assertTemporalAutoNow,
	type TemporalFieldOptions,
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
export type DateFieldOptions = TemporalFieldOptions

/**
 * Carries a calendar-day string and exact options through schema inference.
 */
export type DateField<
	TInference extends FieldInferenceState = FieldInferenceState,
> = FieldDefinition<'date', string, DateFieldOptions, TInference>

/** Provides date-specific names for compact auto-now inference. */
type DefaultedDateFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = DefaultedCompactScalarFieldOptions<
	DateFieldOptions,
	string,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>
>

type NonDefaultedDateFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	DateFieldOptions,
	string,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>
>

type ResolvedDateField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
	TAutoNow extends boolean,
> = CompactScalarFieldDefinition<
	'date',
	string,
	DateFieldOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	THasDefault,
	TAutoNow
>

type DefaultedDateField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = ResolvedDateField<TRequired, TNullable, TList, TImmutable, true, TAutoNow>

type NonDefaultedDateField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = ResolvedDateField<TRequired, TNullable, TList, TImmutable, false, TAutoNow>

interface DateFieldFactory {
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
	>(
		options: DefaultedDateFieldOptions<
			TRequired,
			TNullable,
			TList,
			TImmutable,
			TAutoNow
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleGeneratedScalarOptions<
				TRequired,
				TNullable,
				TAutoNow,
				TList,
				true,
				true
			>
		>
	): DefaultedDateField<TRequired, TNullable, TList, TImmutable, TAutoNow>
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
	>(
		options?: NonDefaultedDateFieldOptions<
			TRequired,
			TNullable,
			TList,
			TImmutable,
			TAutoNow
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleGeneratedScalarOptions<
				TRequired,
				TNullable,
				TAutoNow,
				TList,
				false,
				true
			>
		>
	): NonDefaultedDateField<TRequired, TNullable, TList, TImmutable, TAutoNow>
}

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/u

/**
 * Normalizes canonical date defaults and boundaries for direct and structured fields.
 */
export const normalizeCalendarDate = (value: unknown, path: string): string => {
	if (typeof value !== 'string') {
		throw new TypeError(`${path} must be a calendar date string`)
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
): Readonly<TOptions> => {
	assertTemporalAutoNow(options)

	return normalizeFieldOptions(
		options,
		normalizeDateValidation,
		normalizeCalendarDate,
	)
}

/**
 * Declares a calendar day in canonical `YYYY-MM-DD` form without a time of day.
 *
 * @example
 * ```ts
 * dateField({ default: "2026-08-01" })
 * ```
 */
export const dateField: DateFieldFactory =
	createGeneratedCompactScalarFieldFactory<
		'date',
		string,
		DateFieldOptions,
		'autoNow',
		true
	>('date', normalizeDateFieldOptions, normalizeCalendarDate)
