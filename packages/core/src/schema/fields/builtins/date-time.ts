import type {
	FieldDefinition,
	FieldInferenceState,
	FieldListOption,
	InvalidOptionsArguments,
} from '../base/contract.js'
import {
	type CompactScalarFieldDefinition,
	type CompatibleGeneratedScalarOptions,
	createConfiguredGeneratedCompactScalarFieldFactory,
	type DefaultedCompactScalarFieldOptions,
	type GeneratedScalarOption,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import {
	createTemporalFieldConfigurationResolver,
	type TemporalRangeValidationOptions,
	type TemporalValidationOptions,
	type TemporalValueComparator,
	type TimezoneTemporalFieldOptions,
} from '../constraints/temporal.js'

/**
 * Defines ordered date-time boundaries using the field's timezone policy.
 */
export type DateTimeRangeValidationOptions = TemporalRangeValidationOptions

/**
 * Groups presence and date-time constraints under one validation boundary.
 */
export type DateTimeValidationOptions = TemporalValidationOptions

/**
 * Describes a date and time with timezone support enabled by default.
 */
export type DateTimeFieldOptions = TimezoneTemporalFieldOptions

/**
 * Carries a date-time string and exact options through schema inference.
 */
export type DateTimeField<
	TInference extends FieldInferenceState = FieldInferenceState,
> = FieldDefinition<'dateTime', string, DateTimeFieldOptions, TInference>

/** Provides date-time-specific names for compact auto-now inference. */
type DefaultedDateTimeFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = DefaultedCompactScalarFieldOptions<
	DateTimeFieldOptions,
	string,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>
>

type NonDefaultedDateTimeFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	DateTimeFieldOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>
>

type ResolvedDateTimeField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
	TAutoNow extends boolean,
> = CompactScalarFieldDefinition<
	'dateTime',
	string,
	DateTimeFieldOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	THasDefault,
	TAutoNow
>

type DefaultedDateTimeField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = ResolvedDateTimeField<
	TRequired,
	TNullable,
	TList,
	TImmutable,
	true,
	TAutoNow
>

type NonDefaultedDateTimeField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = ResolvedDateTimeField<
	TRequired,
	TNullable,
	TList,
	TImmutable,
	false,
	TAutoNow
>

interface DateTimeFieldFactory {
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
	>(
		options: DefaultedDateTimeFieldOptions<
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
	): DefaultedDateTimeField<TRequired, TNullable, TList, TImmutable, TAutoNow>
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
	>(
		options?: NonDefaultedDateTimeFieldOptions<
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
	): NonDefaultedDateTimeField<
		TRequired,
		TNullable,
		TList,
		TImmutable,
		TAutoNow
	>
}

const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/u
const timezoneSuffixPattern = /(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/u

const hasValidLocalDateTime = (value: string): boolean => {
	const timestamp = Date.parse(`${value}Z`)

	return (
		localDateTimePattern.test(value) &&
		Number.isFinite(timestamp) &&
		new Date(timestamp).toISOString() === `${value}Z`
	)
}

/**
 * Creates the scalar normalizer shared by direct and structured date-time defaults.
 */
export const createDateTimeNormalizer = (
	timezone: boolean,
): ((value: unknown, path: string) => string) => {
	const expectation = timezone
		? 'a complete ISO date-time string with a timezone'
		: 'a complete ISO date-time string without a timezone'

	return (value, path) => {
		if (typeof value !== 'string') {
			throw new TypeError(`${path} must be ${expectation}`)
		}

		const localValue = timezone
			? value.replace(timezoneSuffixPattern, '')
			: value
		const validTimezone = !timezone || localValue.length !== value.length
		const timestamp = timezone ? Date.parse(value) : Date.parse(`${value}Z`)

		if (
			!validTimezone ||
			!hasValidLocalDateTime(localValue) ||
			!Number.isFinite(timestamp)
		) {
			throw new RangeError(`${path} must be ${expectation}`)
		}

		return value
	}
}

/** Compares normalized zoned date-times by their represented instants. */
export const compareZonedDateTimeValues: TemporalValueComparator = (
	left,
	right,
) => Date.parse(left) - Date.parse(right)

const resolveDateTimeFieldConfiguration =
	createTemporalFieldConfigurationResolver<DateTimeFieldOptions>(
		true,
		createDateTimeNormalizer,
		compareZonedDateTimeValues,
	)

/**
 * Declares a complete millisecond-precision date and time, with a timezone by default.
 *
 * @example
 * ```ts
 * dateTimeField({ autoNow: true })
 * ```
 */
export const dateTimeField: DateTimeFieldFactory =
	createConfiguredGeneratedCompactScalarFieldFactory<
		'dateTime',
		string,
		DateTimeFieldOptions,
		'autoNow',
		true
	>('dateTime', resolveDateTimeFieldConfiguration)
