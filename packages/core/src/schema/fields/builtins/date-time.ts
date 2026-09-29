import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
	ResolvedFieldSourceOptions,
} from '../base/contract.js'
import {
	fieldOptionKeys,
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
	type TimezoneTemporalFieldOptions,
} from '../constraints/temporal.js'

/**
 * Describes a date and time with timezone support enabled by default.
 */
export type DateTimeFieldOptions = TimezoneTemporalFieldOptions

/**
 * Carries a date-time string and exact options through schema inference.
 */
export type DateTimeField<
	TTypegen extends FieldTypegenState = FieldTypegenState,
> = FieldDefinition<'dateTime', string, DateTimeFieldOptions, TTypegen>

const dateTimeFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'dateTime',
	optionKeys: [...fieldOptionKeys, 'autoNow', 'timezone'],
}

/** Provides date-time-specific names for compact auto-now inference. */
type DefaultedDateTimeFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = DefaultedCompactScalarFieldOptions<
	DateTimeFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>
> &
	CompatibleGeneratedScalarOptions<'autoNow', TAutoNow, TList, true, true>

type NonDefaultedDateTimeFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	DateTimeFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>
> &
	CompatibleGeneratedScalarOptions<'autoNow', TAutoNow, TList, false, true>

type ResolvedDateTimeField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
	TAutoNow extends boolean,
> = CompactScalarFieldDefinition<
	'dateTime',
	string,
	DateTimeFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault,
	TAutoNow
>

type DefaultedDateTimeField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = ResolvedDateTimeField<TRequired, TList, TImmutable, true, TAutoNow>

type NonDefaultedDateTimeField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = ResolvedDateTimeField<TRequired, TList, TImmutable, false, TAutoNow>

export interface DateTimeFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedDateTimeFieldOptions<TRequired, TList, TImmutable, TAutoNow>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): DefaultedDateTimeField<TRequired, TList, TImmutable, TAutoNow>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedDateTimeFieldOptions<TRequired, TList, TImmutable, TAutoNow>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): NonDefaultedDateTimeField<TRequired, TList, TImmutable, TAutoNow>
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

const resolveDateTimeFieldConfiguration =
	createTemporalFieldConfigurationResolver<DateTimeFieldOptions>(
		dateTimeFieldOptionsContract,
		true,
		createDateTimeNormalizer,
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
