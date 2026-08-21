import type {
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
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
import type { FieldStandardSchema } from '../base/standard-schema.js'

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
}

/** Provides time-specific names for compact auto-now inference. */
type DefaultedTimeFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
	TValidation extends FieldStandardSchema,
> = DefaultedCompactScalarFieldOptions<
	TimeFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>,
	TValidation
> &
	CompatibleGeneratedScalarOptions<'autoNow', TAutoNow, TList, true, true>

type NonDefaultedTimeFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
	TValidation extends FieldStandardSchema,
> = NonDefaultedCompactScalarFieldOptions<
	TimeFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoNow', TAutoNow>,
	TValidation
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
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options: DefaultedTimeFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TAutoNow,
			TValidation
		>,
	): DefaultedTimeField<TRequired, TList, TImmutable, TAutoNow>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options?: NonDefaultedTimeFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TAutoNow,
			TValidation
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

const resolveTimeFieldConfiguration =
	createTemporalFieldConfigurationResolver<TimeFieldOptions>(
		timeFieldOptionsContract,
		false,
		createTimeNormalizer,
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
