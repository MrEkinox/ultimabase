import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
	ResolvedFieldSourceOptions,
} from '../base/contract.js'
import {
	type CompactScalarField,
	createScalarFieldFactory,
	type DefaultedGeneratedScalarFieldOptions,
	type NonDefaultedGeneratedScalarFieldOptions,
	type ScalarFieldDescriptor,
} from '../base/factory.js'
import {
	assertTemporalAutoNow,
	createTemporalNormalizer,
	readTemporalTimezone,
	type TimezoneTemporalFieldOptions,
} from '../constraints/temporal.js'

/**
 * Describes a time of day without timezone support by default.
 */
export type TimeFieldOptions = TimezoneTemporalFieldOptions

/**
 * Carries a time-of-day string and exact options through schema inference.
 */
export type TimeField<TTypegen extends FieldTypegenState = FieldTypegenState> =
	FieldDefinition<'time', string, TimeFieldOptions, TTypegen>

/** Provides time-specific names for compact auto-now inference. */
type DefaultedTimeFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = DefaultedGeneratedScalarFieldOptions<
	TimeFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	'autoNow',
	TAutoNow,
	true
>

type NonDefaultedTimeFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = NonDefaultedGeneratedScalarFieldOptions<
	TimeFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	'autoNow',
	TAutoNow,
	true
>

type TimeScalar = ScalarFieldDescriptor<'time', string, TimeFieldOptions>

type DefaultedTimeField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = CompactScalarField<TimeScalar, TRequired, TList, TImmutable, true, TAutoNow>

type NonDefaultedTimeField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoNow extends boolean,
> = CompactScalarField<
	TimeScalar,
	TRequired,
	TList,
	TImmutable,
	false,
	TAutoNow
>

export interface TimeFieldFactory<
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
			DefaultedTimeFieldOptions<TRequired, TList, TImmutable, TAutoNow>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): DefaultedTimeField<TRequired, TList, TImmutable, TAutoNow>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoNow extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedTimeFieldOptions<TRequired, TList, TImmutable, TAutoNow>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
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
	const pattern = timezone ? zonedTimePattern : localTimePattern

	return createTemporalNormalizer(
		`a complete ISO time string ${timezone ? 'with' : 'without'} a timezone`,
		(value) => pattern.test(value),
	)
}

/**
 * Declares a millisecond-precision time of day, without a timezone by default.
 *
 * @example
 * ```ts
 * timeField({ timezone: true, default: "08:30:00.000+02:00" })
 * ```
 */
export const timeField: TimeFieldFactory = createScalarFieldFactory(
	'time',
	createTimeNormalizer(false),
	{
		optionKeys: ['autoNow', 'timezone'],
		assertOptions: assertTemporalAutoNow,
		resolveSnapshot: (options) =>
			createTimeNormalizer(readTemporalTimezone(options.timezone, false)),
	},
)
