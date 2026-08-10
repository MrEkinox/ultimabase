import type {
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
} from '../base/contract.js'
import {
	fieldOptionKeys,
	fieldValidationOptionKeys,
	orderedRangeOptionKeys,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'
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
 * Defines ordered time-of-day boundaries using the field's timezone policy.
 */
export type TimeRangeValidationOptions = TemporalRangeValidationOptions

/**
 * Groups presence and time-of-day constraints under one validation boundary.
 */
export type TimeValidationOptions = TemporalValidationOptions

/**
 * Describes a time of day without timezone support by default.
 */
export type TimeFieldOptions = TimezoneTemporalFieldOptions

/**
 * Carries a time-of-day string and exact options through schema inference.
 */
export type TimeField<TTypegen extends FieldTypegenState = FieldTypegenState> =
	FieldDefinition<'time', string, TimeFieldOptions, TTypegen>

const timeFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'time',
	optionKeys: [...fieldOptionKeys, 'autoNow', 'timezone'],
	validationOptionKeys: [...fieldValidationOptionKeys, 'range'],
	nestedValidation: [{ key: 'range', optionKeys: orderedRangeOptionKeys }],
}

/** Provides time-specific names for compact auto-now inference. */
type DefaultedTimeFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = DefaultedCompactScalarFieldOptions<
	TimeFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>
> &
	CompatibleGeneratedScalarOptions<'autoNow', TAutoNow, TList, true, true>

type NonDefaultedTimeFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	TimeFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>
> &
	CompatibleGeneratedScalarOptions<'autoNow', TAutoNow, TList, false, true>

type ResolvedTimeField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
	TAutoNow extends boolean,
> = CompactScalarFieldDefinition<
	'time',
	string,
	TimeFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault,
	TAutoNow
>

type DefaultedTimeField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = ResolvedTimeField<TRequired, TList, TImmutable, true, TAutoNow>

type NonDefaultedTimeField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = ResolvedTimeField<TRequired, TList, TImmutable, false, TAutoNow>

interface TimeFieldFactory {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
	>(
		options: DefaultedTimeFieldOptions<TRequired, TList, TImmutable, TAutoNow>,
	): DefaultedTimeField<TRequired, TList, TImmutable, TAutoNow>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
	>(
		options?: NonDefaultedTimeFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TAutoNow
		>,
	): NonDefaultedTimeField<TRequired, TList, TImmutable, TAutoNow>
}

const localTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}$/u
const zonedTimePattern =
	/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/u

/**
 * Creates the scalar normalizer shared by direct and structured time defaults.
 */
export const createTimeNormalizer = (
	timezone: boolean,
): ((value: unknown, path: string) => string) => {
	const expectation = timezone
		? 'a complete ISO time string with a timezone'
		: 'a complete ISO time string without a timezone'
	const pattern = timezone ? zonedTimePattern : localTimePattern

	return (value, path) => {
		if (typeof value !== 'string') {
			throw new TypeError(`${path} must be ${expectation}`)
		}

		if (!pattern.test(value)) {
			throw new RangeError(`${path} must be ${expectation}`)
		}

		return value
	}
}

const readZonedTimeOffset = (value: string): number => {
	const hour = Number(value.slice(0, 2))
	const minute = Number(value.slice(3, 5))
	const second = Number(value.slice(6, 8))
	const millisecond = Number(value.slice(9, 12))
	const timezone = value.slice(12)
	const offsetHour = timezone === 'Z' ? 0 : Number(timezone.slice(1, 3))
	const offsetMinute = timezone === 'Z' ? 0 : Number(timezone.slice(4, 6))
	const offsetDirection = timezone.startsWith('-') ? -1 : 1
	const localMilliseconds =
		((hour * 60 + minute) * 60 + second) * 1_000 + millisecond
	const offsetMilliseconds =
		(offsetHour * 60 + offsetMinute) * 60_000 * offsetDirection

	// Zoned times compare as their UTC-adjusted time-of-day values.
	return localMilliseconds - offsetMilliseconds
}

/** Compares normalized zoned time values by their UTC-adjusted time of day. */
export const compareZonedTimeValues: TemporalValueComparator = (left, right) =>
	readZonedTimeOffset(left) - readZonedTimeOffset(right)

const resolveTimeFieldConfiguration =
	createTemporalFieldConfigurationResolver<TimeFieldOptions>(
		timeFieldOptionsContract,
		false,
		createTimeNormalizer,
		compareZonedTimeValues,
	)

/**
 * Declares a millisecond-precision time of day, without a timezone by default.
 *
 * @example
 * ```ts
 * timeField({ timezone: true, default: "08:30:00.000+02:00" })
 * ```
 */
export const timeField: TimeFieldFactory =
	createConfiguredGeneratedCompactScalarFieldFactory<
		'time',
		string,
		TimeFieldOptions,
		'autoNow',
		true
	>('time', resolveTimeFieldConfiguration)
